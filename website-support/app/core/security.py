from __future__ import annotations

import zipfile
from pathlib import Path, PurePosixPath


class UploadValidationError(ValueError):
    pass


def validate_pptx_package(
    path: Path,
    *,
    max_entries: int,
    max_uncompressed_bytes: int,
    allow_embedded_objects: bool = True,
) -> None:
    """Validate basic PPTX/ZIP structure without trusting MIME type or filename alone."""
    if path.suffix.lower() != ".pptx":
        raise UploadValidationError("Only .pptx files are accepted.")

    if not zipfile.is_zipfile(path):
        raise UploadValidationError("The uploaded file is not a valid PPTX package.")

    required = {"[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml"}
    total_uncompressed = 0

    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if len(infos) > max_entries:
            raise UploadValidationError("PPTX contains too many package entries.")

        names = {info.filename for info in infos}
        if not required.issubset(names):
            raise UploadValidationError("PPTX package is missing required Office Open XML parts.")

        for info in infos:
            posix = PurePosixPath(info.filename)
            if posix.is_absolute() or ".." in posix.parts:
                raise UploadValidationError("Unsafe path found inside PPTX package.")

            # Embedded packages and macro payloads are treated as inert document data.
            # The application never executes them; normalization/rendering only reads
            # the presentation representation needed for speaker-note generation.
            # Keep the parameter for backwards-compatible configuration, but do not
            # reject a whole deck merely because it contains an embedded object.
            _ = allow_embedded_objects

            total_uncompressed += info.file_size
            if total_uncompressed > max_uncompressed_bytes:
                raise UploadValidationError("PPTX expands beyond the configured safety limit.")

            # Basic decompression-bomb guard. Ignore tiny files where ratios are noisy.
            if info.file_size > 5 * 1024 * 1024 and info.compress_size > 0:
                ratio = info.file_size / info.compress_size
                if ratio > 250:
                    raise UploadValidationError("Suspicious compression ratio detected in PPTX.")
