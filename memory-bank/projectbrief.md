# Project Brief — LINE Translation Bot

## Core app requirements and goals

- **Purpose**: LINE bot that automatically translates English ↔ Thai in a private
  group conversation between two specific users (one English, one Thai).
- **Deployment**: Vercel serverless function at `api/webhook.ts`.
- **AI provider**: OpenRouter, three-tier cascade:
  1. Hermes 3 405B (primary, all content)
  2. Claude Sonnet 5 (fallback, clean only)
  3. Gemini 3.7 Flash (second fallback, clean only)
- **Profanity handling**: NEVER filter or refuse; explicit content is routed
  exclusively to Hermes. A `[PROFANITY:N]` masking pipeline protects Claude/Gemini
  if Hermes ever fails.
- **Language lock**: the bot's output is **always** en-GB ↔ th-TH; no Russian,
  Chinese, Japanese, or Korean leakage is tolerated. A `WRONG_LANG_OUTPUT_REGEX`
  safety guard rejects bad output and falls through to the next provider.
- **Per-provider temperature**: Hermes 0.3, Claude 0.2, Gemini 0.2 (decoupled
  from the global `GEN_PARAMS.temperature`).
- **Speaker persona** is derived from the SOURCE language (en-GB = older male,
  th-TH = younger female), not from the user typing.
