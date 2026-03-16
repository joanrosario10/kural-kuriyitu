/**
 * Gemini Live API — WebSocket bidirectional audio streaming
 * Handles voice conversation with native Gemini audio responses.
 * Code generation is delegated to the text streaming channel (gemini.ts).
 */

export type LiveModel =
  | 'gemini-2.0-flash-live-001'
  | 'gemini-2.5-flash-preview-native-audio-dialog';

export type GeminiVoice = 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Puck';

export type LiveConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LiveApiConfig {
  apiKey: string;
  model: LiveModel;
  voice: GeminiVoice;
  systemPrompt: string;
  proxyUrl?: string; // Optional proxy for production
  onStateChange: (state: LiveConnectionState) => void;
  onAudioOutput: (pcmData: Float32Array) => void;
  onTextResponse: (text: string) => void;
  onCodeRequest: (command: string) => void; // Fired when [CODE_REQUEST: ...] detected
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onInterrupted: () => void;
}

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const LIVE_SYSTEM_PROMPT = `You are JARVIS, the voice assistant for Kural Kuriyitu — a Tamil/English voice-controlled coding IDE.

PERSONALITY: Helpful, concise, proactive. Speak like a brilliant coding partner.
LANGUAGE: Respond in the same language the user speaks (Tamil, Hindi, or English). Code is always English.

WHEN USER ASKS TO CODE:
- Acknowledge briefly ("Creating a login form with validation...")
- Include [CODE_REQUEST: <exact user command>] in your text response
- After code appears in editor, explain what you built (1-2 sentences)

WHEN ASKED TO EXPLAIN:
- Explain the current code clearly and concisely
- Reference specific line numbers when relevant

WHEN PROACTIVE ANALYSIS ARRIVES (via text injection):
- You'll receive code analysis results as text
- Speak the top issue naturally ("I noticed a potential null reference on line 12...")
- Wait for user confirmation before suggesting fixes

VOICE STYLE: Natural, warm, slightly technical. Like a senior developer pair programming.`;

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private config: LiveApiConfig;
  private state: LiveConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private inputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime = 0;
  private textBuffer = '';

  constructor(config: LiveApiConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.setState('connecting');

    try {
      const url = this.config.proxyUrl
        ? `${this.config.proxyUrl}?model=models/${this.config.model}`
        : `${WS_BASE}?key=${this.config.apiKey}`;

      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.sendSetupMessage();
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onerror = () => {
        this.config.onError(new Error('WebSocket connection error'));
      };

      this.ws.onclose = (event) => {
        if (this.state === 'connected' || this.state === 'connecting') {
          this.handleDisconnect(event.code);
        }
      };
    } catch (err) {
      this.setState('disconnected');
      this.config.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.stopAudioInput();
    this.stopAudioOutput();
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  async startAudioInput(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
      this.sourceNode = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

      // Try AudioWorklet first, fall back to ScriptProcessor
      try {
        await this.inputAudioContext.audioWorklet.addModule('/audio-worklet.js');
        this.workletNode = new AudioWorkletNode(this.inputAudioContext, 'pcm-processor');
        this.workletNode.port.onmessage = (event) => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            const pcmData = event.data as Float32Array;
            this.sendAudioChunk(pcmData);
          }
        };
        this.sourceNode.connect(this.workletNode);
        this.workletNode.connect(this.inputAudioContext.destination);
      } catch {
        // Fallback to ScriptProcessor (deprecated but widely supported)
        this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
        this.scriptProcessorNode.onaudioprocess = (event) => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            const pcmData = event.inputBuffer.getChannelData(0);
            this.sendAudioChunk(new Float32Array(pcmData));
          }
        };
        this.sourceNode.connect(this.scriptProcessorNode);
        this.scriptProcessorNode.connect(this.inputAudioContext.destination);
      }
    } catch (err) {
      this.config.onError(
        err instanceof Error ? err : new Error('Failed to access microphone'),
      );
    }
  }

  stopAudioInput(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.disconnect();
      this.scriptProcessorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  sendText(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const message = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };
    this.ws.send(JSON.stringify(message));
  }

  interruptPlayback(): void {
    this.stopAudioOutput();
    this.config.onInterrupted();
  }

  getState(): LiveConnectionState {
    return this.state;
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  updateConfig(partial: Partial<Pick<LiveApiConfig, 'model' | 'voice' | 'systemPrompt'>>): void {
    this.config = { ...this.config, ...partial };
    // Reconnect with new config if currently connected
    if (this.state === 'connected') {
      this.disconnect();
      this.connect();
    }
  }

  // --- Private methods ---

  private setState(state: LiveConnectionState): void {
    this.state = state;
    this.config.onStateChange(state);
  }

  private sendSetupMessage(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const setup = {
      setup: {
        model: `models/${this.config.model}`,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voice,
              },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: this.config.systemPrompt || LIVE_SYSTEM_PROMPT,
            },
          ],
        },
      },
    };

    this.ws.send(JSON.stringify(setup));
  }

  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);

        // Setup complete
        if (msg.setupComplete) {
          this.setState('connected');
          return;
        }

        // Server content (text + audio)
        if (msg.serverContent) {
          const content = msg.serverContent;

          // Model turn parts
          if (content.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              // Audio data
              if (part.inlineData?.mimeType?.startsWith('audio/')) {
                const audioBytes = base64ToFloat32(part.inlineData.data, 24000);
                this.playAudio(audioBytes);
                this.config.onAudioOutput(audioBytes);
              }

              // Text data
              if (part.text) {
                this.textBuffer += part.text;

                // Check for code request marker
                const codeMatch = this.textBuffer.match(/\[CODE_REQUEST:\s*(.*?)\]/);
                if (codeMatch) {
                  this.config.onCodeRequest(codeMatch[1].trim());
                  this.textBuffer = this.textBuffer.replace(/\[CODE_REQUEST:\s*.*?\]/, '');
                }

                this.config.onTextResponse(part.text);
              }
            }
          }

          // Turn complete
          if (content.turnComplete) {
            this.textBuffer = '';
          }

          // Interrupted
          if (content.interrupted) {
            this.stopAudioOutput();
            this.config.onInterrupted();
          }
        }

        // Tool call responses, etc. can be handled here
      }
    } catch (err) {
      this.config.onError(
        err instanceof Error ? err : new Error('Failed to parse WebSocket message'),
      );
    }
  }

  private sendAudioChunk(pcmFloat32: Float32Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const pcmInt16 = float32ToInt16(pcmFloat32);
    const base64 = int16ToBase64(pcmInt16);

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: base64,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  private playAudio(pcmFloat32: Float32Array): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.nextPlayTime = this.audioContext.currentTime;
    }

    const buffer = this.audioContext.createBuffer(1, pcmFloat32.length, 24000);
    buffer.copyToChannel(new Float32Array(pcmFloat32), 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode!);

    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;
  }

  private stopAudioOutput(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.gainNode = null;
      this.nextPlayTime = 0;
    }
  }

  private handleDisconnect(code: number): void {
    this.ws = null;
    this.stopAudioInput();
    this.stopAudioOutput();

    // Normal closure or exceeded retries
    if (code === 1000 || this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('disconnected');
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.config.onError(new Error('Max reconnection attempts exceeded'));
      }
      return;
    }

    // Reconnect with exponential backoff
    this.setState('reconnecting');
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// --- Audio conversion utilities ---

export function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

export function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToFloat32(base64: string, _sampleRate: number): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  return int16ToFloat32(int16);
}

// --- Default export for convenience ---
export const DEFAULT_LIVE_MODEL: LiveModel = 'gemini-2.0-flash-live-001';
export const DEFAULT_VOICE: GeminiVoice = 'Kore';
export { LIVE_SYSTEM_PROMPT };
