import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { PluginOption } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev-server plugin that serves onnxruntime-web .mjs files when Vite's
 * pre-bundled code tries to dynamically import them from .vite/deps/.
 */
function onnxRuntimeDevFix(): PluginOption {
  const ortDist = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');

  return {
    name: 'onnx-runtime-dev-fix',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (url.includes('.vite/deps/ort-') && url.includes('.mjs')) {
          const filename = url.split('/').pop()?.split('?')[0];
          if (filename) {
            const filePath = path.join(ortDist, filename);
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    onnxRuntimeDevFix(),
    viteStaticCopy({
      targets: [
        {
          src: '../../node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
          dest: './',
        },
        {
          src: '../../node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
          dest: './',
        },
        {
          src: '../../node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
          dest: './',
        },
        {
          src: '../../node_modules/onnxruntime-web/dist/*.wasm',
          dest: './',
        },
        {
          src: '../../node_modules/onnxruntime-web/dist/*.mjs',
          dest: './',
        },
      ],
    }),
  ],
  root: path.resolve(__dirname, 'app/renderer'),
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'app/renderer'),
      '@shared': path.resolve(__dirname, 'app/shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
