# Project Brief — LINE Translation Bot

## Core app requirements and goals

- **Purpose**: LINE bot that automatically translates English ↔ Thai in a private
  group conversation between two specific users (one English, one Thai).
- **Deployment**: Vercel serverless function at `api/webhook.ts`.
- **AI providers** (two-tier cascade):
  1. **Claude Sonnet 4.6** via the **Anthropic native Messages API**
     (`https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-6`,
     `CLAUDE_API_KEY`) — primary for ALL content (clean + explicit).
  2. **Llama 3.3 70B** via OpenRouter chat-completions
     (`meta-llama/Llama-3.3-70B-Instruct`, `OPENROUTER_API_KEY`) — fallback.
- **Historical**: Earlier versions had a 3-tier cascade (Hermes 3 405B →
  Claude → Gemini) and routed everything through OpenRouter. That was
  intentionally simplified to Claude + Llama. Do NOT reintroduce the
  OpenRouter-for-Claude path; it silently 401s in production.
- **Profanity handling**: NEVER filter or refuse; explicit content is
  routed exclusively to Claude (primary). A `[PROFANITY:N]` masking
  pipeline protects the cascade if Claude ever fails.
- **Profanity handling**: NEVER filter or refuse; explicit content is routed
  exclusively to Hermes. A `[PROFANITY:N]` masking pipeline protects Claude/Gemini
  if Hermes ever fails.
- **Language lock**: the bot's output is **always** en-GB ↔ th-TH; no Russian,
  Chinese, Japanese, or Korean leakage is tolerated. A `WRONG_LANG_OUTPUT_REGEX`
  safety guard rejects bad output and falls through to the next provider.
- **Per-provider temperature**: Claude 0.1, Llama 0.1 (per model guides).
  Resolved via `getTemperatureForProvider()` in `src/core/config.ts`.
- **Max tokens**: 5000 for both providers.
- **Speaker persona** is derived from the SOURCE language (en-GB = older male,
  th-TH = younger female), not from the user typing.
- **Anthropic vs OpenRouter split**: Claude uses Anthropic's native
  Messages API (system as top-level string, content blocks); Llama uses
  OpenRouter's OpenAI-compatible chat-completions (system as first
  message). The two HTTP shapes are different — see
  `src/core/anthropic.ts:1` for the Claude path and
  `src/translation/translator.ts:44` (`callOpenRouter`) for the Llama path.

