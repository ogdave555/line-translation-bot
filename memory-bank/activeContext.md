# Active Context — LINE Translation Bot

## What we are working on right now

**Language parameter hardening** — applying the translation rules from the
`.roo/rules/translation-rules.md` document to the project. This brings
the bot in line with the DMTranslateApp-style prompt structure and adds
per-provider temperature control + a runtime safety guard.

## Recent decisions

- **Internal language codes stay `'en' | 'th'`** (cleaner TypeScript) but the
  prompt boundary emits `'en-GB' | 'th-TH'` via `buildSystemPrompt()`. This
  minimises cascading type changes while still satisfying the rules'
  region-specific output requirement.
- **Per-provider temperatures**: Hermes 0.3 (slightly higher to reduce wrong-token
  rushing), Claude/Gemini 0.2 (deterministic for clean content). Lookup
  happens via `getTemperatureForProvider(provider)`.
- **`WRONG_LANG_OUTPUT_REGEX` applied at the provider boundary** rather than
  per-prompt. This means a single regex test catches any leakage in any
  provider's output.
- **Legacy prompt-builder functions kept as `@deprecated` aliases** so existing
  tests and external imports don't break, but new code uses
  `getSystemPromptForProvider(provider, source, target)`.

## Open work

- None for this milestone. The translation rules are fully applied to
  `src/core/config.ts`, `src/translation/translator.ts`, and
  `api/webhook.ts`. Tests have been updated to assert against the new prompt
  structure. README documents the new language parameter model.
