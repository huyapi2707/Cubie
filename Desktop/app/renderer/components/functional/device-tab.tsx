import { Mic, Volume2, RefreshCw, ShieldCheck, Cable, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeviceCombobox } from '@/components/functional/device-combobox';
import { LineCombobox } from '@/components/functional/line-combobox';
import { MicTester } from '@/components/functional/mic-tester';
import { SpeakerTester } from '@/components/functional/speaker-tester';
import { RawLevelMeter } from '@/components/functional/raw-level-meter';
import { Slider } from '@/components/ui/slider';
import { useAudioDevices } from '@/hooks';
import { useAppStore } from '@/store';
import { NOISE_GATE_MIN_DB, NOISE_GATE_MAX_DB, BOOST_UP_MIN, BOOST_UP_MAX, BOOST_UP_STEP } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ─── Device Tab ─────────────────────────────────────────────────────────────

export function DeviceTab() {
  // Physical devices
  const physicalMicId = useAppStore((s) => s.physicalMicId);
  const setPhysicalMic = useAppStore((s) => s.setPhysicalMic);
  const physicalSpeakerId = useAppStore((s) => s.physicalSpeakerId);
  const setPhysicalSpeaker = useAppStore((s) => s.setPhysicalSpeaker);

  // Virtual lines
  const forwardLineId = useAppStore((s) => s.forwardLineId);
  const setForwardLine = useAppStore((s) => s.setForwardLine);
  const reverseLineId = useAppStore((s) => s.reverseLineId);
  const setReverseLine = useAppStore((s) => s.setReverseLine);

  // Audio quality
  const noiseGateDb = useAppStore((s) => s.noiseGateDb);
  const setNoiseGateDb = useAppStore((s) => s.setNoiseGateDb);
  const boostUpRate = useAppStore((s) => s.boostUpRate);
  const setBoostUpRate = useAppStore((s) => s.setBoostUpRate);

  const { physicalMicrophones, physicalSpeakers, lines, loading, error, refresh } = useAudioDevices();

  // Duplicate line validation
  const isDuplicateLine = forwardLineId && reverseLineId && forwardLineId === reverseLineId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Audio Devices</h2>
          <p className="text-sm text-muted-foreground">Configure physical devices and virtual lines for call translation</p>
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
          {/* ─── Physical Devices Card ──────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Physical Devices
              </CardTitle>
              <CardDescription>Your real microphone and speaker hardware</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Physical Microphone */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Microphone</label>
                <p className="text-xs text-muted-foreground">
                  The physical microphone used to capture your voice
                </p>
                <DeviceCombobox
                  devices={physicalMicrophones}
                  loading={loading}
                  selectedId={physicalMicId}
                  onSelect={(id) => setPhysicalMic(id)}
                  placeholder="Select a microphone..."
                  icon={<Mic className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
                {physicalMicId && <MicTester micId={Number(physicalMicId)} speakerId={Number(physicalSpeakerId)} />}
              </div>

              <Separator />

              {/* Physical Speaker */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Speaker</label>
                <p className="text-xs text-muted-foreground">
                  The physical speaker used to play translated audio from your peer
                </p>
                <DeviceCombobox
                  devices={physicalSpeakers}
                  loading={loading}
                  selectedId={physicalSpeakerId}
                  onSelect={(id) => setPhysicalSpeaker(id)}
                  placeholder="Select a speaker..."
                  icon={<Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                />
                {physicalSpeakerId && <SpeakerTester deviceId={Number(physicalSpeakerId)} />}
              </div>
            </CardContent>
          </Card>

          {/* ─── Virtual Lines Card ────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cable className="h-4 w-4" />
                Virtual Lines
              </CardTitle>
              <CardDescription>Virtual audio cables (e.g. VB-CABLE) for routing audio between apps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Duplicate warning */}
              {isDuplicateLine && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">
                    Forward and reverse lines must be different. Please select a different line for each direction.
                  </p>
                </div>
              )}

              {lines.length === 0 && !loading && (
                <div className="rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
                  <p className="text-sm text-muted-foreground">No virtual audio cables detected.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Install a virtual audio cable like VB-CABLE to enable audio routing between apps.
                  </p>
                </div>
              )}

              {/* Forward Line */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Forward Line</label>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your voice → translated → sent to communication app
                </p>
                <LineCombobox
                  lines={lines}
                  loading={loading}
                  selectedId={forwardLineId}
                  onSelect={(id) => setForwardLine(id)}
                  placeholder="Select forward line..."
                  icon={<ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  disabledLineId={reverseLineId}
                />
              </div>

              <Separator />

              {/* Reverse Line */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Reverse Line</label>
                  <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Peer's voice → translated → played on your physical speaker
                </p>
                <LineCombobox
                  lines={lines}
                  loading={loading}
                  selectedId={reverseLineId}
                  onSelect={(id) => setReverseLine(id)}
                  placeholder="Select reverse line..."
                  icon={<ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  disabledLineId={forwardLineId}
                />
              </div>
            </CardContent>
          </Card>

          {/* ─── Audio Quality Card ────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Audio Quality
              </CardTitle>
              <CardDescription>Control the quality of the audio captured from your microphone</CardDescription>
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
              {physicalMicId && <RawLevelMeter micId={Number(physicalMicId)} />}

              <Separator />

              {/* Boost Up Rate */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Boost Up Rate</label>
                  <span className="text-sm font-mono tabular-nums text-muted-foreground">
                    {boostUpRate.toFixed(1)}x
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Amplify microphone input before noise reduction. 1.0 = no boost.
                </p>
                <Slider
                  id="boost-up-rate-slider"
                  min={BOOST_UP_MIN}
                  max={BOOST_UP_MAX}
                  step={BOOST_UP_STEP}
                  value={boostUpRate}
                  onChange={setBoostUpRate}
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>No boost</span>
                  <span>Max boost</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
