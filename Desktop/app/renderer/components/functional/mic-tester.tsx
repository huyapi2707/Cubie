import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOTAL_BARS = 20;

/**
 * Mic Tester — uses the main process audio pipeline (RtAudio + RNNoise)
 * via IPC. The main process captures audio, applies noise suppression,
 * and sends level data back to the renderer for the meter visualization.
 *
 * @param deviceId - The RtAudio numeric device ID
 */
export function MicTester({ deviceId }: { deviceId: number }) {
  const [testing, setTesting] = useState(false);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const levelRef = useRef<HTMLSpanElement | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const stopTest = useCallback(() => {
    window.electronAPI.audio.micTestStop();
    unsubRef.current?.();
    unsubRef.current = null;

    // Reset bars
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
    if (!deviceId) return;

    try {
      await window.electronAPI.audio.micTestStart(deviceId);

      // Subscribe to level events from main process
      const unsub = window.electronAPI.audio.onMicTestLevel(({ level }) => {
        const activeBars = Math.round(level * TOTAL_BARS * 10); // Scale up since RMS is typically small
        const clampedBars = Math.min(activeBars, TOTAL_BARS);

        for (let i = 0; i < TOTAL_BARS; i++) {
          const bar = barsRef.current[i];
          if (!bar) continue;
          const ratio = i / TOTAL_BARS;
          const isActive = i < clampedBars;

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
          levelRef.current.textContent = `${Math.round(Math.min(level * 1000, 100))}%`;
        }
      });
      unsubRef.current = unsub;

      setTesting(true);
    } catch {
      stopTest();
    }
  }, [deviceId, stopTest]);

  // Stop when deviceLabel changes or component unmounts
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
