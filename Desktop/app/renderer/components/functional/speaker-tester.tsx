import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SpeakerTester({ deviceId }: { deviceId: string }) {
  const [playing, setPlaying] = useState(false);

  const playPing = useCallback(async () => {
    if (playing) return;
    setPlaying(true);

    try {
      const ctx = new AudioContext();
      await ctx.resume();

      // Try to route to the selected speaker (non-blocking)
      // setSinkId uses "" for default device, but enumerateDevices returns "default"
      try {
        if (typeof (ctx as any).setSinkId === 'function') {
          const sinkId = deviceId === 'default' ? '' : deviceId;
          await (ctx as any).setSinkId(sinkId);
        }
      } catch (e) {
        console.warn('[SpeakerTester] setSinkId failed, using default output:', e);
      }

      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      osc1.connect(gain);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 660;
      osc2.connect(gain);

      const now = ctx.currentTime;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);

      gain.gain.setValueAtTime(0, now + 0.25);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.27);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.37);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);

      osc1.start(now);
      osc1.stop(now + 0.2);
      osc2.start(now + 0.25);
      osc2.stop(now + 0.5);

      setTimeout(() => {
        ctx.close().catch(() => {});
        setPlaying(false);
      }, 600);
    } catch (e) {
      console.error('[SpeakerTester] Failed to play ping:', e);
      setPlaying(false);
    }
  }, [deviceId, playing]);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={playPing}
        disabled={playing}
        className="gap-2"
      >
        <Volume2 className={cn('h-4 w-4', playing && 'animate-pulse')} />
        {playing ? 'Playing…' : 'Test'}
      </Button>

      {playing && (
        <span className="text-xs text-muted-foreground animate-fade-in">
          Playing ping sound…
        </span>
      )}
    </div>
  );
}
