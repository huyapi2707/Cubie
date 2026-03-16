import { useState, useRef, useEffect, useCallback } from 'react';
import { Moon, Sun, Monitor, Mic, RefreshCw, ChevronsUpDown, Check, Languages } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTheme, useAudioDevices } from '@/hooks';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import type { ThemeMode } from '@shared/ipc';

const themeOptions: { value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const LANGUAGES = [
  { code: 'vi', label: 'Vietnamese' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'th', label: 'Thai' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
];

export function SettingsPage() {
  const { theme, setThemeMode } = useTheme();
  const version = useAppStore((s) => s.version);
  const selectedMicId = useAppStore((s) => s.selectedMicId);
  const selectedMicLabel = useAppStore((s) => s.selectedMicLabel);
  const setMicrophone = useAppStore((s) => s.setMicrophone);
  const selectedOutputMicId = useAppStore((s) => s.selectedOutputMicId);
  const selectedOutputMicLabel = useAppStore((s) => s.selectedOutputMicLabel);
  const setOutputMic = useAppStore((s) => s.setOutputMic);
  const sourceLanguage = useAppStore((s) => s.sourceLanguage);
  const targetLanguage = useAppStore((s) => s.targetLanguage);
  const setLanguages = useAppStore((s) => s.setLanguages);
  const { inputDevices, loading, error, refresh } = useAudioDevices();

  return (
    <div className="max-w-2xl space-y-6 animate-enter">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-display">Settings</h1>
        <p className="mt-1 text-muted-foreground">Configure your application preferences</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Theme</label>
            <p className="text-xs text-muted-foreground mb-3">
              Select your preferred color scheme
            </p>
            <div className="flex gap-2">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <Button
                    key={option.value}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setThemeMode(option.value)}
                    className={cn(
                      'gap-2 transition-all',
                      active && 'shadow-md shadow-primary/25',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Translation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Translation</CardTitle>
          <CardDescription>Set source and target languages for voice translation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                Source
              </label>
              <p className="text-xs text-muted-foreground">
                Language you speak
              </p>
              <LanguageSelect
                languages={LANGUAGES}
                selected={sourceLanguage}
                onSelect={(code) => setLanguages(code, targetLanguage)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                Target
              </label>
              <p className="text-xs text-muted-foreground">
                Language to translate into
              </p>
              <LanguageSelect
                languages={LANGUAGES}
                selected={targetLanguage}
                onSelect={(code) => setLanguages(sourceLanguage, code)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audio Devices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Audio Devices</CardTitle>
              <CardDescription>Configure input and output microphones for call translation</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              disabled={loading}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Please allow microphone access in your system settings.
              </p>
            </div>
          )}

          {!error && (
            <>
              {/* Input Microphone */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  Input Microphone
                </label>
                <p className="text-xs text-muted-foreground">
                  The microphone used to capture your voice
                </p>
                <DeviceCombobox
                  devices={inputDevices}
                  loading={loading}
                  selectedId={selectedMicId}
                  selectedLabel={selectedMicLabel}
                  onSelect={(id, label) => setMicrophone(id, label)}
                  placeholder="Select a microphone..."
                  icon={<Mic className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
              </div>

              {/* Test */}
              {selectedMicId && (
                <>
                  <MicTester deviceId={selectedMicId} />
                </>
              )}
              <Separator />

              {/* Output Microphone */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  Output Microphone
                </label>
                <p className="text-xs text-muted-foreground">
                  The virtual microphone for translated audio output
                </p>
                <DeviceCombobox
                  devices={inputDevices}
                  loading={loading}
                  selectedId={selectedOutputMicId}
                  selectedLabel={selectedOutputMicLabel}
                  onSelect={(id, label) => setOutputMic(id, label)}
                  placeholder="Select an output microphone..."
                  icon={<Mic className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
              </div>

           
            </>
          )}
        </CardContent>
      </Card>
      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About</CardTitle>
          <CardDescription>Application information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Application" value="Cubie" />
          <Separator />
          <InfoRow label="Version" value={version} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Mic Tester ────────────────────────────────────────────────────

const TOTAL_BARS = 20;

function MicTester({ deviceId }: { deviceId: string }) {
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
          // Disable all processing for clean passthrough
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

      // Source → Destination (clean audio path, no processing node in between)
      source.connect(ctx.destination);
      // Source → Analyser (separate branch, just for metering)
      source.connect(analyser);

      setTesting(true);

      // Volume polling — direct DOM writes, no React state
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function poll() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const level = sum / dataArray.length / 255;

        // Update bars directly via DOM refs
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

        // Update percentage label
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

  // Cleanup on unmount or device change
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
          {/* Volume Bar — updated via direct DOM refs, not React state */}
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

          {/* Level label */}
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

// ─── Device Combobox ───────────────────────────────────────────────

function DeviceCombobox({
  devices,
  loading,
  selectedId,
  selectedLabel,
  onSelect,
  placeholder,
  icon,
}: {
  devices: { deviceId: string; label: string }[];
  loading: boolean;
  selectedId: string;
  selectedLabel: string;
  onSelect: (id: string, label: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = devices.filter((d) =>
    d.label.toLowerCase().includes(search.toLowerCase()),
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors',
          open
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-input hover:border-primary/40',
        )}
      >
        {icon}
        <span className={cn('flex-1 text-left truncate', !selectedId && 'text-muted-foreground')}>
          {loading ? 'Scanning devices...' : selectedLabel || placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg animate-scale-in">
          {/* Search Input */}
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search devices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Scanning...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search ? 'No matching devices' : 'No devices found'}
              </div>
            )}

            {!loading &&
              filtered.map((device) => {
                const isSelected = selectedId === device.deviceId;
                return (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      onSelect(device.deviceId, device.label);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{device.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InfoRow ───────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

// ─── LanguageSelect ────────────────────────────────────────────────

function LanguageSelect({
  languages,
  selected,
  onSelect,
}: {
  languages: { code: string; label: string }[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLang = languages.find((l) => l.code === selected);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors',
          open
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-input hover:border-primary/40',
        )}
      >
        <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn('flex-1 text-left truncate', !selected && 'text-muted-foreground')}>
          {selectedLang?.label || 'Select language...'}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg animate-scale-in">
          <div className="max-h-48 overflow-y-auto p-1">
            {languages.map((lang) => {
              const isSelected = selected === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    onSelect(lang.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-accent',
                  )}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{lang.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground uppercase">{lang.code}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
