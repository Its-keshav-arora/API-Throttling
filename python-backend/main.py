import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModel, AutoTokenizer

load_dotenv()

PORT = int(os.getenv("PORT", "8090"))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "jinaai/jina-embeddings-v2-base-en")

tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL, trust_remote_code=True)
embedding_model = AutoModel.from_pretrained(EMBEDDING_MODEL, trust_remote_code=True)


def _embed(text: str) -> list[float]:
  if hasattr(embedding_model, "encode"):
    try:
      vector = embedding_model.encode(
        [text],
        task="retrieval.query",
        prompt_name="query",
        normalize_embeddings=True,
      )[0]
      return [float(value) for value in vector]
    except TypeError:
      # Some jina model revisions don't support task/prompt_name kwargs.
      vector = embedding_model.encode([text])[0]
      return [float(value) for value in vector]

  # Fallback for models without .encode() support.
  encoded = tokenizer(
    text,
    padding=True,
    truncation=True,
    max_length=8192,
    return_tensors="pt",
  )
  model_output = embedding_model(**encoded)
  token_embeddings = model_output.last_hidden_state
  attention_mask = encoded["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
  summed = (token_embeddings * attention_mask).sum(dim=1)
  counts = attention_mask.sum(dim=1).clamp(min=1e-9)
  sentence_embedding = summed / counts
  normalized = sentence_embedding / sentence_embedding.norm(dim=1, keepdim=True).clamp(min=1e-9)
  return [float(value) for value in normalized[0].detach().cpu().tolist()]


sample_vector = _embed("warmup")
EMBEDDING_DIMS = len(sample_vector)

app = FastAPI(title="ByteMonk Embedding Backend")


class EmbeddingRequest(BaseModel):
  message: str


@app.get("/health")
def health() -> dict[str, int | str]:
  return {"status": "ok", "embedding_dims": EMBEDDING_DIMS}


@app.post("/api/embed")
def embed_message(request: EmbeddingRequest) -> dict[str, int | str | list[float]]:
  normalized_message = request.message.strip()
  if not normalized_message:
    raise HTTPException(status_code=400, detail="Message is required.")

  if len(normalized_message) > 1000:
    raise HTTPException(status_code=400, detail="Message is too long. Keep it under 1000 characters.")

  query_vector = _embed(normalized_message)
  return {
    "message": normalized_message,
    "embedding_dims": EMBEDDING_DIMS,
    "embedding": query_vector,
  }
