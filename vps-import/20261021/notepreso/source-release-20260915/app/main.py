from __future__ import annotations

import asyncio
import hmac
import logging
import smtplib
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from app.api.account_routes import router as account_router
from app.api.billing_routes import router as billing_router
from app.api.auth_routes import browser_router as auth_browser_router, router as auth_router
from app.api.chat_routes import general_router as general_chat_router, router as chat_router
from app.api.routes import health_router, router
from app.core.auth import LoginRateLimiter, SessionManager, request_identity
from app.core.billing import BillingService
from app.core.config import get_settings
from app.core.database import DatabaseChatHistoryStore, DatabaseManager
from app.core.entitlements import EntitlementService
from app.core.job_store import FileJobStore
from app.core.oidc import KeycloakOidcClient
from app.core.postgres_job_store import PostgresJobStore
from app.core.version import get_app_version
from app.services.chat import JobChatService
from app.services.integrity import PptxIntegrityValidator
from app.services.jobs import JobProcessor
from app.services.notes.factory import NotesGeneratorFactory
from app.services.notes_writer import PptxNotesWriter
from app.services.payments.paddle import PaddlePaymentClient
from app.services.payments.stripe import StripePaymentClient
from app.services.payments.xendit import XenditPaymentClient
from app.services.pipeline import PresentationPipeline
from app.services.ppt_parser import PptxParser
from app.services.ppt_renderer import AutoSlideRenderer
from app.services.support_mail import (
    REQUEST_TYPES,
    SupportMailer,
    SupportRateLimiter,
    SupportRequest,
    build_mailto,
    clean_message,
    clean_text,
    valid_email,
)

