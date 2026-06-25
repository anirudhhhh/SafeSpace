# SafeSpace Deployment Guide

## Render Deployment

This repository includes a `render.yaml` blueprint that creates:

- a Node web service for the API and Socket.io server
- a static site for the React client

### Prerequisites

1. Render account
2. MongoDB Atlas database
3. OpenRouter API key or other AI provider key used by your backend
4. (Optional) Redis instance — Render offers managed Redis, or use a free tier from Redis Cloud

### Steps

1. Push the repository to GitHub.
2. In Render, choose New → Blueprint.
3. Connect the GitHub repository.
4. Render will read `render.yaml` and create the services.
5. Add the environment variables listed below.
6. Redeploy after the variables are set.

### Production environment variables

Set these in Render:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-here
OPENROUTER_API_KEY=your-api-key
CLIENT_URL=https://your-client.onrender.com
CORS_ORIGIN=https://your-client.onrender.com
REACT_APP_API_URL=https://your-server.onrender.com/api
REACT_APP_SOCKET_URL=https://your-server.onrender.com
```

### Redis (optional but recommended)

Set `REDIS_URL` to enable:

- **Distributed rate limiting** — shared counters across server instances
- **Response caching** — reduces MongoDB load for public endpoints
- **Socket.io scaling** — pub/sub adapter for multi-instance WebSocket broadcasting

```env
REDIS_URL=redis://red-xxxx:6379
```

The application works correctly without Redis. All Redis-dependent features
gracefully fall back to in-memory alternatives.

### Notes

- Render supports WebSockets on web services, so Socket.io should work.
- Make sure the client environment variables point to the deployed server URL.
- Keep local `.env` files out of git.
- If scaling to multiple server instances, a Redis instance is required for
  consistent rate limiting and socket event broadcasting.

## Local development

### Example

```bash
cd server
cp ../.env.example .env
npm install
npm run dev

cd ../client
npm install
npm start
```

### Running Redis locally

```bash
# macOS
brew install redis && brew services start redis

# Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping
```

The server logs will show whether Redis features are active:

```
Redis connected
[rate-limit] Using Redis store
[socket] Redis adapter attached (multi-instance ready)
```
