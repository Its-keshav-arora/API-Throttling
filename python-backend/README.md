# Python Backend (Embeddings Service)

This service only creates query embeddings for the chatbot.

## Flow

1. Receive chatbot query text.
2. Generate embedding using `jinaai/jina-embeddings-v2-base-en`.
3. Return vector to caller.

Redis vector search, threshold matching, LLM fallback, and cache storage are handled by the Node backend.

## Setup

1. Create virtual env and install dependencies:
   - `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and fill values.
3. Start the API:
   - `uvicorn main:app --host 0.0.0.0 --port 8090 --reload`

## Troubleshooting

- If startup fails with `ModuleNotFoundError: No module named 'transformers.onnx'`, reinstall dependencies after pulling latest changes:
  - `pip install --upgrade pip`
  - `pip install --force-reinstall -r requirements.txt`

## Endpoint

- `POST /api/embed`
  - Body: `{ "message": "your question" }`
  - Response:
    - `{ "message": "...", "embedding_dims": 768, "embedding": [ ... ] }`
