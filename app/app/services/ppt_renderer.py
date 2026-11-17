from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import re
import zipfile
from pathlib import Path
from typing import Protocol

logger = logging.getLogger("speaker_notes.renderer")


def _make_hidden_slides_renderable(source: Path, target: Path) -> int:
    """Save a temporary PPTX with hidden-slide flags removed for visual rendering.

    LibreOffice omits hidden slides from PDF export, which shifts every subsequent page.
    Stream unchanged package members so rendering never loads all embedded media
    into a second python-pptx package. Only hidden flags on slide roots change.
    The uploaded file and final output remain untouched.
    """
    hidden_count = 0
    root_tag = re.compile(rb'<(?:[A-Za-z_][\w.-]*:)?sld\b[^>]*>')
    hidden_flag = re.compile(rb'\s+show\s*=\s*([\x22\x27])(?:0|false)\1')
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w') as output:
        for info in original.infolist():
            if re.fullmatch(r'ppt/slides/slide[0-9]+\.xml', info.filename):
                payload = original.read(info)
                match = root_tag.search(payload)
                if match:
                    updated, count = hidden_flag.subn(b'', match.group())
                    if count:
                        payload = payload[:match.start()] + updated + payload[match.end():]
                        hidden_count += 1
                output.writestr(info, payload)
            else:
                with original.open(info) as src, output.open(info, 'w') as dst:
                    shutil.copyfileobj(src, dst, length=1024 * 1024)
    return hidden_count


class RendererUnavailableError(RuntimeError):
    pass


class SlideRenderer(Protocol):
    @property
    def name(self) -> str: ...

    def executable(self) -> str | None: ...

    def available(self) -> bool: ...

    def render(
        self,
        pptx_path: Path,
        output_dir: Path,
        *,
        slide_numbers: set[int] | None = None,
    ) -> dict[int, Path]: ...


class PowerPointSlideRenderer:
    """Render slides using Microsoft PowerPoint in an isolated helper process.

    The helper-process boundary prevents a COM hang from blocking the FastAPI worker
    forever. A timed-out helper can still leave an Office process behind on some Windows
    installations, so the timeout is a containment mechanism rather than a perfect kill switch.
    """

    def __init__(self, *, dpi: int = 120, timeout_seconds: int = 120) -> None:
        self.dpi = dpi
        self.timeout_seconds = timeout_seconds

    @property
    def name(self) -> str:
        return "powerpoint"

    def executable(self) -> str | None:
        if os.name != "nt":
            return None
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CLASSES_ROOT,
                r"PowerPoint.Application\CLSID",
            ) as key:
                clsid = winreg.QueryValue(key, None)
            if clsid:
                return "Microsoft PowerPoint COM"
        except (OSError, TypeError):
            pass

        roots = [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)")]
        for root in filter(None, roots):
            for relative in (
                Path("Microsoft Office") / "root" / "Office16" / "POWERPNT.EXE",
                Path("Microsoft Office") / "Office16" / "POWERPNT.EXE",
            ):
                candidate = Path(root) / relative
                if candidate.is_file():
                    return str(candidate)
        return None

    def available(self) -> bool:
        if os.name != "nt" or self.executable() is None:
            return False
        try:
            import pythoncom  # noqa: F401
            import win32com.client  # noqa: F401
        except ImportError:
            return False
        return True

    def render(
        self,
        pptx_path: Path,
        output_dir: Path,
        *,
        slide_numbers: set[int] | None = None,
    ) -> dict[int, Path]:
        if not self.available():
            raise RendererUnavailableError(
                "Microsoft PowerPoint rendering is unavailable. Install Microsoft PowerPoint "
                "and pywin32, or use the LibreOffice renderer."
            )

        output_dir.mkdir(parents=True, exist_ok=True)
        for old in output_dir.glob("slide-*.png"):
            old.unlink()

        slides_arg = ",".join(map(str, sorted(slide_numbers or set())))
        command = [
            sys.executable,
            "-m",
            "app.services.powerpoint_worker",
            str(pptx_path.resolve()),
            str(output_dir.resolve()),
            "--dpi",
            str(self.dpi),
        ]
        if slides_arg:
            command.extend(["--slides", slides_arg])

        try:
            result = subprocess.run(
                command,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.timeout_seconds,
                text=True,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"Microsoft PowerPoint rendering timed out after {self.timeout_seconds} seconds."
            ) from exc

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "unknown PowerPoint COM error").strip()
            raise RuntimeError(f"Microsoft PowerPoint failed to render slides: {detail[-1200:]}")

        if slide_numbers:
            requested = sorted(slide_numbers)
        else:
            requested = sorted(
                int(path.stem.split("-")[-1]) for path in output_dir.glob("slide-*.png")
            )
        rendered: dict[int, Path] = {}
        for number in requested:
            target = output_dir / f"slide-{number:03d}.png"
            if not target.exists() or target.stat().st_size == 0:
                raise RuntimeError(f"PowerPoint did not render slide {number}.")
            rendered[number] = target
        if not rendered:
            raise RuntimeError("PowerPoint did not produce any rendered slides.")
        return rendered


