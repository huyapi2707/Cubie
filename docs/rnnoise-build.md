# Native RNNoise Addon — Build Guide

The Cubie Desktop app uses a **native C-based RNNoise addon** (N-API) for real-time audio noise suppression.  
This addon is compiled from the official [xiph/rnnoise](https://github.com/xiph/rnnoise) source.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18.x LTS | [nodejs.org](https://nodejs.org) |
| **Python** | 3.x | [python.org](https://www.python.org) |
| **Visual Studio Build Tools 2022** | 17.x | [Download](https://aka.ms/vs/17/release/vs_BuildTools.exe) |
| **Git** | 2.x+ | [git-scm.com](https://git-scm.com) |

### Python Setup

Python 3.12+ removed the built-in `distutils` module that `node-gyp` needs.  
Install `setuptools` to restore it:

```bash
python -m pip install setuptools
```

### Visual Studio Build Tools Setup

1. Download the installer from [https://aka.ms/vs/17/release/vs_BuildTools.exe](https://aka.ms/vs/17/release/vs_BuildTools.exe)
2. Run the installer
3. Select **"Desktop development with C++"** workload
4. Click **Install**

Or install silently from an elevated terminal:

```bash
vs_BuildTools.exe --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --wait --norestart
```

> **Note:** This is only required for building native addons (`rnnoise`, and as a fallback for `audify`).  
> If you are not modifying the native addon and the prebuilt `.node` file is already in the repo, you can skip this step.

---

## Build Steps

### 1. Clone the RNNoise Source

```bash
cd Desktop
git clone https://github.com/xiph/rnnoise.git native/rnnoise-src --depth 1
```

### 2. Download Pre-trained Model Weights

The RNNoise neural network weights are hosted separately and must be downloaded:

```bash
cd native/rnnoise-src

# Read the model version hash
hash=$(cat model_version | tr -d '\r\n')

# Download (~57MB)
curl -L -o "rnnoise_data-${hash}.tar.gz" \
  "https://media.xiph.org/rnnoise/models/rnnoise_data-${hash}.tar.gz"

# Extract into src/
tar xf "rnnoise_data-${hash}.tar.gz"

cd ../..
```

Verify these files exist after extraction:

```
native/rnnoise-src/src/rnnoise_data.c   (~78MB — model weights)
native/rnnoise-src/src/rnnoise_data.h   (~1KB  — struct definitions)
```

### 3. Build the Native Addon

From the project root (`Desktop/`):

```bash
npm run build:native
```

This runs `node-gyp rebuild` inside `native/rnnoise/`, which:

- Compiles all RNNoise C source files (`denoise.c`, `rnn.c`, `pitch.c`, etc.)
- Compiles the N-API wrapper (`addon.cc`)
- Links everything into a single `rnnoise.node` file (~15MB)

Output location:

```
native/rnnoise/build/Release/rnnoise.node
```

### 4. Rebuild for Electron ABI

The addon must match Electron's Node ABI version (not your system Node):

```bash
npm run rebuild:native
```

This uses `@electron/rebuild` to recompile the addon against Electron's headers.

### 5. Verify

```bash
node -e "const r = new (require('./native/rnnoise/build/Release/rnnoise')).RNNoise(); console.log('Frame size:', r.getFrameSize()); r.destroy();"
```

Expected output:

```
Frame size: 480
```

---

## Project Structure

```
native/
├── rnnoise/                    ← Addon project (committed to git)
│   ├── addon.cc                ← N-API C++ wrapper
│   ├── binding.gyp             ← node-gyp build config
│   ├── index.d.ts              ← TypeScript type declarations
│   ├── package.json            ← Module metadata for @electron/rebuild
│   └── build/Release/
│       └── rnnoise.node        ← Compiled addon (~15MB)
│
└── rnnoise-src/                ← Cloned from xiph/rnnoise (gitignored)
    ├── include/
    │   └── rnnoise.h           ← Public C API
    ├── src/
    │   ├── denoise.c           ← Core denoising logic
    │   ├── rnn.c               ← Neural network inference
    │   ├── pitch.c             ← Pitch detection
    │   ├── kiss_fft.c          ← FFT implementation
    │   ├── rnnoise_data.c      ← Pre-trained model weights (downloaded)
    │   ├── rnnoise_data.h      ← Model struct definitions  (downloaded)
    │   └── ...
    └── model_version           ← Hash used to download weights
```

---

## API Reference

The addon exposes a single `RNNoise` class:

```typescript
import type { RNNoise } from '../native/rnnoise/index';

// Create instance (synchronous — no async WASM loading)
const rnnoise = new RNNoise();

// Process a 10ms frame (480 samples at 48kHz)
// Input:  Float32Array(480) in range [-32768, 32767] (16-bit PCM scale)
// Output: Float32Array(480) denoised, same range
const denoised = rnnoise.process(inputFrame);

// Get frame size (always 480)
const frameSize = rnnoise.getFrameSize();

// Free native resources when done
rnnoise.destroy();
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Could not find any Visual Studio installation` | No C++ compiler | Install VS Build Tools 2022 with "Desktop development with C++" |
| `ModuleNotFoundError: No module named 'distutils'` | Python 3.12+ removed distutils | `python -m pip install setuptools` |
| `Cannot open include file: 'rnnoise_data.h'` | Model weights not downloaded | Run step 2 (download + extract) |
| `ERR_DLOPEN_FAILED` at Electron startup | ABI mismatch | Run `npm run rebuild:native` |
| `rnnoise.node not found` | Addon not built | Run `npm run build:native` |
