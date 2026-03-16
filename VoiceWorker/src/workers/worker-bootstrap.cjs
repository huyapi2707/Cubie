/**
 * Worker bootstrap script (CommonJS) for development.
 *
 * Node 18 cannot load .ts files in Worker threads even with tsx,
 * because the ESM loader hooks don't propagate to workers.
 *
 * This file uses tsx's CJS-based register() API to enable TypeScript
 * support, then dynamically imports the actual worker module.
 */

// Register tsx transform hooks (works in Node 18+)
require("tsx/cjs");

// Load the actual TypeScript worker
require("./audio-worker.ts");
