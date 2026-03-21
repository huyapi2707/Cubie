import { useCallback, useEffect, useRef, useState } from 'react';
import { Zap, Loader2, Radio, Clock, Globe, Wifi, WifiOff, AlertTriangle, Volume2, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoCard } from '@/components/functional/info-card';
import { useAppStore } from '@/store';
import { voiceService } from '@/services';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  id: number;
  transcript: string;
  translation: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  // ── Store ─────────────────────────────────────────────────────────────────
  const running = useAppStore((s) => s.running);
  const setRunning = useAppStore((s) => s.setRunning);
  const sourceLanguage = useAppStore((s) => s.sourceLanguage);
  const targetLanguage = useAppStore((s) => s.targetLanguage);
  const outputMicId = useAppStore((s) => s.outMicId);
  const speakerId = useAppStore((s) => s.outSpeakerId);

  // ── Local state ───────────────────────────────────────────────────────────
  const [connecting, setConnecting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Feature toggles
  const [listening, setListening] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);

  // Transcript entries
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveTranslation, setLiveTranslation] = useState('');
  const entryIdRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const showTranscriptRef = useRef(showTranscript);
  showTranscriptRef.current = showTranscript;



  // ── 1. Onboard: connect/disconnect ────────────────────────────────────────

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

  // Sync connection status
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
        setErrors(voiceService.getErrors());
      } else if (status === 'disconnected') {
        setConnecting(false);
        setRunning(false);
        setStartTime(null);
        setElapsed(0);
        setLiveTranscript('');
        setLiveTranslation('');
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

  // Stream server audio (TTS) → outputMic (via main process RtAudio)
  useEffect(() => {
    const unsubscribe = voiceService.onAudio((audio, sampleRate) => {
      window.electronAPI.audio.playPcm(Array.from(audio), sampleRate, Number(outputMicId) || 0);
    });
    return unsubscribe;
  }, [outputMicId]);

  // ── 2. Listen: stream outputMic → speaker (via main process) ───────────────

  const stopListening = useCallback(() => {
    window.electronAPI.audio.listenStop();
    setListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!outputMicId || !speakerId || listening) return;

    try {
      await window.electronAPI.audio.listenStart(Number(outputMicId), Number(speakerId));
      setListening(true);
    } catch (err) {
      console.error('[Dashboard] Failed to start listening:', err);
      stopListening();
    }
  }, [outputMicId, speakerId, listening, stopListening]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, stopListening, startListening]);

  // Stop listening when connection drops
  useEffect(() => {
    if (!running && listening) {
      stopListening();
    }
  }, [running]);

  // ── 3. Transcript & translation ───────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = voiceService.onMessage((message) => {
      if (!showTranscriptRef.current) return;

      if (message.type === 'transcript') {
        const text = message.text as string;
        const isFinal = message.isFinal as boolean;

        if (isFinal && text.trim()) {
          const id = ++entryIdRef.current;
          setEntries((prev) => [...prev, { id, transcript: text, translation: '' }]);
          setLiveTranscript('');
        } else {
          setLiveTranscript(text);
        }
      } else if (message.type === 'translation') {
        const text = message.text as string;
        if (text.trim()) {
          setEntries((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              translation: text,
            };
            return updated;
          });
          setLiveTranslation('');
        } else {
          setLiveTranslation(text);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Auto-scroll transcript panel
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, liveTranscript]);

  const clearTranscript = () => {
    setEntries([]);
    setLiveTranscript('');
    setLiveTranslation('');
    entryIdRef.current = 0;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopListening();
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const label = connecting ? 'Connecting' : running ? 'Listening' : 'Onboard';
  const statusText = connecting ? 'Establishing connection…' : running ? 'Live — Translating in real time' : 'Ready to connect';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className=" h-full animate-enter gap-6">

      {/* ─── Controls Block ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-start flex-1 gap-8">

        {/* Status badge */}
        <div className={cn(
          'flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-500',
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
        <div className="relative flex items-center justify-center my-12">
          <div className={cn(
            'absolute inset-0 rounded-full blur-3xl transition-all duration-700 scale-150',
            connecting
              ? 'bg-orange-500/15'
              : running
                ? 'bg-primary/15'
                : 'bg-transparent',
          )} />

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
          'grid grid-cols-3 gap-3 w-full max-w-sm transition-all duration-500',
        )}>
          <InfoCard
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Elapsed"
            value={running ? formatTime(elapsed) : '--:--'}
          />
          <InfoCard
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Languages"
            value={`${sourceLanguage.toUpperCase()} → ${targetLanguage.toUpperCase()}`}
          />
          <InfoCard
            icon={running ? <Wifi className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
            label="Status"
            value={connecting ? 'Pending' : running ? 'Active' : '—'}
          />
        </div>

        {/* Validation errors */}
        <div className={cn(
          'w-full max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 transition-all duration-300',
          errors.length > 0 ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden p-0 border-0',
        )}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Unable to connect</span>
          </div>
          <ul className="space-y-1 ml-6">
            {errors.map((err) => (
              <li key={err} className="text-xs text-muted-foreground list-disc">{err}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* ─── Toggle Controls ──────────────────────────────────────────── */}
      <div className="flex gap-3 max-w-lg mt-4 animate-fade-in">

        {/* Listen toggle — stream outputMic → speaker */}
        {outputMicId && speakerId && (
          <div className="w-fit flex items-center gap-6 rounded-lg bg-card/60 border border-border/30 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <Volume2 className={cn('h-4 w-4', listening ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <span className="text-xs font-medium">Listen</span>
                <p className="text-[10px] text-muted-foreground">Listen to translated output</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={listening}
              onClick={toggleListening}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                listening ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  listening ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        )}

        {/* Transcript toggle — show/hide transcript & translation */}
        <div className="w-fit flex items-center gap-6 rounded-lg bg-card/60 border border-border/30 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <MessageSquare className={cn('h-4 w-4', showTranscript ? 'text-primary' : 'text-muted-foreground')} />
            <div>
              <span className="text-xs font-medium">View Text</span>
              <p className="text-[10px] text-muted-foreground">View transcript - translated text</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showTranscript}
            onClick={() => setShowTranscript(!showTranscript)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              showTranscript ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                showTranscript ? 'translate-x-[18px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

      </div>

      {/* ─── Transcript & Translation Block ─────────────────────────── */}
      <div className="w-1/2 mt-4 animate-fade-in">
        <div className="rounded-lg bg-card/60 border border-border/30 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Live Transcript - Translation</span>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={clearTranscript}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto p-3 space-y-2.5">
            {entries.length === 0 && !liveTranscript && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Waiting for speech…
              </p>
            )}

            {entries.map((entry) => (
              <div key={entry.id} className="space-y-0.5">
                <p className="text-xs text-foreground/90 leading-relaxed">Transcript: {entry.transcript}</p>
                {entry.translation && (
                  <p className="text-xs text-primary/80 leading-relaxed">Translation: {entry.translation}</p>
                )}
              </div>
            ))}

            {/* In-progress transcript */}
            {liveTranscript && (
              <div className="space-y-0.5">
                <p className="text-xs text-foreground/50 leading-relaxed italic">{liveTranscript}</p>
                {liveTranslation && (
                  <p className="text-xs text-primary/40 leading-relaxed italic">{liveTranslation}</p>
                )}
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

    </div>
  );
}
