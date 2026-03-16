import { useEffect, useState, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

/**
 * Hook to enumerate audio input (microphone) devices.
 * Requests microphone permission if needed to get device labels.
 */
export function useAudioDevices() {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enumerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Request permission first so we get device labels (not just IDs)
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        // Stop the stream immediately — we only needed it for permission
        stream.getTracks().forEach((track) => track.stop());
      });

      const allDevices = await navigator.mediaDevices.enumerateDevices();

      const inputs = allDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`,
        }));

      setInputDevices(inputs);
    } catch (err) {
      setError((err as Error).message);
      setInputDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    enumerate();

    // Re-enumerate when devices change (plug/unplug)
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate);
  }, [enumerate]);

  return { inputDevices, loading, error, refresh: enumerate };
}
