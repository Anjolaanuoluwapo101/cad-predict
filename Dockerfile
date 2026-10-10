# Single-service image: Node builds the React frontend, Python serves it + the API.
# Run from the repo root (build context = cad-risk/).

# ---- Stage 1: frontend build ----
FROM node:22-slim AS web
WORKDIR /build/frontend
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

EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
