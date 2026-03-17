
import { Moon, Sun, Monitor, Mic, Volume2, RefreshCw, Languages, Wifi } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeviceCombobox } from '@/components/ui/device-combobox';
import { LanguageSelect } from '@/components/ui/language-select';
import { InfoRow } from '@/components/ui/info-row';
import { MicTester } from '@/components/functional/mic-tester';
import { SpeakerTester } from '@/components/functional/speaker-tester';
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
  const selectedSpeakerId = useAppStore((s) => s.selectedSpeakerId);
  const selectedSpeakerLabel = useAppStore((s) => s.selectedSpeakerLabel);
  const setSpeaker = useAppStore((s) => s.setSpeaker);
  const sourceLanguage = useAppStore((s) => s.sourceLanguage);
  const targetLanguage = useAppStore((s) => s.targetLanguage);
  const setLanguages = useAppStore((s) => s.setLanguages);
  const autoReconnect = useAppStore((s) => s.autoReconnect);
  const setAutoReconnect = useAppStore((s) => s.setAutoReconnect);
  const { inputDevices, outputDevices, loading, error, refresh } = useAudioDevices();

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

              <Separator />

              {/* Speaker */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  Speaker
                </label>
                <p className="text-xs text-muted-foreground">
                  The speaker used to play translated audio
                </p>
                <DeviceCombobox
                  devices={outputDevices}
                  loading={loading}
                  selectedId={selectedSpeakerId}
                  selectedLabel={selectedSpeakerLabel}
                  onSelect={(id, label) => setSpeaker(id, label)}
                  placeholder="Select a speaker..."
                  icon={<Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
              </div>

              {/* Speaker Test */}
              {selectedSpeakerId && (
                <SpeakerTester deviceId={selectedSpeakerId} />
              )}

           
            </>
          )}
        </CardContent>
      </Card>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection</CardTitle>
          <CardDescription>Configure server connection behavior</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <div>
                <label className="text-sm font-medium">Auto Reconnect</label>
                <p className="text-xs text-muted-foreground">
                  Automatically reconnect when the connection is lost
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoReconnect}
              onClick={() => setAutoReconnect(!autoReconnect)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                autoReconnect ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  autoReconnect ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
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
