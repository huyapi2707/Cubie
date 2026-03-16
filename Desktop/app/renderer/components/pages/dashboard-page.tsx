import { useEffect, useState } from 'react';
import { Zap, Loader2, Radio, Clock, Globe, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store';
import { voiceService } from '@/services';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const running = useAppStore((s) => s.running);
  const setRunning = useAppStore((s) => s.setRunning);
  const sourceLanguage = useAppStore((s) => s.sourceLanguage);
  const targetLanguage = useAppStore((s) => s.targetLanguage);
  const [connecting, setConnecting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Connect/disconnect the voice server when the button is clicked
  const handleToggle = async () => {
    if (connecting) return;

    if (running) {
      voiceService.disconnect();
      setRunning(false);
      setStartTime(null);
      setElapsed(0);
    } else {
      setErrors([]);
      setConnecting(true);
      await voiceService.connect();
    }
  };

  // Sync state from voiceService status changes
  useEffect(() => {
    const unsubscribe = voiceService.onStatus((status) => {
      if (status === 'connected') {
        setConnecting(false);
        setRunning(true);
        setStartTime(Date.now());
      } else if (status === 'error') {
        setConnecting(false);
        setRunning(false);
        setStartTime(null);
        setElapsed(0);
        setErrors(voiceService.getValidationErrors());
      } else if (status === 'disconnected') {
        setConnecting(false);
        setRunning(false);
        setStartTime(null);
        setElapsed(0);
      }
    });
    return unsubscribe;
  }, [setRunning]);

  // Elapsed time ticker
  useEffect(() => {
    if (!startTime) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const label = connecting ? 'Connecting' : running ? 'Listening' : 'Onboard';
  const statusText = connecting ? 'Establishing connection…' : running ? 'Live — Translating in real time' : 'Ready to connect';

  return (
    <div className="flex flex-col items-center justify-center h-full animate-enter gap-8">

      {/* Status badge */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-500 my-10',
        connecting
          ? 'bg-amber-500/10 text-amber-500'
          : running
            ? 'bg-emerald-500/10 text-emerald-500'
            : 'bg-muted/40 text-muted-foreground',
      )}>
        {connecting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : running ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        {statusText}
      </div>

      {/* Main button area */}
      <div className="relative flex items-center justify-center my-10">
        {/* Ambient glow behind button */}
        <div className={cn(
          'absolute inset-0 rounded-full blur-3xl transition-all duration-700 scale-150',
          connecting
            ? 'bg-orange-500/15'
            : running
              ? 'bg-primary/15'
              : 'bg-transparent',
        )} />

        {/* Wave propagation rings */}
        {(connecting || running) && (
          <>
            <span className={cn('wave-ring wave-ring-1', connecting && 'wave-ring-orange')} />
            <span className={cn('wave-ring wave-ring-2', connecting && 'wave-ring-orange')} />
            <span className={cn('wave-ring wave-ring-3', connecting && 'wave-ring-orange')} />
            <span className={cn('wave-ring wave-ring-4', connecting && 'wave-ring-orange')} />
            <span className={cn('wave-ring wave-ring-5', connecting && 'wave-ring-orange')} />
          </>
        )}

        <Button
          variant="ghost"
          size="lg"
          onClick={handleToggle}
          className={cn(
            'relative z-10 h-[5.25rem] w-[5.25rem] rounded-full text-base font-semibold shadow-lg',
            'transition-all duration-300 hover:shadow-xl hover:scale-105 text-white border-0',
            connecting
              ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-400/30 hover:shadow-orange-400/40 animate-surf'
              : running
                ? 'gradient-primary shadow-primary/25 hover:shadow-primary/30 animate-surf'
                : 'bg-gradient-to-br from-rose-400 to-red-400 shadow-rose-400/30 hover:shadow-rose-400/40',
          )}
        >
          <div className="flex flex-col items-center gap-0.5">
            {connecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Zap className={cn('h-5 w-5', running && 'animate-pulse')} />
            )}
            <span className="text-xs">{label}</span>
          </div>
        </Button>
      </div>

      {/* Info cards */}
      <div className={cn(
        'grid grid-cols-3 gap-3 w-full max-w-sm transition-all duration-500 my-10',
        (running || connecting) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
      )}>
        <InfoCard
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Elapsed"
          value={running ? formatTime(elapsed) : '--:--'}
        />
        <InfoCard
          icon={<Globe className="h-3.5 w-3.5" />}
          label="Languages"
          value={running ? `${sourceLanguage.toUpperCase()} → ${targetLanguage.toUpperCase()}` : '—'}
        />
        <InfoCard
          icon={running ? <Wifi className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
          label="Status"
          value={connecting ? 'Pending' : running ? 'Active' : '—'}
        />
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="w-full max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Please configure before connecting</span>
          </div>
          <ul className="space-y-1 ml-6">
            {errors.map((err) => (
              <li key={err} className="text-xs text-muted-foreground list-disc">{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── InfoCard ────────────────────────────────────────────────────────

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg bg-card/60 border border-border/30 px-3 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide font-medium">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground/80 font-mono">{value}</span>
    </div>
  );
}
