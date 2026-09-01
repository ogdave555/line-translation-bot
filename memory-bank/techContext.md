# Tech Context — LINE Translation Bot

## Tech stack

- **Runtime**: Node.js >= 22 (ES modules, TypeScript 6.x via `tsx` for dev/test).
- **Framework**: Serverless (Vercel `@vercel/node`) — single endpoint at
  `api/webhook.ts`.
- **AI SDK**: Plain `fetch` against the OpenRouter chat-completions endpoint.
  No AI SDK wrapper.
- **LINE SDK**: `@line/bot-sdk` for replying to messages.
- **Config**: `dotenv` for local `.env` loading.
- **Tests**: `node:test` runner via `tsx --test`.

## Directory layout

```
api/
  webhook.ts          # Vercel serverless function (POST + GET)
data/
  memory.json         # Conversation memory (auto-generated, gitignored)
scripts/
  test-providers.js   # Connectivity test for the three models
src/
  core/
    config.ts         # MODELS, GEN_PARAMS, TEMPERATURE, WRONG_LANG_OUTPUT_REGEX,
                      # buildSystemPrompt, appendHermesDirectives,
                      # getSystemPromptForProvider, USER_PROFILES, getConfig
    types.ts          # BotConfig, TranslationRequest, TranslationResponse, ...
    utils.ts          # Language detection, emoji/URL helpers
  translation/
    translator.ts     # translate / runProvider cascade (Hermes → Claude → Gemini)
    memory.ts         # Per-group conversation memory (file-backed)
  bot/
    bot.ts            # Bot class (used by tests)
    index.ts          # Local entry point
tests/
  translator.test.ts
  webhook.test.ts
```

## Language codes

- **Internal types**: `'en' | 'th'` (used in `TranslationRequest`, memory, etc.)
- **Prompt boundary**: `'en-GB' | 'th-TH'` (emitted inside system prompts so
  models see explicit region tags).
- The mapping is centralised in `buildSystemPrompt()` in
  [`src/core/config.ts`](src/core/config.ts:1).

## Environment

Required env vars (see `.env.example`):

- `CHANNEL_ACCESS_TOKEN`
- `CHANNEL_SECRET`
- `OPENROUTER_API_KEY`

Optional:

- `OPENROUTER_SITE_URL`, `OPENROUTER_SITE_TITLE` (leaderboard attribution)
