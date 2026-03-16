import { useState, useRef } from 'react';

export function ScreenRecorder() {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voicecode-demo-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      // User cancelled or not supported
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <button
      type="button"
      onClick={recording ? stopRecording : startRecording}
      className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors hover:bg-black/5 focus:outline-none"
      style={{ color: recording ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}
      title={recording ? 'Stop recording' : 'Record demo'}
    >
      <span
        className={`w-2 h-2 rounded-full ${recording ? 'animate-pulse' : ''}`}
        style={{ background: recording ? 'var(--md-error)' : 'var(--md-on-surface-variant)' }}
      />
      <span className="text-sm font-medium hidden sm:inline">
        {recording ? 'Stop' : 'Record'}
      </span>
    </button>
  );
}
