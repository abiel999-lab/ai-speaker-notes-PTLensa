from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from pptx import Presentation


SUPPORTED_POWERPOINT_EXTENSIONS = {
    ".ppt",
    ".pptx",
    ".pptm",
    ".pps",
    ".ppsx",
    ".ppsm",
    ".pot",
    ".potx",
    ".potm",
}


class PowerPointNormalizationError(RuntimeError):
    pass


class PowerPointNormalizer:
    """Normalize accepted PowerPoint-family uploads into an internal .pptx copy.

    The uploaded original is never executed. Legacy/binary and macro-enabled variants
    are converted with LibreOffice into a working OOXML copy. Active content is not
    needed for speaker-note generation and is not executed by the application.
    """

    def __init__(self, *, libreoffice_bin: str = "auto", timeout_seconds: int = 120) -> None:
        self.libreoffice_bin = libreoffice_bin
        self.timeout_seconds = timeout_seconds

    def executable(self) -> str | None:
        configured = (self.libreoffice_bin or "auto").strip()
        if configured and configured.lower() != "auto":
            return configured if Path(configured).exists() or shutil.which(configured) else None
        return shutil.which("libreoffice") or shutil.which("soffice")

    def normalize(self, source: Path, output: Path) -> None:
        suffix = self._detect_powerpoint_suffix(source)

        output.parent.mkdir(parents=True, exist_ok=True)
        output.unlink(missing_ok=True)

        if suffix == ".pptx":
            shutil.copy2(source, output)
            try:
                self._verify_openable(output)
                return
            except PowerPointNormalizationError:
                # A nominal .pptx can still contain repairable package damage.
                # Retry through LibreOffice to obtain a clean working copy.
                output.unlink(missing_ok=True)

        executable = self.executable()
        if not executable:
            raise PowerPointNormalizationError(
                "This PowerPoint variant requires LibreOffice conversion, but LibreOffice is unavailable."
            )

        with tempfile.TemporaryDirectory(prefix="notepreso-normalize-") as temp_root:
            temp_dir = Path(temp_root)
            out_dir = temp_dir / "out"
            profile_dir = temp_dir / "profile"
            home_dir = temp_dir / "home"
            out_dir.mkdir()
            profile_dir.mkdir()
            home_dir.mkdir()

            # Give LibreOffice the minimum environment it needs. This prevents the
            # converter from inheriting application API keys/secrets from the web worker.
            env = {
                "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                "HOME": str(home_dir),
                "TMPDIR": str(temp_dir),
                "LANG": os.environ.get("LANG", "C.UTF-8"),
                "LC_ALL": os.environ.get("LC_ALL", os.environ.get("LANG", "C.UTF-8")),
                "SAL_USE_VCLPLUGIN": "svp",
            }
            conversion_source = source
            if source.suffix.lower() != suffix:
                conversion_source = temp_dir / f"upload{suffix}"
                shutil.copy2(source, conversion_source)

            cmd = [
                executable,
                "--headless",
                "--nologo",
                "--nodefault",
                "--nolockcheck",
                "--norestore",
                "--nofirststartwizard",
                f"-env:UserInstallation=file://{profile_dir}",
                "--convert-to",
                "pptx:Impress MS PowerPoint 2007 XML",
                "--outdir",
                str(out_dir),
                str(conversion_source.resolve()),
            ]
            try:
                completed = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                    check=False,
                    env=env,
                )
            except subprocess.TimeoutExpired as exc:
                raise PowerPointNormalizationError(
                    "PowerPoint conversion timed out before a working copy could be created."
                ) from exc

            candidates = sorted(out_dir.glob("*.pptx"))
            if completed.returncode != 0 or not candidates:
                details = (completed.stderr or completed.stdout or "").strip()
                if len(details) > 500:
                    details = details[-500:]
                raise PowerPointNormalizationError(
                    "PowerPoint conversion could not create a readable working copy."
                    + (f" Converter message: {details}" if details else "")
                )

            shutil.copy2(candidates[0], output)

        self._verify_openable(output)

    @staticmethod
    def _detect_powerpoint_suffix(source: Path) -> str:
        suffix = source.suffix.lower()
        if suffix in SUPPORTED_POWERPOINT_EXTENSIONS:
            return suffix

        # Filename extensions are only hints. Accept a recognizable PowerPoint
        # package even when a user/browser renamed it strangely.
        try:
            if zipfile.is_zipfile(source):
                with zipfile.ZipFile(source) as archive:
                    names = set(archive.namelist())
                if "ppt/presentation.xml" in names and "[Content_Types].xml" in names:
                    return ".pptx"
        except (OSError, zipfile.BadZipFile):
            pass

        try:
            header = source.read_bytes()[:8]
        except OSError as exc:
            raise PowerPointNormalizationError("The uploaded file could not be read.") from exc
        if header == bytes.fromhex("D0CF11E0A1B11AE1"):
            return ".ppt"

        raise PowerPointNormalizationError(
            "The upload is not a recognizable PowerPoint presentation. "
            "PowerPoint-family files are accepted even when their filename extension is unusual."
        )

    @staticmethod
    def _verify_openable(path: Path) -> None:
        try:
            presentation = Presentation(path)
            # Force slide collection traversal so package-level failures surface now.
            _ = len(presentation.slides)
        except Exception as exc:
            raise PowerPointNormalizationError(
                "The presentation could not be normalized into a readable PowerPoint working copy."
            ) from exc
