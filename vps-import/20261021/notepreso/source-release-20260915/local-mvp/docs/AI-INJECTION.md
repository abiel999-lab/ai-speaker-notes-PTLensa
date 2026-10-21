# AI integration - v0.2.2

## Status

Implemented behind `NotesGenerator` with `OpenAINotesGenerator`. GPT-5.6 Luna is the development default because the MVP has already demonstrated acceptable text-only speaker notes at low cost.

## Flow

```text
PresentationDeck
 -> select target slides according to notes mode
 -> if this job selects Vision: render only target slides to PNG
 -> OpenAI request #1: compact full-deck briefing (text only)
 -> OpenAI requests #2..N: batches of target slides
      + deck briefing
      + full deck outline
      + neighboring slide context
      + target slide text/tables
      + target screenshots only when Vision is selected
 -> Pydantic Structured Outputs
 -> exact slide-number semantic validation
 -> dict[int, speaker_notes]
```

## Provider configuration

See `.env.example`.

The model, reasoning effort, batch size, Vision capability, image detail, timeout and retries are configuration values. `OPENAI_USE_VISION=true` enables the capability; the user chooses Text-only or Vision per job in the UI.

## Privacy choices

- API key is an environment secret and is never serialized into job records.
- prompts and base64 screenshots are not logged.
- Responses API calls use `store=False`.
- generated local job artifacts are removed by the normal retention policy.
- the generation report records usage and renderer metadata, not the API key.

## Quality controls

Prompts require natural presenter speech, explanation beyond bullet repetition, full-deck flow, nearby-slide transitions, visual explanation when Vision is present, validation markers for uncertain factual claims, and no invented sources/numbers/regulations.

## Cost strategy

Text-only is the default per job. Vision is opt-in because images can increase input usage. The application records actual reported tokens and a configurable estimated USD cost so the same deck can be compared Text-only versus Vision.

## Recoverable AI behavior (v0.2.4)

OpenAI generation is no longer treated as an all-or-nothing batch operation. Unique valid target notes are checkpointed immediately. If a target is missing/duplicate/empty, only that unresolved target set is requested again. This reduces paid repetition and makes a failed job resumable through the retry endpoint.

The official SDK remains responsible for bounded HTTP/transient retries. Application-level semantic recovery is separate and controlled by `OPENAI_SEMANTIC_RETRIES`.
