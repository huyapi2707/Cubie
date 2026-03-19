/// <reference types="vite/client" />

declare module '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url' {
  const url: string;
  export default url;
}

declare module '*/vad-processor?worker&url' {
  const url: string;
  export default url;
}
