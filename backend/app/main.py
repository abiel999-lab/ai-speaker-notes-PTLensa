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

from app.api.auth_routes import router as auth_router
from app.api.chat_routes import router as chat_router
from app.api.routes import health_router, router
from app.core.auth import LoginRateLimiter, SessionManager, request_identity
from app.core.config import get_settings
from app.core.job_store import FileJobStore
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
    if settings.auth_enabled:
        if not settings.auth_configured:
            raise RuntimeError(
                "AUTH_ENABLED=true requires AUTH_PASSWORD and APP_SESSION_SECRET (at least 32 characters)."
            )
        assert settings.session_secret is not None
        app.state.session_manager = SessionManager(
            settings.session_secret.get_secret_value(),
            max_age_seconds=settings.session_hours * 3600,
        )
        app.state.login_limiter = LoginRateLimiter()
    app.state.store = store
    app.state.renderer = renderer
    app.state.generator_factory = generator_factory
    app.state.chat_service = JobChatService(settings) if settings.openai_configured else None
    app.state.processor = JobProcessor(
        store,
        pipeline,
        max_concurrent_jobs=settings.max_concurrent_jobs,
    )
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
app.include_router(router)
app.include_router(chat_router)
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
    identity = request_identity(request)
    if settings.auth_enabled and identity is None:
        return RedirectResponse("/login", status_code=303)
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
            "username": identity.username if identity else None,
            "max_ai_slides": settings.openai_max_slides_per_job,
            "max_vision_slides": settings.openai_max_vision_slides_per_job,
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
    return templates.TemplateResponse(
        request=request,
        name="how_to.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "max_upload_mb": settings.max_upload_mb,
            "max_ai_slides": settings.openai_max_slides_per_job,
            "max_vision_slides": settings.openai_max_vision_slides_per_job,
            "auth_enabled": settings.auth_enabled,
            "authenticated": request_identity(request) is not None,
        },
    )


@app.get("/legal", response_class=HTMLResponse)
def legal(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="legal.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "terms_version": settings.terms_version,
            "retention_hours": settings.job_retention_hours,
            "auth_enabled": settings.auth_enabled,
            "authenticated": request_identity(request) is not None,
        },
    )


@app.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request):
    identity = request_identity(request)
    if settings.auth_enabled and identity is None:
        return RedirectResponse("/login", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="chat.html",
        context={
            "app_name": settings.app_name,
            "version": get_app_version(),
            "chat_model": settings.openai_chat_model,
            "chat_max_message_chars": settings.chat_max_message_chars,
            "chat_max_turns": settings.chat_max_turns_per_job,
            "auth_enabled": settings.auth_enabled,
            "username": identity.username if identity else None,
        },
    )