BASE_DIR = Path(__file__).resolve().parent.parent
settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("speaker_notes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = DatabaseManager(settings.database_url) if settings.database_url else None
    if settings.app_env == "production" and db is None:
        raise RuntimeError("DATABASE_URL is required when APP_ENV=production.")
    if db is not None:
        db.init_schema()
        if not db.healthcheck():
            raise RuntimeError("PostgreSQL health check failed during startup.")
        store = PostgresJobStore(settings.storage_dir, db)
    else:
        store = FileJobStore(settings.storage_dir)
    parser = PptxParser()
    renderer = AutoSlideRenderer(
        mode=settings.slide_renderer,
        libreoffice_bin=settings.libreoffice_bin,
        dpi=settings.render_dpi,
        powerpoint_timeout_seconds=settings.powerpoint_render_timeout_seconds,
    )
    generator_factory = NotesGeneratorFactory(settings)
    pipeline = PresentationPipeline(
        parser=parser,
        generator_factory=generator_factory,
        notes_writer=PptxNotesWriter(),
        integrity_validator=PptxIntegrityValidator(parser),
        settings=settings,
        renderer=renderer,
    )

    app.state.settings = settings
    app.state.db = db
    app.state.entitlements = EntitlementService(db, settings)
    xendit_client = XenditPaymentClient(settings) if settings.xendit_available else None
    stripe_client = StripePaymentClient(settings) if settings.stripe_available else None
    paddle_client = PaddlePaymentClient(settings) if settings.paddle_available else None
    app.state.billing = (
        BillingService(db, settings, xendit=xendit_client, stripe=stripe_client, paddle=paddle_client)
        if db is not None
        else None
    )
    if settings.auth_enabled:
        if not settings.auth_configured:
            raise RuntimeError(
                "AUTH_ENABLED=true requires a valid session secret and the configured authentication provider settings."
            )
        assert settings.session_secret is not None
        app.state.session_manager = SessionManager(
            settings.session_secret.get_secret_value(),
            max_age_seconds=settings.session_hours * 3600,
        )
        app.state.login_limiter = LoginRateLimiter()
        app.state.oidc_client = KeycloakOidcClient(settings) if settings.keycloak_enabled else None
    else:
        app.state.oidc_client = None
    app.state.store = store
    app.state.renderer = renderer
    app.state.generator_factory = generator_factory
    chat_history_store = DatabaseChatHistoryStore(db) if db is not None else None
    app.state.chat_service = JobChatService(settings, history_store=chat_history_store) if settings.openai_configured else None
    app.state.processor = JobProcessor(
        store,
        pipeline,
        max_concurrent_jobs=settings.max_concurrent_jobs,
    )
    app.state.support_mailer = SupportMailer(settings)
    app.state.support_limiter = SupportRateLimiter()
    interrupted = store.recover_interrupted()
    if interrupted:
        logger.warning("startup_recovery interrupted_jobs=%s", interrupted)
    removed = store.cleanup_expired(settings.job_retention_hours)
    if removed:
        logger.info("retention_cleanup removed_jobs=%s", removed)
    yield


app = FastAPI(
    title=settings.app_name,
    version=get_app_version(),
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_frontend_origins,
    allow_credentials=settings.auth_enabled,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Requested-With", "X-Demo-Key", "X-CSRF-Token"],
    expose_headers=["Content-Disposition", "X-Request-ID"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "app" / "templates")
app.include_router(auth_router)
app.include_router(auth_browser_router)
app.include_router(account_router)
app.include_router(billing_router)
app.include_router(router)
app.include_router(chat_router)
app.include_router(general_chat_router)
app.include_router(health_router)


@app.get("/paddle/checkout", response_class=HTMLResponse)
def paddle_checkout(request: Request):
    if not settings.paddle_available or settings.paddle_client_token is None:
        return HTMLResponse("Paddle checkout is not configured.", status_code=503)
    return templates.TemplateResponse(
        request=request,
        name="paddle_checkout.html",
        context={
            "paddle_environment": settings.paddle_environment.strip().lower(),
            "paddle_client_token": settings.paddle_client_token.get_secret_value(),
            "return_url": settings.public_base_url.rstrip("/") + "/?billing=success",
        },
    )


@app.middleware("http")
async def request_and_security_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    if request.url.path.startswith("/docs"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
        )
    elif request.url.path == "/paddle/checkout":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self'; "
            "script-src 'self' https://cdn.paddle.com; "
            "img-src 'self' data: https://*.paddle.com; "
            "connect-src 'self' https://*.paddle.com; "
            "frame-src https://*.paddle.com; "
            "base-uri 'none'; frame-ancestors 'none'"
        )
    else:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self'; script-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
        )

    response.headers["Cache-Control"] = "no-store"

    logger.info(
        "request request_id=%s method=%s path=%s status=%s elapsed_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    identity = request_identity(request)
    if settings.auth_enabled and identity is None:
        return RedirectResponse("/auth/login" if settings.keycloak_enabled else "/login", status_code=303)
    renderer_available = request.app.state.renderer.available()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "app_name": settings.app_name,
            "max_upload_mb": settings.max_upload_mb,
            "version": get_app_version(),
            "openai_configured": settings.openai_configured,
            "openai_model": settings.openai_model,
            "openai_use_vision": settings.openai_use_vision,
            "renderer_available": renderer_available,
            "renderer_name": request.app.state.renderer.name,
            "auth_enabled": settings.auth_enabled,
            "username": (identity.display_name or identity.username) if identity else None,
            "terms_version": settings.terms_version,
        },
    )


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    identity = request_identity(request)
    if identity is not None and settings.auth_enabled:
        return RedirectResponse("/", status_code=303)
    if not settings.auth_enabled:
        return RedirectResponse("/", status_code=303)
    if settings.keycloak_enabled:
        return RedirectResponse("/auth/login", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "terms_version": settings.terms_version,
        },
    )


@app.get("/how-to", response_class=HTMLResponse)
def how_to(request: Request):
    identity = request_identity(request)
    return templates.TemplateResponse(
        request=request,
        name="how_to.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "max_upload_mb": settings.max_upload_mb,
            "auth_enabled": settings.auth_enabled,
            "authenticated": identity is not None,
            "username": (identity.display_name or identity.username) if identity else None,
        },
    )


@app.get("/legal", response_class=HTMLResponse)
def legal(request: Request):
    identity = request_identity(request)
    return templates.TemplateResponse(
        request=request,
        name="legal.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "terms_version": settings.terms_version,
            "retention_hours": settings.job_retention_hours,
            "auth_enabled": settings.auth_enabled,
            "authenticated": identity is not None,
            "username": (identity.display_name or identity.username) if identity else None,
        },
    )


@app.get("/refund-policy")
def refund_policy_redirect():
    return RedirectResponse("/support#refund", status_code=302)


