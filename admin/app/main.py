from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_routes import browser_router as admin_browser_router, router as admin_router
from app.api.auth_routes import begin_keycloak_login, browser_router as auth_browser_router, router as auth_router
from app.api.chat_routes import general_router as general_chat_router, router as chat_router
from app.api.routes import health_router, router
from app.core.auth import LoginRateLimiter, SessionManager, is_admin_identity, request_identity
from app.core.application_data import ApplicationDataReader
from app.core.config import get_settings
from app.core.database import DatabaseChatHistoryStore, DatabaseManager
from app.core.job_store import FileJobStore
from app.core.keycloak_admin import KeycloakAdminClient
from app.core.oidc import KeycloakOidcClient
from app.core.postgres_job_store import PostgresJobStore
from app.core.version import get_app_version
from app.services.chat import JobChatService
from app.services.integrity import PptxIntegrityValidator
from app.services.jobs import JobProcessor
from app.services.notes.factory import NotesGeneratorFactory
from app.services.notes_writer import PptxNotesWriter
from app.services.pipeline import PresentationPipeline
from app.services.ppt_parser import PptxParser
from app.services.ppt_renderer import AutoSlideRenderer

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

    # The admin dashboard may read the real application's jobs/chat from a second
    # PostgreSQL connection. We deliberately do not run init_schema() against this
    # source because it can be a production/read-only database.
    data_db = db
    if settings.application_database_url:
        if not settings.database_url or settings.application_database_url != settings.database_url:
            data_db = ApplicationDataReader(settings.application_database_url)
            if not data_db.healthcheck():
                # The external activity database may be reached through an SSH tunnel.
                # Do not take the entire admin application down when that tunnel is
                # temporarily unavailable; the reader retries lazily on later requests.
                logger.warning(
                    "application_database_unavailable startup_continues=true error=%s",
                    data_db.last_error or "connection failed",
                )
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
    app.state.data_db = data_db
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
        if settings.keycloak_admin_login_configured:
            assert settings.keycloak_admin_login_client_secret is not None
            app.state.admin_oidc_client = KeycloakOidcClient(
                settings,
                client_id=settings.keycloak_admin_login_client_id,
                client_secret=settings.keycloak_admin_login_client_secret.get_secret_value(),
                redirect_path="/auth/admin/callback",
            )
        else:
            app.state.admin_oidc_client = None
    else:
        app.state.oidc_client = None
        app.state.admin_oidc_client = None
    app.state.keycloak_admin = KeycloakAdminClient(settings) if settings.keycloak_admin_configured else None
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
    interrupted = store.recover_interrupted()
    if interrupted:
        logger.warning("startup_recovery interrupted_jobs=%s", interrupted)
    removed = 0 if Path("/app/.notepreso-v2-preserve-startup").exists() else store.cleanup_expired(settings.job_retention_hours)
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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Requested-With", "X-Demo-Key", "X-CSRF-Token"],
    expose_headers=["Content-Disposition", "X-Request-ID"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "app" / "templates")
app.include_router(auth_router)
app.include_router(auth_browser_router)
app.include_router(admin_router)
app.include_router(admin_browser_router)
app.include_router(router)
app.include_router(chat_router)
app.include_router(general_chat_router)
app.include_router(health_router)


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
    return RedirectResponse("/admin", status_code=303)


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, return_to: str = "/"):
    """Compatibility login route. Keycloak deployments redirect immediately."""
    identity = request_identity(request)
    if not return_to.startswith("/") or return_to.startswith("//"):
        return_to = "/"
    if identity is not None and settings.auth_enabled:
        return RedirectResponse(return_to, status_code=303)
    if not settings.auth_enabled:
        return RedirectResponse("/", status_code=303)
    if settings.keycloak_enabled:
        return begin_keycloak_login(request, return_to)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "terms_version": settings.terms_version,
            "keycloak_enabled": False,
            "keycloak_login_url": "",
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
            "is_admin": bool(identity and is_admin_identity(request, identity)),
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
            "is_admin": bool(identity and is_admin_identity(request, identity)),
        },
    )


@app.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request):
    identity = request_identity(request)
    if settings.auth_enabled and identity is None:
        if settings.keycloak_enabled:
            return begin_keycloak_login(request, "/chat")
        return RedirectResponse("/login?return_to=/chat", status_code=303)
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
            "is_admin": bool(identity and is_admin_identity(request, identity)),
        },
    )
