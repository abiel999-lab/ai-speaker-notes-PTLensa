from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.routes import health_router, router
from app.core.config import get_settings
from app.core.job_store import FileJobStore
from app.core.version import get_app_version
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
    app.state.store = store
    app.state.renderer = renderer
    app.state.generator_factory = generator_factory
    app.state.processor = JobProcessor(
        store,
        pipeline,
        max_concurrent_jobs=settings.max_concurrent_jobs,
    )
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

app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "app" / "templates")
app.include_router(router)
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
        },
    )
