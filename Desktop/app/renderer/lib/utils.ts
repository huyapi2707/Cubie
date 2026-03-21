import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx for conditional class composition.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Compute the RMS (Root Mean Square) level of a PCM audio buffer.
 *
 * @param samples - Float32Array of PCM samples in [-1, 1] range
 * @returns RMS value (0 = silence, 1 = max amplitude)
 */

