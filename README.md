# API Throttling + Semantic Chatbot Cache

This project is a full-stack ByteMonk app with:
- A React frontend
- A Node.js backend (auth, courses, chatbot API)
- A Python embedding service (Jina embeddings)
- Redis Stack (RediSearch) for semantic vector cache

---

## Chatbot Flow

The chatbot follows this pipeline:

1. User sends a question from the frontend chatbot.
2. Node backend receives the query at `/api/chatbot`.
3. Backend calls Python embedding API (`/api/embed`) to generate a query embedding.
4. Backend searches Redis vector index (semantic cache):
   - If a similar query is found (above threshold), return cached answer.
   - If not found, continue to LLM call.
5. Backend calls Groq LLM for a fresh answer.
6. Backend stores the new `{query_text, embedding, answer}` in Redis for future semantic hits.
7. Backend returns response to frontend.

In short: `Query -> Embedding -> Redis Vector Cache -> (Hit? return) -> LLM -> Cache -> Return`

---

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express
- Embeddings: FastAPI + Transformers (`jinaai/jina-embeddings-v2-base-en`)
- Cache/Search: Redis Stack + RediSearch vector index
- LLM: Groq API

---

## Prerequisites

- Node.js (18+ recommended)
- Python (3.10+ recommended)
- Docker Desktop (for Redis Stack)

---

## Project Structure

- `frontend/` - React app
- `backend/` - Express API, chatbot, Redis semantic cache logic
- `python-backend/` - Embedding service

---

## 1) Run Redis Stack (RediSearch) on Docker Desktop

You need Redis Stack (not plain Redis) for `FT.CREATE` / vector search commands.

### Option A: Docker CLI

```bash
docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
```

- Redis endpoint: `redis://127.0.0.1:6379`
- RedisInsight UI: [http://localhost:8001](http://localhost:8001)

### Option B: Docker Desktop UI

1. Open Docker Desktop.
2. Pull image `redis/redis-stack:latest`.
3. Run container with ports:
   - `6379:6379`
   - `8001:8001`
4. Start container.

---

## 2) Configure Environment Variables

Create/update `backend/.env` with your values:

```env
PORT=8080
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your_jwt_secret_here

GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

REDIS_URL=redis://127.0.0.1:6379
EMBEDDING_SERVICE_URL=http://127.0.0.1:5090/api/embed

CHATBOT_VECTOR_INDEX=chatbot_semantic_idx
CHATBOT_VECTOR_PREFIX=chatbot:semantic:
CHATBOT_VECTOR_DIMS=768
CHATBOT_SIMILARITY_THRESHOLD=0.82
CHATBOT_HYBRID_ALPHA=0.35
CHATBOT_VECTOR_CANDIDATES=8
```

Notes:
- Keep `CHATBOT_VECTOR_DIMS` aligned with embedding model output (`768` for current model).
- Do not commit real API keys.

---

## 3) Start Python Embedding Service

From `python-backend/`:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 5090
```

Health check:
- [http://127.0.0.1:5090/health](http://127.0.0.1:5090/health)

---

## 4) Start Node Backend

From `backend/`:

```bash
npm install
npm run dev
```

Backend runs on:
- [http://127.0.0.1:8080](http://127.0.0.1:8080)

---

## 5) Start Frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Frontend runs on:
- [http://localhost:5173](http://localhost:5173)

---

## Quick Validation

1. Open frontend and send a chatbot query.
2. First request should usually return with source `LLM`.
3. Send same/similar query again:
   - should return from Redis semantic cache (`source: redis`).

---

## Common Issues

- Redis vector commands fail (`unknown command FT.CREATE`):
  - You are using plain Redis. Switch to `redis/redis-stack`.
- Embedding endpoint errors:
  - Ensure Python service is running on `5090`.
- No semantic hits:
  - Check similarity threshold and embedding dims in `backend/.env`.
  - Confirm Redis container is healthy and reachable.

