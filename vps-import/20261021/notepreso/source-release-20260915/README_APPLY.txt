AI Speaker Notes v0.2.6 - Reasoning/UI refinement

Apply:
1. Extract this ZIP into project root and overwrite matching files.
2. Keep your existing .env. OPENAI_MODEL remains gpt-5.6-luna.
3. Run tests:
   .\.venv\Scripts\python.exe -m pytest
4. Start local app:
   .\scripts\run.ps1 -Reload

Changes:
- Generator label stays GPT-5.6 Luna.
- "Kedalaman analisis" becomes Low / Medium / High.
- Low/Medium/High now directly select OpenAI reasoning effort per job.
- Static OPENAI_REASONING_EFFORT remains only a constructor/config fallback; per-job UI selection controls API calls.
- Visible "Vision" wording replaced by "Image Analysis" and "Text + image analysis".
- Internal use_vision / OPENAI_USE_VISION names remain unchanged for compatibility.
- Existing word-count, Akademisi/Mahasiswa, and custom instruction features are preserved.

Test result in build workspace: 46 passed.
