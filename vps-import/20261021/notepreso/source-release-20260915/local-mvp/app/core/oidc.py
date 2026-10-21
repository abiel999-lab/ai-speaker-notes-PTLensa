from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import Settings


@dataclass(frozen=True)
class OidcLoginState:
    state: str
    verifier: str
    return_to: str
    expires_at: int


class KeycloakOidcClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.issuer = settings.keycloak_issuer.rstrip("/")
        self.internal_issuer = (settings.keycloak_internal_issuer or settings.keycloak_issuer).rstrip("/")
        self.client_id = settings.keycloak_client_id
        self.client_secret = settings.keycloak_client_secret.get_secret_value() if settings.keycloak_client_secret else ""
        self.public_base_url = settings.public_base_url.rstrip("/")
        self.redirect_uri = f"{self.public_base_url}/auth/callback"
        self._discovery: dict | None = None
        self._jwks: dict | None = None
        self._jwks_at = 0.0

    @staticmethod
    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")

    def discovery(self) -> dict:
        if self._discovery is not None:
            return self._discovery
        url = f"{self.internal_issuer}/.well-known/openid-configuration"
        with httpx.Client(timeout=15.0, follow_redirects=False) as client:
            response = client.get(url)
            response.raise_for_status()
            payload = response.json()
        if payload.get("issuer", "").rstrip("/") != self.issuer:
            raise RuntimeError("OIDC discovery issuer mismatch.")
        self._discovery = payload
        return payload

    def _internal_endpoint(self, public_url: str) -> str:
        if self.internal_issuer == self.issuer:
            return public_url
        if public_url.startswith(self.issuer):
            return self.internal_issuer + public_url[len(self.issuer):]
        return public_url

    def new_login(self, return_to: str = "/") -> tuple[str, OidcLoginState]:
        discovery = self.discovery()
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        challenge = self._b64url(hashlib.sha256(verifier.encode("ascii")).digest())
        login = OidcLoginState(state=state, verifier=verifier, return_to=return_to, expires_at=int(time.time()) + 600)
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": "openid profile email",
            "redirect_uri": self.redirect_uri,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return f"{discovery['authorization_endpoint']}?{urlencode(params)}", login

    def exchange(self, *, code: str, verifier: str) -> dict:
        discovery = self.discovery()
        body = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri,
            "client_id": self.client_id,
            "code_verifier": verifier,
        }
        if self.client_secret:
            body["client_secret"] = self.client_secret
        with httpx.Client(timeout=20.0, follow_redirects=False) as client:
            response = client.post(self._internal_endpoint(discovery["token_endpoint"]), data=body)
            response.raise_for_status()
            return response.json()

    def _load_jwks(self) -> dict:
        if self._jwks is not None and time.time() - self._jwks_at < 3600:
            return self._jwks
        discovery = self.discovery()
        with httpx.Client(timeout=15.0, follow_redirects=False) as client:
            response = client.get(self._internal_endpoint(discovery["jwks_uri"]))
            response.raise_for_status()
            self._jwks = response.json()
            self._jwks_at = time.time()
        return self._jwks

    def validate_id_token(self, token: str) -> dict:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        jwks = self._load_jwks()
        key_data = next((item for item in jwks.get("keys", []) if item.get("kid") == kid), None)
        if key_data is None:
            self._jwks = None
            jwks = self._load_jwks()
            key_data = next((item for item in jwks.get("keys", []) if item.get("kid") == kid), None)
        if key_data is None:
            raise RuntimeError("OIDC signing key is unavailable.")
        public_key = jwt.PyJWK.from_dict(key_data).key
        return jwt.decode(
            token,
            key=public_key,
            algorithms=["RS256", "PS256"],
            audience=self.client_id,
            issuer=self.issuer,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )

    def logout_url(self) -> str:
        endpoint = self.discovery().get("end_session_endpoint")
        if not endpoint:
            return f"{self.public_base_url}/"
        return f"{endpoint}?{urlencode({'client_id': self.client_id, 'post_logout_redirect_uri': self.public_base_url + '/'})}"
