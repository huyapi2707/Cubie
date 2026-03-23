import { useRef, useEffect } from 'react';
import { NOISE_GATE_MIN_DB as MIN_DB, NOISE_GATE_MAX_DB as MAX_DB } from '@/lib/constants';

/**
 * Always-on volume meter showing raw (unprocessed) audio level in dBFS.
 * Styled to match the settings slider — a horizontal bar with gradient fill.
 * Auto-starts on mount, auto-stops on unmount.
 *
 * @param micId - RtAudio numeric device ID for the input mic
 */
export function RawLevelMeter({ micId }: { micId: number }) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const dbLabelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!micId) return;

    let unsub: (() => void) | null = null;

    const startCapture = async () => {
      try {
        await window.electronAPI.audio.rawLevelStart(micId);

        unsub = window.electronAPI.audio.onRawLevelData(({ db }) => {
          const pct = Math.max(0, Math.min(100,
            ((db - MIN_DB) / (MAX_DB - MIN_DB)) * 100
          ));

          // Color based on actual dB level
          let color: string;
          if (db <= -40)      color = '#10b981'; // green  — silent / quiet
          else if (db <= -30) color = '#fbbf24'; // yellow — normal speech
          else if (db <= -24) color = '#f97316'; // orange — loud
          else                color = '#ef4444'; // red    — very loud

          if (fillRef.current) {
            fillRef.current.style.width = `${pct}%`;
            fillRef.current.style.backgroundColor = color;
          }

          if (dbLabelRef.current) {
            dbLabelRef.current.textContent = db <= -100
              ? '–∞ dBFS'
              : `${db.toFixed(0)} dBFS`;
          }
        });
      } catch {
        // Silently ignore — device may not be available
      }
    };

    startCapture();

    return () => {
      unsub?.();
      window.electronAPI.audio.rawLevelStop();
    };
  }, [micId]);

  return (
    <div className="space-y-1.5">
      {/* Track — matches slider: h-2, rounded-full, secondary bg */}
      <div className="relative w-full h-2 rounded-full bg-secondary overflow-hidden">
        {/* Fill — slides from left, primary color, matches slider gradient */}
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
          style={{ width: '0%' }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{MIN_DB} dB</span>
        <span
          ref={dbLabelRef}
          className="text-[10px] font-mono text-muted-foreground"
        >
          –∞ dBFS
        </span>
        <span className="text-[10px] text-muted-foreground">{MAX_DB} dB</span>
      </div>
    </div>
  );
}
