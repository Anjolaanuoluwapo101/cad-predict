# Single-service image: Node builds the React frontend, Python serves it + the API.
# Run from the repo root (build context = cad-risk/).

# ---- Stage 1: frontend build ----
FROM node:22-slim AS web
WORKDIR /build/frontend
# Vite reads these at BUILD time and bakes them into the JS bundle.
ARG VITE_API_URL=""
ARG VITE_GROQ_MODEL=""
# Throwaway-only: a baked key ships inside the public bundle, readable by anyone
# in devtools. Prefer the HEARTLY_GROQ_KEY runtime env (see entrypoint) instead.
ARG VITE_GROQ_API_KEY=""
ARG VITE_GROQ_MODEL="openai/gpt-oss-20b"
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend + static ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY config.yaml ./
COPY src/ ./src/
COPY api/ ./api/
COPY models/ ./models/
COPY data/raw/ ./data/raw/
COPY --from=web /build/frontend/dist ./frontend/dist
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh

EXPOSE 8000
CMD ["./entrypoint.sh"]
