from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pptx import Presentation

from app.core.config import Settings
from app.domain.models import GenerationOptions
from app.services.integrity import PptxIntegrityValidator
from app.services.notes.factory import NotesGeneratorFactory
from app.services.notes_writer import PptxNotesWriter
from app.services.pipeline import PresentationPipeline
from app.services.ppt_parser import PptxParser

source = ROOT / "examples" / "demo-input.pptx"
output = ROOT / "examples" / "demo-output.pptx"

parser = PptxParser()
settings = Settings(_env_file=None)
pipeline = PresentationPipeline(
    parser=parser,
    generator_factory=NotesGeneratorFactory(settings),
    notes_writer=PptxNotesWriter(),
    integrity_validator=PptxIntegrityValidator(parser),
    settings=settings,
)

result = pipeline.process(
    source,
    output,
    GenerationOptions(),
    lambda c, t, m: print(f"[{c}/{t}] {m}"),
)
processed = Presentation(output)
assert processed.slides[0].notes_slide.notes_text_frame.text.startswith("[MVP TEST]")
assert len(processed.slides) == 2
assert result.generated_notes_count == 2
print(f"PASS: {output}")
