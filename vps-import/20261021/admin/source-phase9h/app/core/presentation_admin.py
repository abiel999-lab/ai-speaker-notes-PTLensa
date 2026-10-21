"""Read-only service client for NotePreso Presentation AI metadata.

No browser tokens, project source, credentials, or secrets are ever returned.
The API must be reachable only across the dedicated Docker bridge network.
"""
from __future__ import annotations

import httpx
from fastapi import HTTPException

from app.core.config import Settings


def fetch_presentation_admin_metrics(settings: Settings) -> dict:
    if not settings.presentation_admin_configured:
        raise HTTPException(status_code=503, detail="Presentation AI integration is not configured.")
    assert settings.presentation_admin_api_secret is not None
    secret = settings.presentation_admin_api_secret.get_secret_value()
    try:
        # No proxies, redirects, or external URLs. Host header is the canonical
        # public hostname required by the Presentation production host gate.
        with httpx.Client(timeout=4.0, follow_redirects=False, trust_env=False) as client:
            response = client.get(
                settings.presentation_admin_api_url,
                headers={
                    "Host": "presentation.notepreso.com",
                    "Authorization": f"Bearer {secret}",
                    "Accept": "application/json",
                },
            )
        if response.status_code != 200:
            raise ValueError("invalid upstream status")
        data = response.json()
        if not isinstance(data, dict) or data.get("schemaVersion") != 1:
            raise ValueError("incompatible upstream schema")
        if not isinstance(data.get("counts"), dict) or not isinstance(data.get("recent"), list) or not isinstance(data.get("users"), list):
            raise ValueError("invalid upstream payload")
        return data
    except (httpx.HTTPError, ValueError) as exc:
        # Never leak exception text (which could contain URLs/headers) to browser.
        raise HTTPException(status_code=503, detail="Presentation AI metrics temporarily unavailable.") from None
