from __future__ import annotations

import time
from dataclasses import dataclass
from urllib.parse import quote, urlsplit, urlunsplit

import httpx

from app.core.config import Settings


class KeycloakAdminError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class KeycloakUser:
    id: str
    username: str
    email: str | None
    first_name: str | None
    last_name: str | None
    enabled: bool
    email_verified: bool
    created_timestamp: int | None

    @property
    def display_name(self) -> str:
        full = " ".join(part for part in (self.first_name, self.last_name) if part).strip()
        return full or self.username

    @classmethod
    def from_payload(cls, payload: dict) -> "KeycloakUser":
        return cls(
            id=str(payload.get("id") or ""),
            username=str(payload.get("username") or ""),
            email=str(payload.get("email")) if payload.get("email") else None,
            first_name=str(payload.get("firstName")) if payload.get("firstName") else None,
            last_name=str(payload.get("lastName")) if payload.get("lastName") else None,
            enabled=bool(payload.get("enabled", True)),
            email_verified=bool(payload.get("emailVerified", False)),
            created_timestamp=int(payload["createdTimestamp"]) if payload.get("createdTimestamp") else None,
        )


class KeycloakAdminClient:
    """Minimal server-side Keycloak Admin REST client.

    The browser never receives the service-account secret. The configured Keycloak
    client should only have the realm-management roles needed for user administration.
    """

    def __init__(self, settings: Settings) -> None:
        if not settings.keycloak_admin_configured:
            raise ValueError("Keycloak admin client is not configured.")
        self.settings = settings
        self.issuer = settings.keycloak_issuer.rstrip("/")
        self.internal_issuer = (settings.keycloak_internal_issuer or settings.keycloak_issuer).rstrip("/")
        self.client_id = settings.keycloak_admin_client_id
        assert settings.keycloak_admin_client_secret is not None
        self.client_secret = settings.keycloak_admin_client_secret.get_secret_value()
        self.admin_base = settings.keycloak_admin_api_base_url.rstrip("/") or self._derive_admin_base(self.issuer)
        self.internal_admin_base = self._derive_admin_base(self.internal_issuer)
        if settings.keycloak_admin_api_base_url:
            self.internal_admin_base = self.admin_base
        self._token = ""
        self._token_expires_at = 0.0
        self._http = httpx.Client(timeout=httpx.Timeout(4.0, connect=2.0), follow_redirects=False)
        self._users_cache: list[KeycloakUser] | None = None
        self._users_cache_at = 0.0
        self._users_cache_ttl = 12.0
        self._user_count_cache: int | None = None
        self._user_count_cache_at = 0.0

    @staticmethod
    def _derive_admin_base(issuer: str) -> str:
        parts = urlsplit(issuer)
        path = parts.path.rstrip("/")
        marker = "/realms/"
        if marker not in path:
            raise ValueError("KEYCLOAK_ISSUER must contain /realms/<realm>.")
        root_path, realm_tail = path.split(marker, 1)
        realm = realm_tail.split("/", 1)[0]
        if not realm:
            raise ValueError("Unable to derive Keycloak realm from KEYCLOAK_ISSUER.")
        admin_path = f"{root_path}/admin/realms/{quote(realm, safe='')}"
        return urlunsplit((parts.scheme, parts.netloc, admin_path, "", "")).rstrip("/")

    def _token_endpoint(self) -> str:
        return f"{self.internal_issuer}/protocol/openid-connect/token"

    def _access_token(self) -> str:
        now = time.time()
        if self._token and now < self._token_expires_at - 30:
            return self._token
        try:
            response = self._http.post(
                self._token_endpoint(),
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise KeycloakAdminError("Unable to reach Keycloak admin token endpoint.") from exc
        if response.status_code >= 400:
            raise KeycloakAdminError(
                "Keycloak rejected the admin service-account credentials.",
                status_code=503,
            )
        payload = response.json()
        token = str(payload.get("access_token") or "")
        if not token:
            raise KeycloakAdminError("Keycloak did not return an admin access token.")
        self._token = token
        self._token_expires_at = now + max(60, int(payload.get("expires_in") or 60))
        return token

    def _request(self, method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> httpx.Response:
        url = f"{self.internal_admin_base}/{path.lstrip('/')}"
        headers = {"Authorization": f"Bearer {self._access_token()}", "Accept": "application/json"}
        try:
            response = self._http.request(method, url, headers=headers, json=json, params=params)
        except httpx.HTTPError as exc:
            raise KeycloakAdminError("Unable to reach the Keycloak Admin API.") from exc
        if response.status_code == 401:
            self._token = ""
            raise KeycloakAdminError("Keycloak admin authorization expired or was rejected.", status_code=503)
        if response.status_code == 403:
            raise KeycloakAdminError(
                "Keycloak service account needs realm-management roles: query-users, view-users, and manage-users.",
                status_code=503,
            )
        if response.status_code == 404:
            raise KeycloakAdminError("Keycloak user was not found.", status_code=404)
        if response.status_code == 409:
            detail = "Keycloak rejected the change because the username or email already exists."
            try:
                body = response.json()
                detail = str(body.get("errorMessage") or body.get("error") or detail)
            except ValueError:
                pass
            raise KeycloakAdminError(detail, status_code=409)
        if response.status_code >= 400:
            detail = f"Keycloak Admin API returned HTTP {response.status_code}."
            try:
                body = response.json()
                detail = str(body.get("errorMessage") or body.get("error") or detail)
            except ValueError:
                pass
            raise KeycloakAdminError(detail, status_code=502)
        return response


    def _invalidate_user_cache(self) -> None:
        self._users_cache = None
        self._users_cache_at = 0.0
        self._user_count_cache = None
        self._user_count_cache_at = 0.0

    def user_count(self) -> int:
        """Return the realm user count using a short cache to keep the admin UI responsive."""
        now = time.time()
        if self._user_count_cache is not None and now - self._user_count_cache_at < self._users_cache_ttl:
            return self._user_count_cache
        response = self._request("GET", "/users/count")
        payload = response.json()
        if isinstance(payload, int):
            count = payload
        elif isinstance(payload, str) and payload.isdigit():
            count = int(payload)
        else:
            raise KeycloakAdminError("Keycloak returned an invalid user count.")
        self._user_count_cache = count
        self._user_count_cache_at = now
        return count

    def list_users(self, *, max_users: int = 1000) -> list[KeycloakUser]:
        now = time.time()
        if self._users_cache is not None and now - self._users_cache_at < self._users_cache_ttl:
            return self._users_cache[:max_users]
        users: list[KeycloakUser] = []
        first = 0
        page_size = 100
        while len(users) < max_users:
            response = self._request(
                "GET",
                "/users",
                params={"first": first, "max": min(page_size, max_users - len(users)), "briefRepresentation": "false"},
            )
            payload = response.json()
            if not isinstance(payload, list) or not payload:
                break
            for item in payload:
                if item.get("serviceAccountClientId"):
                    continue
                users.append(KeycloakUser.from_payload(item))
            if len(payload) < page_size:
                break
            first += page_size
        self._users_cache = list(users)
        self._users_cache_at = now
        self._user_count_cache = len(users)
        self._user_count_cache_at = now
        return users[:max_users]

    def get_user(self, user_id: str) -> KeycloakUser:
        response = self._request("GET", f"/users/{quote(user_id, safe='')}")
        return KeycloakUser.from_payload(response.json())

    def create_user(
        self,
        *,
        username: str,
        email: str | None,
        first_name: str | None,
        last_name: str | None,
        password: str,
        temporary_password: bool,
        email_verified: bool = False,
    ) -> KeycloakUser:
        body = {
            "username": username,
            "email": email or None,
            "firstName": first_name or None,
            "lastName": last_name or None,
            "enabled": True,
            "emailVerified": bool(email_verified),
            "credentials": [
                {"type": "password", "value": password, "temporary": bool(temporary_password)}
            ],
        }
        response = self._request("POST", "/users", json=body)
        location = response.headers.get("Location", "").rstrip("/")
        user_id = location.rsplit("/", 1)[-1] if location else ""
        if not user_id:
            # Fallback for proxies that strip Location: search exact username.
            found = self._request("GET", "/users", params={"username": username, "exact": "true", "max": 2}).json()
            if not found:
                raise KeycloakAdminError("User was created but Keycloak did not return its ID.")
            user_id = str(found[0]["id"])
        self._invalidate_user_cache()
        return self.get_user(user_id)

    def update_user(
        self,
        user_id: str,
        *,
        username: str,
        email: str | None,
        first_name: str | None,
        last_name: str | None,
        email_verified: bool,
    ) -> KeycloakUser:
        current_response = self._request("GET", f"/users/{quote(user_id, safe='')}")
        body = current_response.json()
        body.update(
            {
                "username": username,
                "email": email or None,
                "firstName": first_name or None,
                "lastName": last_name or None,
                "emailVerified": bool(email_verified),
            }
        )
        self._request("PUT", f"/users/{quote(user_id, safe='')}", json=body)
        self._invalidate_user_cache()
        return self.get_user(user_id)

    def set_enabled(self, user_id: str, enabled: bool) -> KeycloakUser:
        current_response = self._request("GET", f"/users/{quote(user_id, safe='')}")
        body = current_response.json()
        body["enabled"] = bool(enabled)
        self._request("PUT", f"/users/{quote(user_id, safe='')}", json=body)
        self._invalidate_user_cache()
        return self.get_user(user_id)

    def reset_password(self, user_id: str, *, password: str, temporary: bool) -> None:
        self._request(
            "PUT",
            f"/users/{quote(user_id, safe='')}/reset-password",
            json={"type": "password", "value": password, "temporary": bool(temporary)},
        )

    def delete_user(self, user_id: str) -> None:
        self._request("DELETE", f"/users/{quote(user_id, safe='')}")
        self._invalidate_user_cache()