class LibreOfficeSlideRenderer:
    """Render PPTX slides to PNG using LibreOffice + PyMuPDF."""

    def __init__(self, libreoffice_bin: str = "auto", *, dpi: int = 120) -> None:
        self.libreoffice_bin = libreoffice_bin
        self.dpi = dpi

    @property
    def name(self) -> str:
        return "libreoffice"

    def executable(self) -> str | None:
        requested = self.libreoffice_bin.strip()
        if requested and requested.lower() != "auto":
            found = shutil.which(requested)
            if found:
                return found
            path = Path(requested)
            if path.is_file():
                return str(path)
            return None

        for candidate in ("libreoffice", "soffice"):
            found = shutil.which(candidate)
            if found:
                return found

        if os.name == "nt":
            roots = [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)")]
            for root in filter(None, roots):
                for executable in (
                    Path(root) / "LibreOffice" / "program" / "soffice.exe",
                    Path(root) / "LibreOffice" / "program" / "libreoffice.exe",
                ):
                    if executable.is_file():
                        return str(executable)
        return None

    def available(self) -> bool:
        if self.executable() is None:
            return False
        try:
            import fitz  # noqa: F401
        except ImportError:
            return False
        return True

    def render(
        self,
        pptx_path: Path,
        output_dir: Path,
        *,
        slide_numbers: set[int] | None = None,
    ) -> dict[int, Path]:
        executable = self.executable()
        if executable is None:
            raise RendererUnavailableError(
                "LibreOffice was not found. Install LibreOffice or set LIBREOFFICE_BIN to soffice.exe."
            )
        try:
            import fitz
        except ImportError as exc:
            raise RendererUnavailableError(
                "PyMuPDF is not installed. Run setup again after upgrading the project."
            ) from exc

        output_dir.mkdir(parents=True, exist_ok=True)
        for old in output_dir.glob("slide-*.png"):
            old.unlink()

        with tempfile.TemporaryDirectory(prefix="speaker-notes-render-") as tmp:
            tmp_path = Path(tmp)
            pdf_dir = tmp_path / "pdf"
            profile_dir = tmp_path / "lo-profile"
            pdf_dir.mkdir()
            profile_dir.mkdir()
            profile_uri = profile_dir.resolve().as_uri()

            # LibreOffice excludes hidden slides from PDF export. Normalize only a
            # temporary rendering copy so PDF page N remains PowerPoint slide N.
            render_source = tmp_path / "render-source.pptx"
            _make_hidden_slides_renderable(pptx_path, render_source)

            result = subprocess.run(
                [
                    executable,
                    f"-env:UserInstallation={profile_uri}",
                    "--headless",
                    "--nologo",
                    "--nodefault",
                    "--nolockcheck",
                    "--nofirststartwizard",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(pdf_dir),
                    str(render_source),
                ],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=180,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    "LibreOffice failed to render the PowerPoint. "
                    f"Exit code: {result.returncode}."
                )

            pdf_path = pdf_dir / f"{render_source.stem}.pdf"
            if not pdf_path.exists():
                raise RuntimeError("LibreOffice did not create the expected PDF output.")

            document = fitz.open(pdf_path)
            try:
                page_count = len(document)
                requested = slide_numbers or set(range(1, page_count + 1))
                invalid = sorted(n for n in requested if n < 1 or n > page_count)
                if invalid:
                    raise RuntimeError(f"Requested slide numbers are outside the deck: {invalid[:10]}")

                zoom = self.dpi / 72.0
                matrix = fitz.Matrix(zoom, zoom)
                rendered: dict[int, Path] = {}
                for number in sorted(requested):
                    page = document[number - 1]
                    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                    target = output_dir / f"slide-{number:03d}.png"
                    pixmap.save(target)
                    rendered[number] = target
                return rendered
            finally:
                document.close()


