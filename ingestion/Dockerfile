FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── runtime stage ────────────────────────────────────────────────────────
FROM python:3.12-slim

# Create non-root user
RUN groupadd --gid 1000 appuser && \
    useradd  --uid 1000 --gid appuser --shell /bin/false appuser && \
    mkdir -p /app/data && chown -R appuser:appuser /app

WORKDIR /app

COPY --from=builder /install /usr/local

COPY --chown=appuser:appuser . .

USER appuser

CMD ["python", "ingest.py"]
