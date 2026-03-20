import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Speaker Tester — plays a two-tone ping through the specified speaker
 * via the main process (RtAudio).
 *
 * @param deviceId - The RtAudio numeric device ID
 */
export function SpeakerTester({ deviceId }: { deviceId: number }) {
  const [playing, setPlaying] = useState(false);

  const playPing = useCallback(async () => {
    if (playing) return;
    setPlaying(true);

    try {
      await window.electronAPI.audio.speakerTest(deviceId);
    } catch (e) {
      console.error('[SpeakerTester] Failed to play ping:', e);
    }

    // Match the ping duration (~600ms)
    setTimeout(() => setPlaying(false), 600);
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
