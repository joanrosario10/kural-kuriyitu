import { useRef, useEffect } from 'react';

interface WaveformVisualizerProps {
  stream: MediaStream | null;
  isListening: boolean;
  size?: number;
}

export function WaveformVisualizer({ stream, isListening, size = 150 }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!stream || !isListening) {
      cancelAnimationFrame(animRef.current);
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) ctx2d.clearRect(0, 0, size, size);
      return;
    }

    const audioCtx = new AudioContext();
    ctxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const ctx2d = canvas.getContext('2d')!;

    const barCount = 32;
    const centerX = size / 2;
    const centerY = size / 2;
    const innerRadius = 38;
    const maxBarHeight = (size / 2) - innerRadius - 6;

    function draw() {
      analyser.getByteFrequencyData(dataArray);
      ctx2d.clearRect(0, 0, size, size);

      // Outer ambient ring
      ctx2d.beginPath();
      ctx2d.arc(centerX, centerY, innerRadius + maxBarHeight + 4, 0, Math.PI * 2);
      ctx2d.strokeStyle = 'rgba(0, 212, 255, 0.06)';
      ctx2d.lineWidth = 1;
      ctx2d.stroke();

      // Inner ring glow
      ctx2d.beginPath();
      ctx2d.arc(centerX, centerY, innerRadius - 2, 0, Math.PI * 2);
      ctx2d.strokeStyle = 'rgba(0, 212, 255, 0.15)';
      ctx2d.lineWidth = 1;
      ctx2d.stroke();

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(4, value * maxBarHeight);
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

        const x1 = centerX + Math.cos(angle) * innerRadius;
        const y1 = centerY + Math.sin(angle) * innerRadius;
        const x2 = centerX + Math.cos(angle) * (innerRadius + barHeight);
        const y2 = centerY + Math.sin(angle) * (innerRadius + barHeight);

        // Cyan gradient based on intensity
        const alpha = 0.3 + value * 0.7;
        const gradient = ctx2d.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `rgba(0, 212, 255, ${alpha * 0.6})`);
        gradient.addColorStop(1, `rgba(0, 240, 255, ${alpha})`);

        ctx2d.beginPath();
        ctx2d.moveTo(x1, y1);
        ctx2d.lineTo(x2, y2);
        ctx2d.strokeStyle = gradient;
        ctx2d.lineWidth = 2.5;
        ctx2d.lineCap = 'round';
        ctx2d.stroke();

        // Glow effect for high-intensity bars
        if (value > 0.5) {
          ctx2d.beginPath();
          ctx2d.moveTo(x1, y1);
          ctx2d.lineTo(x2, y2);
          ctx2d.strokeStyle = `rgba(0, 240, 255, ${value * 0.2})`;
          ctx2d.lineWidth = 6;
          ctx2d.lineCap = 'round';
          ctx2d.stroke();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream, isListening, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute pointer-events-none"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: isListening ? 1 : 0,
        transition: 'opacity 0.3s ease',
        filter: isListening ? 'drop-shadow(0 0 4px rgba(0, 212, 255, 0.2))' : 'none',
      }}
    />
  );
}
