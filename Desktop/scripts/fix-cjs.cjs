const fs = require('fs');
const path = require('path');

/**
 * After TypeScript compiles main/preload to dist/,
 * place a local package.json in each output directory
 * to mark them as CommonJS (overriding the root "type": "module").
 *
 * This lets the root package.json use "type": "module" (Vite is happy)
 * while Electron's main/preload still load as CommonJS.
 */
const content = JSON.stringify({ type: 'commonjs' }, null, 2) + '\n';

['dist/main', 'dist/preload'].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), content);
});

console.log('✓ Created CJS package.json markers in dist/main and dist/preload');
