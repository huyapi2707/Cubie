import { useEffect, useState, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
  isVirtual: boolean;
}

export interface AudioLine {
  lineId: string;
  lineName: string;
  inputDeviceId: number;
  outputDeviceId: number;
}

/**
 * Hook to enumerate audio devices and virtual lines via the main process (audify RtAudio).
 *
 * Returns:
 * - `microphones` / `speakers` — all devices with isVirtual flag
 * - `physicalMicrophones` / `physicalSpeakers` — filtered to real hardware only
 * - `lines` — paired virtual cable lines (input + output matched by cable name)
 */
export function useAudioDevices() {
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  const [lines, setLines] = useState<AudioLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enumerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deviceResult, lineResult] = await Promise.all([
        window.electronAPI.audio.getDevices(),
        window.electronAPI.audio.getLines(),
      ]);

      // Map RtAudio device info → AudioDevice shape used by comboboxes
      setMicrophones(
        deviceResult.inputs.map((d: { id: number; name: string; isVirtual?: boolean }) => ({
          deviceId: String(d.id),
          label: d.name,
          groupId: '',
          isVirtual: d.isVirtual ?? false,
        })),
      );
      setSpeakers(
        deviceResult.outputs.map((d: { id: number; name: string; isVirtual?: boolean }) => ({
          deviceId: String(d.id),
          label: d.name,
          groupId: '',
          isVirtual: d.isVirtual ?? false,
        })),
      );

      // Map line info
      setLines(
        (lineResult ?? []).map((l: { lineId: string; lineName: string; inputDeviceId: number; outputDeviceId: number }) => ({
          lineId: l.lineId,
          lineName: l.lineName,
          inputDeviceId: l.inputDeviceId,
          outputDeviceId: l.outputDeviceId,
        })),
      );
    } catch (err) {
      setError((err as Error).message);
      setMicrophones([]);
      setSpeakers([]);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    enumerate();
  }, [enumerate]);

  // Derived: physical-only lists
  const physicalMicrophones = microphones.filter((d) => !d.isVirtual);
  const physicalSpeakers = speakers.filter((d) => !d.isVirtual);

  return {
    microphones,
    speakers,
    physicalMicrophones,
    physicalSpeakers,
    lines,
    loading,
    error,
    refresh: enumerate,
  };
}
