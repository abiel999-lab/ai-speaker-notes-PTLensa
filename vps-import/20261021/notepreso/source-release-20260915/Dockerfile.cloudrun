FROM python:3.13-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-impress \
       libreoffice-core \
       fonts-dejavu-core \
       fonts-liberation \
       fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/ai-speaker-jobs \
    && chown -R appuser:appuser /app /tmp/ai-speaker-jobs

USER appuser

# Cloud Run injects PORT. Do not hardcode a port in production.
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
