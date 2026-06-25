# SafeSpace

SafeSpace is a mental-wellness platform with an AI companion, anonymous forum spaces, and a calm dark-themed interface.

## Features

- AI chat with emotion-aware personality switching
- Anonymous forum posts and comments
- Subspaces with live post counts
- Safety-focused messaging for crisis content
- Socket-based real-time chat updates

## Architecture

### Tech Stack

- **Runtime**: Node.js 18+ with Express
- **Database**: MongoDB (Mongoose ODM)
- **Cache & Pub/Sub**: Redis (ioredis) — optional, graceful degradation
- **Real-time**: Socket.io with Redis adapter for horizontal scaling
- **AI**: OpenRouter API with configurable models

### Redis Integration

Redis is used for three distinct purposes, all of which gracefully degrade to in-memory alternatives when Redis is unavailable:

| Feature | Module | Fallback |
|---------|--------|----------|
| **Rate limiting** | `middleware/rateLimiter.js` | In-memory `express-rate-limit` store |
| **Response caching** | `middleware/cache.js` | Direct MongoDB queries (no cache) |
| **Socket.io pub/sub** | `socket/index.js` | In-memory adapter (single-instance only) |

#### Caching Strategy

- **Cached endpoint**: `GET /api/forum/subspaces` (public subspace listing)
- **Cache key**: `forum:subspaces:public`
- **TTL**: 60 seconds
- **Invalidation**: Cache is explicitly deleted when subspaces are created/deleted, users join, or posts are created/deleted
- **Privacy**: Only public, non-sensitive metadata is cached. User-specific data, chat messages, and AI responses are never cached.

### Performance Instrumentation

The `middleware/requestLogger.js` middleware logs request latency for every API call:

```
[perf] GET /api/forum/subspaces 200 12.34ms
[perf] POST /api/auth/login 200 145.67ms
```

- Logs method, path, status code, and duration (sub-ms precision via `process.hrtime`)
- No PII, no request bodies, no auth tokens logged
- Skips `/api/health` to reduce noise
- Compatible with k6 load testing for benchmarking

## Project structure

- `client/` — React frontend
- `server/` — Express + Socket.io API
- `render.yaml` — Render blueprint for the full stack

### Server directory layout

```
server/src/
├── index.js              # Express + Socket.io server entry point
├── config/index.js       # Environment config, MongoDB, Redis client
├── middleware/
│   ├── auth.js           # JWT authentication middleware
│   ├── rateLimiter.js    # Redis-backed rate limiting with fallback
│   ├── cache.js          # Redis cache utility (get/set/invalidate)
│   └── requestLogger.js  # Request latency instrumentation
├── controllers/          # Route handlers (auth, chat, forum)
├── routes/               # Express route definitions
├── services/             # Business logic (emotion, safety, AI, memory)
├── models/               # Mongoose schemas (User, Chat, Post, etc.)
└── socket/index.js       # Socket.io setup with Redis adapter
```

## Local development

### Prerequisites

- Node.js 18+
- MongoDB
- Redis (optional — the app works without it)
- OpenRouter API key

### Running Redis locally

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping    # should print PONG
```

### Backend

```bash
cd server
cp ../.env.example .env
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm start
```

## Environment variables

Create `server/.env` from `.env.example` and set the required values. Common variables include:

| Variable               | Description                      | Required |
| ---------------------- | -------------------------------- | -------- |
| `MONGODB_URI`          | MongoDB connection string        | Yes      |
| `JWT_SECRET`           | Secret used for auth tokens      | Yes      |
| `OPENROUTER_API_KEY`   | OpenRouter key for AI chat       | Yes      |
| `REDIS_URL`            | Redis connection string          | No       |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window in ms          | No       |
| `RATE_LIMIT_MAX`       | Maximum requests per window      | No       |

## Render deployment

This repo includes a `render.yaml` blueprint for:

- `safespace-server` as a Node web service
- `safespace-client` as a static site

### Deploy steps

1. Push the repository to GitHub.
2. In Render, create a new Blueprint and point it at this repo.
3. Render will read `render.yaml` and create both services.
4. Set the production environment variables in Render.
5. Update the client env values to point to the deployed server URL.
6. (Optional) Add a Redis instance in Render and set `REDIS_URL` for distributed rate limiting, caching, and Socket.io scaling.

### Required production env values

- `NODE_ENV=production`
- `MONGODB_URI=<your MongoDB Atlas URI>`
- `JWT_SECRET=<strong random secret>`
- `OPENROUTER_API_KEY=<your API key>`
- `CLIENT_URL=<your Render static site URL>`
- `CORS_ORIGIN=<your Render static site URL>`
- `REACT_APP_API_URL=<your Render server URL>/api`
- `REACT_APP_SOCKET_URL=<your Render server URL>`

### Notes

- Keep secrets out of git; use Render env vars and local `.env` files.
- Render supports WebSockets on web services, so chat should work there.
- Redis is optional but recommended for production deployments with multiple instances.

## API overview

- `/api/auth/register`
- `/api/auth/login`
- `/api/chat`
- `/api/forum/*`
- `/api/health`

## Safety

The backend includes crisis-aware safeguards and resource guidance for self-harm or suicide-related content.
