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




class OidcExchangeError(RuntimeError):
    """Safe OIDC token-exchange error that never contains client secrets."""

    def __init__(self, message: str, *, status_code: int = 502, error_code: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code

@dataclass(frozen=True)
class OidcLoginState:
    state: str
    verifier: str
    return_to: str
    expires_at: int


class KeycloakOidcClient:
    def __init__(
        self,
        settings: Settings,
        *,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_path: str = "/auth/callback",
    ) -> None:
        self.settings = settings
        self.issuer = settings.keycloak_issuer.rstrip("/")
        self.internal_issuer = (settings.keycloak_internal_issuer or settings.keycloak_issuer).rstrip("/")
        self.client_id = client_id or settings.keycloak_client_id
        if client_secret is None:
            self.client_secret = settings.keycloak_client_secret.get_secret_value() if settings.keycloak_client_secret else ""
        else:
            self.client_secret = client_secret
        self.public_base_url = settings.public_base_url.rstrip("/")
        normalized_path = redirect_path if redirect_path.startswith("/") else f"/{redirect_path}"
        self.redirect_uri = f"{self.public_base_url}{normalized_path}"
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
        endpoint = self._internal_endpoint(discovery["token_endpoint"])
        try:
            with httpx.Client(timeout=20.0, follow_redirects=False) as client:
                if self.client_secret:
                    # Prefer the standard HTTP Basic client authentication method.
                    response = client.post(
                        endpoint,
                        data=body,
                        auth=(self.client_id, self.client_secret),
                        headers={"Accept": "application/json"},
                    )
                    # Older/existing Keycloak client setups may expect client_secret_post.
                    if response.status_code == 401:
                        post_body = dict(body)
                        post_body["client_secret"] = self.client_secret
                        response = client.post(
                            endpoint,
                            data=post_body,
                            headers={"Accept": "application/json"},
                        )
                else:
                    response = client.post(endpoint, data=body, headers={"Accept": "application/json"})
        except httpx.HTTPError as exc:
            raise OidcExchangeError("Unable to reach the Keycloak token endpoint.", status_code=503) from exc

        if response.status_code >= 400:
            error_code = None
            description = ""
            try:
                payload = response.json()
                error_code = str(payload.get("error") or "") or None
                description = str(payload.get("error_description") or "").strip()
            except ValueError:
                pass

            if response.status_code == 401 or error_code == "invalid_client":
                raise OidcExchangeError(
                    f"Keycloak rejected the OIDC client credentials for {self.client_id}. "
                    "Verify the matching client secret in the application environment, then restart the app.",
                    status_code=503,
                    error_code=error_code or "invalid_client",
                )
            safe_detail = description or error_code or f"HTTP {response.status_code}"
            raise OidcExchangeError(
                f"Keycloak token exchange failed: {safe_detail}",
                status_code=502,
                error_code=error_code,
            )
        return response.json()

    def reset_caches(self) -> None:
        """Drop cached discovery/JWKS so a fresh login can recover from rotation."""
        self._discovery = None
        self._jwks = None
        self._jwks_at = 0.0

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

    def _verification_key(self, token: str):
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
        return jwt.PyJWK.from_dict(key_data).key

    def validate_id_token(self, token: str) -> dict:
        return jwt.decode(
            token,
            key=self._verification_key(token),
            algorithms=["RS256", "PS256"],
            audience=self.client_id,
            issuer=self.issuer,
            leeway=self.settings.keycloak_clock_skew_seconds,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )

    def validate_access_token(self, token: str) -> dict:
        """Validate a Keycloak access token and bind it to this OIDC client.

        A single forced JWKS refresh is attempted when cryptographic validation
        fails. This handles signing-key rotation/stale local key cache without
        weakening issuer, time, or client binding checks.
        """
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                claims = jwt.decode(
                    token,
                    key=self._verification_key(token),
                    algorithms=["RS256", "PS256"],
                    issuer=self.issuer,
                    leeway=self.settings.keycloak_clock_skew_seconds,
                    options={
                        "require": ["exp", "iat", "iss", "sub"],
                        "verify_aud": False,
                    },
                )
                azp = str(claims.get("azp") or "")
                aud = claims.get("aud")
                audiences = {str(item) for item in aud} if isinstance(aud, list) else ({str(aud)} if aud else set())
                if azp != self.client_id and self.client_id not in audiences:
                    raise RuntimeError("OIDC access token is not authorized for this client.")
                return claims
            except jwt.PyJWTError as exc:
                last_error = exc
                if attempt == 0:
                    self._jwks = None
                    self._jwks_at = 0.0
                    continue
                raise
        assert last_error is not None
        raise last_error


    def userinfo(self, access_token: str) -> dict:
        """Fetch the authenticated user's OpenID Connect profile.

        The access token is validated locally first by the callback, then the same
        token is presented to Keycloak's userinfo endpoint over HTTPS. This avoids
        relying on optional/custom ID-token audience mappers for profile loading.
        """
        discovery = self.discovery()
        endpoint = discovery.get("userinfo_endpoint")
        if not endpoint:
            raise RuntimeError("OIDC userinfo endpoint is unavailable.")
        try:
            with httpx.Client(timeout=15.0, follow_redirects=False) as client:
                response = client.get(
                    self._internal_endpoint(str(endpoint)),
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json",
                    },
                )
        except httpx.HTTPError as exc:
            raise RuntimeError("Unable to reach the Keycloak userinfo endpoint.") from exc
        if response.status_code >= 400:
            raise RuntimeError(f"Keycloak userinfo request failed with HTTP {response.status_code}.")
        payload = response.json()
        if not isinstance(payload, dict) or not payload.get("sub"):
            raise RuntimeError("Keycloak userinfo response is missing the subject.")
        return payload

    def logout_url(self, post_logout_redirect_uri: str | None = None) -> str:
        """Build an RP-initiated logout URL for this client.

        A caller may provide a registered post-logout redirect. The admin re-auth
        flow uses /admin so a cleared Keycloak SSO session returns straight to the
        dedicated admin login entry point.
        """
        target = post_logout_redirect_uri or f"{self.public_base_url}/"
        endpoint = self.discovery().get("end_session_endpoint")
        if not endpoint:
            return target
        return f"{endpoint}?{urlencode({'client_id': self.client_id, 'post_logout_redirect_uri': target})}"
