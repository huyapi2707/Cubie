import { useEffect, useState, useCallback } from 'react';
import { deviceService, type AudioDevice } from '@/services/device-service';

export type { AudioDevice };

/**
 * Hook to enumerate audio input (microphone) and output (speaker) devices.
 * Requests microphone permission if needed to get device labels.
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
      const { inputs, outputs } = await deviceService.enumerate();
      setInputDevices(inputs);
      setOutputDevices(outputs);
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

    // Re-enumerate when devices change (plug/unplug)
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate);
  }, [enumerate]);

  return { inputDevices, outputDevices, loading, error, refresh: enumerate };
}