def _support_context(
    request: Request,
    *,
    status: str = "",
    error_message: str = "",
    reference: str = "",
    form: dict[str, str] | None = None,
    mailto_url: str | None = None,
) -> dict[str, object]:
    identity = request_identity(request)
    default_name = (identity.display_name or identity.username) if identity else ""
    default_email = identity.email if identity and identity.email else ""
    form_data = {
        "request_type": "technical",
        "name": default_name,
        "email": default_email,
        "transaction_id": "",
        "message": "",
    }
    if form:
        form_data.update(form)
    return {
        "app_name": settings.app_name,
        "version": get_app_version(),
        "auth_enabled": settings.auth_enabled,
        "authenticated": identity is not None,
        "username": (identity.display_name or identity.username) if identity else None,
        "support_email": settings.support_email,
        "request_types": REQUEST_TYPES,
        "status": status,
        "error_message": error_message,
        "reference": reference,
        "form": form_data,
        "mailto_url": mailto_url or build_mailto(settings.support_email),
    }


@app.get("/support", response_class=HTMLResponse)
def support_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="support.html",
        context=_support_context(request),
    )


@app.post("/support", response_class=HTMLResponse)
def support_submit(
    request: Request,
    request_type: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    transaction_id: str = Form(""),
    message: str = Form(...),
    website: str = Form(""),
):
    request_type = clean_text(request_type, max_length=32).lower()
    name = clean_text(name, max_length=120)
    email = clean_text(email, max_length=254).lower()
    transaction_id = clean_text(transaction_id, max_length=120)
    message = clean_message(message)
    form_data = {
        "request_type": request_type if request_type in REQUEST_TYPES else "technical",
        "name": name,
        "email": email,
        "transaction_id": transaction_id,
        "message": message,
    }

    if website.strip():
        fake_reference = f"SUP-{uuid.uuid4().hex[:10].upper()}"
        return templates.TemplateResponse(
            request=request,
            name="support.html",
            context=_support_context(request, status="sent", reference=fake_reference),
        )

    error = ""
    if request_type not in REQUEST_TYPES:
        error = "Choose a valid request type."
    elif len(name) < 2:
        error = "Enter your full name."
    elif not valid_email(email):
        error = "Enter a valid email address."
    elif len(message) < 10:
        error = "Please provide at least 10 characters describing your request."

    if error:
        return templates.TemplateResponse(
            request=request,
            name="support.html",
            context=_support_context(request, status="invalid", error_message=error, form=form_data),
            status_code=400,
        )

    client_key = request.client.host if request.client else "unknown"
    limiter: SupportRateLimiter = request.app.state.support_limiter
    if not limiter.allow(client_key):
        return templates.TemplateResponse(
            request=request,
            name="support.html",
            context=_support_context(request, status="rate_limited", form=form_data),
            status_code=429,
        )

    identity = request_identity(request)
    reference = f"SUP-{uuid.uuid4().hex[:10].upper()}"
    payload = SupportRequest(
        request_type=request_type,
        name=name,
        email=email,
        transaction_id=transaction_id,
        message=message,
        reference=reference,
        account_email=identity.email if identity and identity.email else "",
    )
    mailto_url = build_mailto(settings.support_email, payload)
    mailer: SupportMailer = request.app.state.support_mailer

    if not settings.support_smtp_configured:
        return templates.TemplateResponse(
            request=request,
            name="support.html",
            context=_support_context(
                request, status="smtp_failed", form=form_data, mailto_url=mailto_url
            ),
            status_code=503,
        )

    try:
        mailer.send(payload)
    except Exception:
        logger.exception("support_send_failed reference=%s", reference)
        return templates.TemplateResponse(
            request=request,
            name="support.html",
            context=_support_context(
                request, status="smtp_failed", form=form_data, mailto_url=mailto_url
            ),
            status_code=502,
        )

    return templates.TemplateResponse(
        request=request,
        name="support.html",
        context=_support_context(request, status="sent", reference=reference),
    )


@app.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request):
    identity = request_identity(request)
    if settings.auth_enabled and identity is None:
        return RedirectResponse("/auth/login" if settings.keycloak_enabled else "/login", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="chat.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "chat_model": "GPT-5.6",
            "chat_max_message_chars": settings.chat_max_message_chars,
            "chat_max_turns": settings.chat_max_turns_per_job,
            "auth_enabled": settings.auth_enabled,
            "username": (identity.display_name or identity.username) if identity else None,
        },
    )
