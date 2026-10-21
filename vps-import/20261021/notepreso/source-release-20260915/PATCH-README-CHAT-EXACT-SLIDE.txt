AI Speaker Notes v0.2.8 - Exact Slide Chat RAG Patch
=====================================================

Fixes the Chat AI specific-slide retrieval bug found during ASN-013 testing.

Problem
-------
When a user explicitly selected Slide 4, Chat AI previously sent Slide 2-6 as context.
That could make the model answer from a neighboring slide (for example, UNFCCC content)
instead of the requested slide.

Fix
---
1. The dedicated Slide # field now creates an EXACT slide scope.
2. Exact slide requests send only that slide to the model; neighboring slides are excluded.
3. Prior chat from other slides is excluded from exact-slide requests to avoid context bleed.
4. Natural-language requests such as "Explain slide 4" also resolve to exact Slide 4.
5. The model prompt explicitly says not to substitute adjacent slides.
6. referenced_slides for an exact request is now exactly one slide, e.g. [4].

Unchanged
---------
- Generic questions still use bounded semantic/lexical RAG across relevant slides.
- Chat turn and character limits remain unchanged.
- PowerPoint generation, Vision rendering, batching, and write-back are untouched.
- .env and secrets are not included in this patch.

Verification
------------
Unit tests cover both the Slide # field and natural-language explicit slide selection.
