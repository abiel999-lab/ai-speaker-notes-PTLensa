from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.routing import APIRoute

import app.main as existing
from app.services.support_mail import SupportRateLimiter
from app.services.support_mail_ssh import SSHSupportMailer

# Dedicated anonymous Support service.
# No database, billing, jobs, or identity session initialization.
existing.request_identity = lambda request: None

@asynccontextmanager
async def lifespan(app):
    app.state.support_mailer = SSHSupportMailer()
    app.state.support_limiter = SupportRateLimiter()
    yield

app = FastAPI(
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

support_routes = [
    route
    for route in existing.app.router.routes
    if isinstance(route, APIRoute)
    and route.path == "/support"
]

if len(support_routes) != 2:
    raise RuntimeError("Unexpected Support route count")

for route in support_routes:
    app.router.routes.append(route)

@app.get("/_contact_health")
def contact_health():
    return {"status": "ok", "service": "notepreso-contact"}

from app.core.support_widget import eligible, extend_csp
@app.middleware("http")
async def support_widget_policy(request, call_next):
    response = await call_next(request)
    if eligible(request.url.hostname, request.url.path, response.headers.get("content-type", "")):
        response.headers["Content-Security-Policy"] = extend_csp(response.headers.get("Content-Security-Policy", ""))
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
