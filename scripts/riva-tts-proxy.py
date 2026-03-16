#!/usr/bin/env python3
"""
Local HTTP proxy for NVIDIA Riva TTS (gRPC → HTTP bridge).
Accepts JSON POST requests, calls Riva gRPC, returns WAV audio.

Usage: python scripts/riva-tts-proxy.py
Runs on http://localhost:5174
"""

import json
import io
import wave
import struct
from http.server import HTTPServer, BaseHTTPRequestHandler
import riva.client

RIVA_SERVER = "grpc.nvcf.nvidia.com:443"
FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969"
API_KEY = None  # Set from env or .env file
PORT = 5174

def load_api_key():
    """Load NVIDIA API key from .env file."""
    global API_KEY
    import os
    # Check env var first
    API_KEY = os.environ.get("VITE_NVIDIA_API_KEY", "")
    if API_KEY:
        return
    # Fall back to .env file
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("VITE_NVIDIA_API_KEY="):
                    API_KEY = line.split("=", 1)[1].strip()
                    return

def create_riva_client():
    """Create authenticated Riva TTS client."""
    metadata = [
        ["function-id", FUNCTION_ID],
        ["authorization", f"Bearer {API_KEY}"],
    ]
    auth = riva.client.Auth(
        use_ssl=True,
        uri=RIVA_SERVER,
        metadata_args=metadata,
    )
    return riva.client.SpeechSynthesisService(auth)


def pcm_to_wav(pcm_bytes, sample_rate=24000, sample_width=2, channels=1):
    """Convert raw PCM bytes to WAV format."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


class TtsHandler(BaseHTTPRequestHandler):
    tts_client = None

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            text = body.get("text", "")
            voice = body.get("voice", "Magpie-Multilingual.EN-US.Aria")
            language = body.get("language_code", "en-US")
            sample_rate = body.get("sample_rate", 24000)

            if not text:
                self.send_error(400, "Missing 'text' field")
                return

            if TtsHandler.tts_client is None:
                TtsHandler.tts_client = create_riva_client()

            # Call Riva TTS
            resp = TtsHandler.tts_client.synthesize(
                text,
                voice_name=voice,
                language_code=language,
                sample_rate_hz=sample_rate,
                encoding=riva.client.AudioEncoding.LINEAR_PCM,
            )

            audio_bytes = resp.audio
            wav_bytes = pcm_to_wav(audio_bytes, sample_rate)

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.end_headers()
            self.wfile.write(wav_bytes)

        except Exception as e:
            error_msg = str(e)
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": error_msg}).encode())

    def log_message(self, format, *args):
        print(f"[Riva TTS] {args[0]}")


if __name__ == "__main__":
    load_api_key()
    if not API_KEY:
        print("ERROR: No NVIDIA API key found. Set VITE_NVIDIA_API_KEY in .env")
        exit(1)
    print(f"[Riva TTS Proxy] Starting on http://localhost:{PORT}")
    print(f"[Riva TTS Proxy] Voice: Magpie-Multilingual")
    print(f"[Riva TTS Proxy] Riva server: {RIVA_SERVER}")
    server = HTTPServer(("localhost", PORT), TtsHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Riva TTS Proxy] Stopped")
