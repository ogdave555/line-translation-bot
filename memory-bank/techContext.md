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

- **Primary**: Claude Sonnet 4.6 via the **Anthropic native Messages API**
  (`https://api.anthropic.com/v1/messages`, model id `claude-sonnet-5`)
  using `CLAUDE_API_KEY`. Implemented in `src/core/anthropic.ts`
  (`callAnthropic()`). Previously routed through OpenRouter which silently
  401'd in production — restored to native Anthropic.
- **Fallback**: Llama 3.3 70B (`meta-llama/Llama-3.3-70B-Instruct`) via
  OpenRouter chat-completions using `OPENROUTER_API_KEY`.
- **Temperature**: 0.1 for both models (per model guides)
- **Max tokens**: 5000 for both (per model guides). Claude uses
  Anthropic's `max_tokens` field; OpenRouter uses `max_tokens` in the
  chat-completions body.
- **Anthropic native constants** live in `src/core/anthropic.ts`:
  `ANTHROPIC_API_URL`, `ANTHROPIC_VERSION = "2023-06-01"`,
  `ANTHROPIC_CLAUDE_MODEL = "claude-sonnet-5"`,
  `ANTHROPIC_MAX_TOKENS = 5000`.
- **Legacy alias**: `MODELS.CLAUDE = "anthropic/claude-sonnet-4.6"` in
  `src/core/config.ts` is the OpenRouter-style id, kept for test
  back-compat only. Do NOT route Claude through OpenRouter.

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
