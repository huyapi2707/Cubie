import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOTAL_BARS = 20;

export function MicTester({ deviceId }: { deviceId: string }) {
  const [testing, setTesting] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const levelRef = useRef<HTMLSpanElement | null>(null);

  const stopTest = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;

    // Reset bars via DOM
    barsRef.current.forEach((bar) => {
      if (bar) {
        bar.style.height = '50%';
        bar.style.backgroundColor = '';
        bar.className = bar.className.replace(/bg-\S+/g, '') + ' bg-muted/40';
      }
    });
    if (levelRef.current) levelRef.current.textContent = '0%';

    setTesting(false);
  }, []);

  const startTest = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ latencyHint: 'interactive' });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      source.connect(ctx.destination);
      source.connect(analyser);

      setTesting(true);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function poll() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const level = sum / dataArray.length / 255;

        const activeBars = Math.round(level * TOTAL_BARS);
        for (let i = 0; i < TOTAL_BARS; i++) {
          const bar = barsRef.current[i];
          if (!bar) continue;
          const ratio = i / TOTAL_BARS;
          const isActive = i < activeBars;

          if (isActive) {
            bar.style.height = '100%';
            bar.style.backgroundColor =
              ratio > 0.7 ? '#ef4444' : ratio > 0.45 ? '#fbbf24' : '#10b981';
          } else {
            bar.style.height = '50%';
            bar.style.backgroundColor = '';
          }
        }

        if (levelRef.current) {
          levelRef.current.textContent = `${Math.round(level * 100)}%`;
        }

        animFrameRef.current = requestAnimationFrame(poll);
      }
      poll();
    } catch {
      stopTest();
    }
  }, [deviceId, stopTest]);

  useEffect(() => {
    return () => stopTest();
  }, [deviceId, stopTest]);

  const toggleTest = () => (testing ? stopTest() : startTest());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          variant={testing ? 'destructive' : 'outline'}
          size="sm"
          onClick={toggleTest}
          className="gap-2"
        >
          <Mic className={cn('h-4 w-4', testing && 'animate-pulse')} />
          {testing ? 'Stop Test' : 'Test'}
        </Button>

        {testing && (
          <span className="text-xs text-muted-foreground animate-fade-in">
            Listening — speak to test
          </span>
        )}
      </div>

      {testing && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="flex items-center gap-1 h-6">
            {Array.from({ length: TOTAL_BARS }).map((_, i) => (
              <div
                key={i}
                ref={(el) => { barsRef.current[i] = el; }}
                className="flex-1 rounded-sm bg-muted/40 transition-[height] duration-75"
                style={{ height: '50%' }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Low</span>
            <span
              ref={levelRef}
              className="text-[10px] font-mono text-muted-foreground"
            >
              0%
            </span>
            <span className="text-[10px] text-muted-foreground">High</span>
          </div>
        </div>
      )}
    </div>
  );
}
