/**
 * AudioWorklet processor that captures raw Float32 PCM samples
 * and forwards them to the main thread via MessagePort.
 *
 * Registered as 'pcm-forwarder'.
 */
class PcmForwarder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0]); // Float32Array
    }
    return true;
  }
}

registerProcessor('pcm-forwarder', PcmForwarder);
