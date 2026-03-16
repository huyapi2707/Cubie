# Voice Worker

**Production-ready Multi-User WebSocket Server** for real-time audio streaming and processing.

Built for the Cubie desktop client to stream microphone audio and receive processed audio responses (transcripts, translations, synthesized speech).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Fastify Server                        │
│  /health  /ready  /metrics                                  │
├─────────────────────────────────────────────────────────────┤
│                   WebSocket Gateway (/ws)                   │
│  • Connection lifecycle                                     │
│  • Message routing (JSON control + binary audio)            │
│  • Zod schema validation                                    │
├──────────────────────┬──────────────────────────────────────┤
│   Session Manager    │       Audio Pipeline Service         │
│  • Per-user session  │  • STT → Translation → TTS           │
│  • Audio buffering   │  • Progressive result delivery       │
│  • Heartbeat monitor │  • Per-stage error handling           │
├──────────────────────┴──────────────────────────────────────┤
│                      Worker Pool                            │
│  • Fixed-size thread pool                                   │
│  • Task queuing & timeouts                                  │
│  • Message-passing to/from worker threads                   │
├─────────────────────────────────────────────────────────────┤
│               Session Store (pluggable)                     │
│  • In-memory (single instance / dev)                        │
│  • Redis (horizontal scaling / production)                  │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
src/
├── index.ts              # Entry point, graceful shutdown
├── config/               # Zod-validated env configuration
├── server/               # Fastify app factory, routes, plugins
├── websocket/            # WebSocket gateway & message routing
├── sessions/             # Session manager + store adapters
│   ├── session-manager   # Lifecycle, heartbeat, audio buffers
│   ├── memory-store      # In-memory SessionStore
│   └── redis-store       # Redis SessionStore
├── workers/              # Worker thread pool
│   ├── worker-pool       # Pool manager, dispatch, timeouts
│   └── audio-worker      # Worker script (STT/translate/TTS)
├── services/             # Business logic orchestration
│   └── audio-pipeline    # STT → Translate → TTS pipeline
├── types/                # Shared TypeScript types
│   ├── messages          # Client↔Server message protocol
│   ├── session           # Session & SessionStore interfaces
│   └── worker            # Worker task types
└── utils/                # Logger, metrics
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18 (20+ recommended)
- Redis (optional, for horizontal scaling)

### Install & Run

```bash
# Install dependencies
npm install

# Start in development mode (hot-reload)
npm run dev

# Build for production
npm run build
npm start
```

### Docker

```bash
# Build and run with Docker Compose (includes Redis)
docker compose up --build

# Or standalone
docker build -t voice-worker .
docker run -p 3200:3200 --env-file .env voice-worker
```

---

## API Endpoints

| Endpoint   | Method | Description                          |
|------------|--------|--------------------------------------|
| `/health`  | GET    | Health check (uptime, timestamp)     |
| `/ready`   | GET    | Readiness check (workers, sessions)  |
| `/metrics` | GET    | Counters, latency stats, pool status |
| `/ws`      | WS     | WebSocket audio streaming endpoint   |

---

## WebSocket Protocol

### Client → Server (JSON)

**Start streaming:**
```json
{ "type": "start", "sourceLanguage": "en", "targetLanguage": "ja" }
```

**Stop streaming:**
```json
{ "type": "stop" }
```

**Update config mid-stream:**
```json
{ "type": "config", "sourceLanguage": "en", "targetLanguage": "ko" }
```

**Ping:**
```json
{ "type": "ping" }
```

### Client → Server (Binary)

Raw audio frames (PCM, 100–200ms chunks, max 64KB per chunk).

### Server → Client (JSON)

```json
{ "type": "session_created", "sessionId": "uuid", "timestamp": 1234567890 }
{ "type": "transcript", "text": "hello", "isFinal": true, "timestamp": 1234567890 }
{ "type": "translation", "text": "こんにちは", "sourceLanguage": "en", "targetLanguage": "ja", "timestamp": 1234567890 }
{ "type": "error", "code": "INVALID_MESSAGE", "message": "...", "timestamp": 1234567890 }
{ "type": "session_ended", "reason": "client_stop", "timestamp": 1234567890 }
{ "type": "pong", "timestamp": 1234567890 }
```

### Server → Client (Binary)

Synthesized TTS audio frames.

---

## Configuration

All configuration is via environment variables. See `.env.example` for the full list.

| Variable                  | Default       | Description                    |
|---------------------------|---------------|--------------------------------|
| `HOST`                    | `0.0.0.0`     | Bind host                      |
| `PORT`                    | `3200`        | Bind port                      |
| `NODE_ENV`                | `development` | Environment mode               |
| `REDIS_URL`               | *(empty)*     | Redis URL (enables Redis store)|
| `WORKER_POOL_SIZE`        | `4`           | Number of worker threads       |
| `WORKER_TASK_TIMEOUT_MS`  | `30000`       | Task timeout                   |
| `WS_MAX_PAYLOAD_BYTES`    | `1048576`     | Max WebSocket payload (1MB)    |
| `WS_HEARTBEAT_INTERVAL_MS`| `30000`      | Heartbeat interval             |
| `AUDIO_CHUNK_MAX_BYTES`   | `65536`       | Max single audio chunk (64KB)  |
| `AUDIO_BUFFER_MAX_BYTES`  | `10485760`    | Max audio buffer per session   |
| `LOG_LEVEL`               | `info`        | Pino log level                 |

---

## Horizontal Scaling

```
                    ┌──────────────┐
                    │ Load Balancer│
                    └──────┬───────┘
               ┌───────────┼───────────┐
               ▼           ▼           ▼
        ┌────────────┬────────────┬────────────┐
        │  Worker 1  │  Worker 2  │  Worker N  │
        └──────┬─────┴──────┬─────┴──────┬─────┘
               └────────────┼────────────┘
                            ▼
                    ┌──────────────┐
                    │    Redis     │
                    └──────────────┘
```

Set `REDIS_URL` to enable shared session state across instances.

---

## Integrating Real Services

The worker stubs in `src/workers/audio-worker.ts` are ready to be replaced:

- **STT**: Google Cloud Speech, Azure Cognitive, Whisper API
- **Translation**: Google Translate, DeepL, Azure Translator
- **TTS**: Google Cloud TTS, Azure TTS, ElevenLabs

Each handler follows the same interface — replace the stub logic and the rest of the pipeline works unchanged.

---

## License

MIT
