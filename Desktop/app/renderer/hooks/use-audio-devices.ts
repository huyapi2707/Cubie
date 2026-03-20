import { useEffect, useState, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

/**
 * Hook to enumerate audio input (microphone) and output (speaker) devices
 * via the main process (audify RtAudio).
 */
export function useAudioDevices() {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enumerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { inputs, outputs } = await window.electronAPI.audio.getDevices();
    
      // Map RtAudio device info → AudioDevice shape used by comboboxes
      // Main process returns { id: number; name: string } per device
      setInputDevices(
        inputs.map((d: { id: number; name: string }) => ({
          deviceId: String(d.id),
          label: d.name,
          groupId: '',
        })),
      );
      setOutputDevices(
        outputs.map((d: { id: number; name: string }) => ({
          deviceId: String(d.id),
          label: d.name,
          groupId: '',
        })),
      );
    } catch (err) {
      setError((err as Error).message);
      setInputDevices([]);
      setOutputDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    enumerate();
  }, [enumerate]);

  return { inputDevices, outputDevices, loading, error, refresh: enumerate };
}
