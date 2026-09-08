from pathlib import Path

import pytest

from app.core.security import UploadValidationError, validate_pptx_package


def test_valid_pptx_passes_validation(sample_pptx):
    validate_pptx_package(sample_pptx, max_entries=10000, max_uncompressed_bytes=100_000_000)


def test_non_zip_is_rejected(tmp_path: Path):
    path = tmp_path / "bad.pptx"
    path.write_text("not a pptx")
    with pytest.raises(UploadValidationError):
        validate_pptx_package(path, max_entries=10000, max_uncompressed_bytes=100_000_000)
