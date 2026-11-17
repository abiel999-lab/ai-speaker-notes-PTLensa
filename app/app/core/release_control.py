"""Temporary release gates; no account, wallet or document mutations."""
from pathlib import Path
from fastapi.responses import JSONResponse
MAINTENANCE_FILE=Path('/app/.notepreso-v2-maintenance')
RETENTION_FILE=Path('/app/.notepreso-v2-preserve-startup')
HEALTH={'/health','/health/live','/health/ready','/api/v1/health/live','/api/v1/health/ready'}
def hold_startup_retention():
 return RETENTION_FILE.exists()
def maintenance_response(path):
 if MAINTENANCE_FILE.exists()and path not in HEALTH and not path.startswith('/api/internal/platform/v2/'):
  return JSONResponse({'detail':'NotePreso is being updated. Please try again shortly'},status_code=503,headers={'Retry-After':'30','Cache-Control':'no-store'})
 return None