class AutoSlideRenderer:
    """Choose a backend and fall back at runtime when `auto` is selected.

    Availability checks alone are not enough: Office COM can be registered yet fail for
    a particular deck. In auto mode we therefore try PowerPoint first on Windows and
    then LibreOffice when available. Explicit modes never silently switch providers.
    """

    def __init__(
        self,
        *,
        mode: str = "auto",
        libreoffice_bin: str = "auto",
        dpi: int = 120,
        powerpoint_timeout_seconds: int = 120,
    ) -> None:
        normalized = mode.strip().lower()
        if normalized not in {"auto", "powerpoint", "libreoffice"}:
            raise ValueError("SLIDE_RENDERER must be auto, powerpoint, or libreoffice.")
        self.mode = normalized
        self.powerpoint = PowerPointSlideRenderer(
            dpi=dpi,
            timeout_seconds=powerpoint_timeout_seconds,
        )
        self.libreoffice = LibreOfficeSlideRenderer(libreoffice_bin, dpi=dpi)
        self._last_provider: str | None = None

    @property
    def name(self) -> str:
        if self._last_provider:
            return self._last_provider
        selected = self.selected()
        return selected.name if selected is not None else "unavailable"

    def _candidates(self) -> list[SlideRenderer]:
        if self.mode == "powerpoint":
            return [self.powerpoint] if self.powerpoint.available() else []
        if self.mode == "libreoffice":
            return [self.libreoffice] if self.libreoffice.available() else []
        candidates: list[SlideRenderer] = []
        if os.name == "nt" and self.powerpoint.available():
            candidates.append(self.powerpoint)
        if self.libreoffice.available():
            candidates.append(self.libreoffice)
        return candidates

    def selected(self) -> SlideRenderer | None:
        candidates = self._candidates()
        return candidates[0] if candidates else None

    def executable(self) -> str | None:
        selected = self.selected()
        return selected.executable() if selected is not None else None

    def available(self) -> bool:
        return bool(self._candidates())

    def render(
        self,
        pptx_path: Path,
        output_dir: Path,
        *,
        slide_numbers: set[int] | None = None,
    ) -> dict[int, Path]:
        candidates = self._candidates()
        if not candidates:
            raise RendererUnavailableError(
                "No slide renderer is available. On Windows, install Microsoft PowerPoint "
                "(preferred for local MVP testing) or LibreOffice. For server deployment, use LibreOffice."
            )

        errors: list[str] = []
        for index, candidate in enumerate(candidates):
            try:
                rendered = candidate.render(
                    pptx_path,
                    output_dir,
                    slide_numbers=slide_numbers,
                )
                self._last_provider = candidate.name
                if index > 0:
                    logger.warning(
                        "Renderer fallback succeeded provider=%s previous_errors=%s",
                        candidate.name,
                        errors,
                    )
                return rendered
            except Exception as exc:
                errors.append(f"{candidate.name}: {exc}")
                logger.warning(
                    "Renderer provider failed provider=%s error=%s",
                    candidate.name,
                    exc,
                )
                if self.mode != "auto":
                    raise

        raise RuntimeError("All available slide renderers failed: " + " | ".join(errors))

