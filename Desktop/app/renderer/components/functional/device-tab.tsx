import { Mic, Volume2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeviceCombobox } from '@/components/functional/device-combobox';
import { MicTester } from '@/components/functional/mic-tester';
import { SpeakerTester } from '@/components/functional/speaker-tester';
import { RawLevelMeter } from '@/components/functional/raw-level-meter';
import { Slider } from '@/components/ui/slider';
import { useAudioDevices } from '@/hooks';
import { useAppStore } from '@/store';
import { NOISE_GATE_MIN_DB, NOISE_GATE_MAX_DB } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ─── Device Tab ─────────────────────────────────────────────────────────────

export function DeviceTab() {
  const inMicId = useAppStore((s) => s.inMicId);
  const setMicrophone = useAppStore((s) => s.setMicrophone);
  const outMicId = useAppStore((s) => s.outMicId);
  const setOutputMic = useAppStore((s) => s.setOutputMic);
  const outSpeakerId = useAppStore((s) => s.outSpeakerId);
  const setSpeaker = useAppStore((s) => s.setSpeaker);
  const noiseGateDb = useAppStore((s) => s.noiseGateDb);
  const setNoiseGateDb = useAppStore((s) => s.setNoiseGateDb);
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
                  selectedId={inMicId}
                  onSelect={(id) => setMicrophone(id)}
                  placeholder="Select a microphone..."
                  icon={<Mic className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
                {inMicId && <MicTester micId={Number(inMicId)} speakerId={Number(outSpeakerId)} />}
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
                  selectedId={outMicId}
                  onSelect={(id) => setOutputMic(id)}
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
                  selectedId={outSpeakerId}
                  onSelect={(id) => setSpeaker(id)}
                  placeholder="Select a speaker..."
                  icon={<Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
                {outSpeakerId && <SpeakerTester deviceId={Number(outSpeakerId)} />}
              </div>
            </CardContent>
          </Card>

          {/* ─── Voice Sensitivity Card ───────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Voice Sensitivity
              </CardTitle>
              <CardDescription>Control how much sound is captured from your microphone</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Sensitivity Threshold</label>
                  <span className="text-sm font-mono tabular-nums text-muted-foreground">
                    {noiseGateDb} dBFS
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Audio below this level is silenced before noise reduction. Lower values let more sound through.
                </p>
                <Slider
                  id="noise-gate-slider"
                  min={NOISE_GATE_MIN_DB}
                  max={NOISE_GATE_MAX_DB}
                  step={1}
                  value={noiseGateDb}
                  onChange={setNoiseGateDb}
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>More sensitive</span>
                  <span>Less sensitive</span>
                </div>
              </div>

              {/* Raw volume meter for calibration */}
              {inMicId && <RawLevelMeter micId={Number(inMicId)} />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
