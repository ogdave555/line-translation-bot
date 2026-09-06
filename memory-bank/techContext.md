# Tech Context — LINE Translation Bot

## Tech stack

- **Runtime**: Node.js >= 22 (ES modules, TypeScript 6.x via `tsx` for dev/test).
- **Framework**: Serverless (Vercel `@vercel/node`) — single endpoint at
  `api/webhook.ts`.
- **AI SDK**: Plain `fetch` against the OpenRouter chat-completions endpoint.
  No AI SDK wrapper.
- **LINE SDK**: `@line/bot-sdk` for replying to messages.
- **Config**: `dotenv` for local `.env` loading.

## AI Models

- **Primary**: Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`) via CLAUDE_API_KEY
- **Fallback**: Llama 3.3 70B (`meta-llama/Llama-3.3-70B-Instruct`) via OPENROUTER_API_KEY
- **Temperature**: 0.1 for both models (per model guides)
- **Max tokens**: 5000 (per model guides)

## Directory layout

```
api/
  webhook.ts          # Vercel serverless function (POST + GET)
  test-page.ts       # Test page for the API
data/
  memory.json        # Conversation memory (auto-generated, gitignored)
src/
  core/
    config.ts       # MODELS, GEN_PARAMS, TEMPERATURE, WRONG_LANG_OUTPUT_REGEX,
                    # buildSystemPrompt, appendLlamaDirectives,
                    # getSystemPromptForProvider, USER_PROFILES, getConfig
    types.ts        # BotConfig, TranslationRequest, TranslationResponse, ...
    utils.ts        # Language detection, emoji/URL helpers
  translation/
    translator.ts    # translate / runProvider cascade (Claude → Llama)
    memory.ts        # Per-group conversation memory (file-backed)
  bot/
    bot.ts          # Bot class
    index.ts        # Local entry point
model-guides/        # Model configuration guides and prompts
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
- `CLAUDE_API_KEY` (for Claude Sonnet 4.6)
- `OPENROUTER_API_KEY` (for Llama 3.3 70B)

Optional:

- `OPENROUTER_SITE_URL`, `OPENROUTER_SITE_TITLE` (leaderboard attribution)
