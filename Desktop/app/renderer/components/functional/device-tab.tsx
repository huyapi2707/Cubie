import { Mic, Volume2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeviceCombobox } from '@/components/functional/device-combobox';
import { MicTester } from '@/components/functional/mic-tester';
import { SpeakerTester } from '@/components/functional/speaker-tester';
import { useAudioDevices } from '@/hooks';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';

export function DeviceTab() {
  const selectedMicId = useAppStore((s) => s.selectedMicId);
  const selectedMicLabel = useAppStore((s) => s.selectedMicLabel);
  const setMicrophone = useAppStore((s) => s.setMicrophone);
  const selectedOutputMicId = useAppStore((s) => s.selectedOutputMicId);
  const selectedOutputMicLabel = useAppStore((s) => s.selectedOutputMicLabel);
  const setOutputMic = useAppStore((s) => s.setOutputMic);
  const selectedSpeakerId = useAppStore((s) => s.selectedSpeakerId);
  const selectedSpeakerLabel = useAppStore((s) => s.selectedSpeakerLabel);
  const setSpeaker = useAppStore((s) => s.setSpeaker);
  const { inputDevices, outputDevices, loading, error, refresh } = useAudioDevices();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Audio Devices</h2>
          <p className="text-sm text-muted-foreground">Configure input and output devices for call translation</p>
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
          {/* ─── Microphone Card ──────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Microphone
              </CardTitle>
              <CardDescription>Configure input and output microphones</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Input Microphone */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Input Microphone</label>
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
                {selectedMicId && <MicTester deviceId={selectedMicId} />}
              </div>

              <Separator />

              {/* Output Microphone */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Output Microphone</label>
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
            </CardContent>
          </Card>

          {/* ─── Speaker Card ────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Speaker
              </CardTitle>
              <CardDescription>Configure the audio output device</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Output Speaker</label>
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
                {selectedSpeakerId && <SpeakerTester deviceId={selectedSpeakerId} />}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
