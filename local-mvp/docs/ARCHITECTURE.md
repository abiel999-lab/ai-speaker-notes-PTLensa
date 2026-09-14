# Architecture - v0.2.2

## Design goals

- preserve the original PPTX package as much as possible,
- keep AI vendor logic replaceable,
- keep HTTP, PowerPoint, AI, rendering, storage and validation concerns separated,
- make local Windows MVP operation simple,
- preserve a clean path to queued/server deployment.

## Components

### API layer
FastAPI validates uploads, creates file-backed jobs and exposes status/download endpoints. Vision is selected per AI job rather than globally forced.

### Job processor
A bounded semaphore limits concurrent processing on one node. This boundary can later be replaced by a durable worker queue.

### Parser
`PptxParser` extracts titles, visible text, tables and existing-notes state from the whole presentation.

### Renderer
`AutoSlideRenderer` hides backend differences:

- on Windows `auto` prefers `PowerPointSlideRenderer` using PowerPoint COM + `pywin32`,
- otherwise it falls back to `LibreOfficeSlideRenderer` using LibreOffice -> PDF -> PyMuPDF -> PNG,
- only target slides that actually need generated notes are rendered.

The rest of the pipeline depends only on the renderer interface, not on Office-specific code.

### Notes providers
`NotesGenerator` is the provider boundary. Dummy and OpenAI implementations share the same contract. OpenAI first builds a text-only deck brief, then generates notes in batches; target screenshots are attached only when the job selects Vision.

### Notes writer
The OOXML writer changes notes-related package parts rather than reserializing the entire presentation.

### Integrity validator
Visible content and protected package parts are compared before result release.

## Current local flow

```text
Browser
 -> FastAPI
 -> PPTX validation
 -> full-deck parser
 -> target-slide selection
 -> optional AutoSlideRenderer
      -> PowerPoint COM (Windows preferred)
      -> LibreOffice fallback
 -> NotesGenerator
      -> Dummy
      -> OpenAI text-only / vision
 -> package-preserving notes writer
 -> integrity gate
 -> download
```

## Future production split

```text
Frontend framework
 -> API service
 -> object storage
 -> durable job queue
 -> isolated worker pool
      -> parser / LibreOffice renderer
      -> AI provider
      -> notes writer
      -> integrity validator
 -> PostgreSQL metadata/audit
```

Desktop PowerPoint COM is deliberately a local MVP convenience, not the preferred server renderer.

## v0.2.4 recoverability additions

The AI provider is now treated as a non-deterministic, partially failing dependency.

```text
AI batch request
   -> keep every unique, non-empty target note
   -> checkpoint successful notes atomically
   -> unresolved target set only
   -> narrow recovery request
   -> bounded semantic recovery
```

`ai-checkpoint.json` is signed by a generation fingerprint containing the deck, target slides, model, prompt version, options, batch size and Vision mode. A changed configuration invalidates the checkpoint instead of reusing incompatible notes.

Job retry is intentionally local/durable-file based for the MVP. A production multi-node design should move job leases/checkpoints to shared storage and a durable queue.

Vision auto mode now selects providers at runtime and can fail over from PowerPoint to LibreOffice. If all rendering fails, configuration may permit a clearly reported text-only fallback.
