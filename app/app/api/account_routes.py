from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.routes import _reject_cross_site_browser_request, _require_api_access


router = APIRouter(prefix="/api/v1/account", tags=["account"])


@router.get("/plan")
def account_plan(request: Request) -> dict[str, object]:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request)

    entitlements = request.app.state.entitlements
    snapshot = entitlements.account_snapshot(identity.owner_key)

    # Keep credit composition at the HTTP boundary instead of nesting
    # credit_snapshot() inside account_snapshot(). This avoids recursive
    # entitlement calls while keeping one frontend account endpoint.
    snapshot["credits"] = entitlements.credit_snapshot(identity.owner_key)

    return snapshot
