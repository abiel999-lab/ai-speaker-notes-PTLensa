FROM ai-speaker-notes:1.7.2b-ai-recovery

USER root

COPY --chown=appuser:appuser app/ /app/app/
COPY --chown=appuser:appuser pyproject.toml /app/pyproject.toml

USER appuser
