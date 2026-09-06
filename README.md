# LINE Translation Bot

A LINE bot that automatically translates English to Thai and vice versa, designed for private group conversations between two people.

Features

- ✨ **Bi-directional translation**: English ↔ Thai
- 🎯 **Personalized translations**: Tailored for specific user profiles
- 🧠 **Conversation memory**: Remembers recent context for better translations
- 🚀 **Two-tier AI routing**: Claude Sonnet 4.6 (primary for ALL content, via the Anthropic native Messages API) → Llama 3.3 70B (fallback, via OpenRouter)
- 🔞 **Profanity preservation**: Translates profanity in both languages, no filtering
- ⚡ **Smart response**: Optimized parameters for accuracy
- 📱 **Smart filtering**: Skips images, videos, URLs, emojis, etc.
- 🧪 **Manual smoke testing**: `/api/test-page` provides a browser-based harness with preset Thai/English test cases

## User Profiles

The bot is configured for two specific users:

| Speaker         | Age | Origin   | Native  | Learning | Level    |
| --------------- | --- | -------- | ------- | -------- | -------- |
| English Speaker | 37  | England  | English | Thai     | Beginner |
| Thai Speaker    | 19  | Thailand | Thai    | English  | None     |

## Prerequisites

- Node.js 22 or higher
- LINE Developer Account: https://developers.line.biz/
- OpenRouter API Key: https://openrouter.ai/ (for Hermes 3, Claude Sonnet 5, and Gemini 3.7 Flash)

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd LINE-BOT
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:

```bash
# LINE Bot Configuration
CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
CHANNEL_SECRET=your_line_channel_secret

# AI API Keys
CLAUDE_API_KEY=your_anthropic_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional (for OpenRouter attribution)
OPENROUTER_SITE_URL=https://your-app.vercel.app
OPENROUTER_SITE_TITLE=LINE Translation Bot
```

- `CLAUDE_API_KEY` — Anthropic API key (used for Claude Sonnet 4.6 via
  the **native Anthropic Messages API**, NOT OpenRouter). Get one at
  <https://console.anthropic.com/>.
- `OPENROUTER_API_KEY` — OpenRouter API key (used only for the Llama
  fallback model). Get one at <https://openrouter.ai/>.

### 3. Create LINE Official Account

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Create a new Official Account
3. Create a Messaging API channel
4. Copy the Channel Access Token and Channel Secret

### 4. Configure Webhook

1. Deploy to Vercel first (see Deployment section below)
2. In LINE Developers Console, set Webhook URL:
   - URL: `https://your-vercel-app.vercel.app/api/webhook`
   - Enable "Use webhook"
   - Enable "Reply to messages"

### 5. Add Bot to Your Group

1. Add the LINE Official Account as a friend
2. Create a group with the bot and the two users
3. Bot will automatically start translating

## Deployment to Vercel

### Option 1: Via Vercel Dashboard

1. Push code to GitHub
2. Go to https://vercel.com/new
3. Import your repository
4. Set environment variables in Vercel dashboard
5. Deploy

### Option 2: Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

## API Endpoints

| Endpoint       | Method | Description           |
| -------------- | ------ | --------------------- |
| `/api/webhook` | POST   | LINE webhook endpoint |
| `/api/webhook` | GET    | Health check          |

## How It Works

1. User sends a message in the LINE group
2. Bot receives the message via webhook
3. Bot detects message type (text vs image, etc.)
4. Bot checks for explicit content (English/Thai profanity, sexual content)
5. **Claude Sonnet 4.6** translates the message via the **Anthropic native
   Messages API** — handles ALL content (clean + explicit)
6. Output is checked against `WRONG_LANG_OUTPUT_REGEX` (Cyrillic / CJK). If
   the model leaked into the wrong script, the response is rejected and we
   fall through to the next provider.
7. If Claude fails → falls back to **Llama 3.3 70B** via OpenRouter
8. Translation is sent as a reply

## Language Parameters

Translation prompts use **BCP-47 tags** at the prompt boundary (`en-GB`, `th-TH`) and
internal short codes (`en`, `th`) elsewhere. The prompt builder
(`buildSystemPrompt` in [`src/core/config.ts`](src/core/config.ts:1)) handles the mapping.

| Layer                     | Code                       | Notes                                                            |
| ------------------------- | -------------------------- | ---------------------------------------------------------------- |
| Internal TypeScript types | `en` / `th`                | short, used in `TranslationRequest`, memory, etc.                |
| Prompt boundary           | `en-GB` / `th-TH`          | emitted inside system prompts so models see explicit region tags |
| Output language lock      | `British English` / `Thai` | target name in the prompt's `OUTPUT LANGUAGE LOCK` rule          |

### Per-provider temperature

| Provider                         | Temperature | Rationale                                  |
| -------------------------------- | ----------- | ------------------------------------------ |
| Claude Sonnet 4.6 (primary)      | `0.1`       | per `model-guides/claude-quick-reference.md` |
| Llama 3.3 70B (fallback)         | `0.1`       | per `model-guides/llama-quick-reference.md` |

### Prompt rules

- **OUTPUT LANGUAGE LOCK**: forbids Russian, Chinese, Japanese, Korean output.
- **SPEAKER PERSONA**: en-GB source = older male (37yo); th-TH source = younger female (19yo).
- **PRESERVE THAI INTERNET SLANG**: `'555'`, `'ฮ่า'`, `'อิ'`, etc. are kept verbatim in th-TH → en-GB output.
- **PRESERVE EMOJIS**: emojis pass through unchanged.
- **NO HALLUCINATIONS**: do not add profanity, vulgarity, or flair not in the source.
- **THAI QUESTIONS**: when translating en-GB → th-TH, replace `?` with the natural Thai particle (`ไหม`, `เหรอ`).

## Message Types Handled

✅ **Translated**: Text messages (English and Thai)
❌ **Skipped**: Images, videos, audio, stickers, files, locations

## Translation Features

### Profanity Handling

- Profanity words are translated normally if they exist in target language
- If not, equivalent vulgar terms are used
- No filtering or censorship
- Claude Sonnet 4.6 handles both clean and explicit content as the primary provider
- **Profanity preprocessing pipeline** (advanced): When the Claude call fails on
  explicit content and the cascade must fall through to Llama, the masked text is
  translated through the cascade and each `[PROFANITY:N]` marker is then re-translated
  individually through Claude.

**Provider Cascade:**

| Tier         | Provider             | Model                                | Endpoint                      | Handles Explicit |
| ------------ | -------------------- | ------------------------------------ | ----------------------------- | ---------------- |
| 1 (primary)  | Claude Sonnet 4.6    | `claude-sonnet-4-6`                  | Anthropic native Messages API | ✅ Yes           |
| 2 (fallback) | Llama 3.3 70B        | `meta-llama/Llama-3.3-70B-Instruct`  | OpenRouter chat-completions   | ❌ No (masked)   |

### Context Awareness

- Stores last 20 messages per conversation
- Provides context for more accurate translations
- Context includes who said what and in which language

### Natural Language

- Translations sound conversational
- Sentence restructuring for natural flow
- Not literal word-for-word translation

## Development

```bash
# Start development server
npm run dev

# Build
npm run build

# Run typecheck
npm run typecheck

# Format code
npm run format
```

Manual smoke testing: hit `/api/test-page` for a browser-based harness with
preset Thai and English test cases (including profanity masking and Thai
slang preservation).
```

## Project Structure

```
LINE-BOT/
├── api/
│   ├── webhook.ts          # Vercel serverless function (POST + GET)
│   └── test-page.ts        # Browser-based manual smoke-test harness
├── data/
│   └── memory.json         # Conversation memory (auto-generated, gitignored)
├── src/
│   ├── bot/
│   │   ├── bot.ts          # Local CLI Bot class
│   │   └── index.ts        # Local CLI entry point
│   ├── core/
│   │   ├── anthropic.ts    # Anthropic native Messages API client
│   │   ├── config.ts       # MODELS, GEN_PARAMS, prompts, safety guard
│   │   ├── types.ts        # Shared TypeScript types
│   │   └── utils.ts        # Language detection, URL/emoji helpers
│   └── translation/
│       ├── memory.ts       # Per-group conversation memory (file-backed)
│       └── translator.ts   # Translation engine (Claude → Llama cascade)
├── model-guides/           # Reference prompts and glossary
├── memory-bank/            # Institutional knowledge (project brief,
│                           #   progress, tech context, system patterns,
│                           #   active context)
├── .env.example            # Environment variable template
├── package.json
├── tsconfig.json
├── vercel.json             # Vercel build + route configuration
└── README.md
```

## Troubleshooting

### "Invalid signature" error

- Check your CHANNEL_SECRET in .env
- Ensure webhook URL matches exactly

### Translation failing

- Check that `CLAUDE_API_KEY` is a real **Anthropic** API key (not an
  OpenRouter key — Anthropic-format keys are rejected by OpenRouter with
  HTTP 401, and the cascade will silently fall through to Llama).
- Check that `OPENROUTER_API_KEY` is set for the Llama fallback path.
- Hit `/api/test-page` in a browser to send preset test cases through the
  live webhook.

### Messages not translating

- Bot must be in the group
- Messages must be text (not images/files)
- Check Vercel logs in dashboard

## Cost Management

- **OpenRouter**: Pay-per-use for all three models (Hermes 3 primary, Claude Sonnet 5 fallback,
  Gemini 3.7 Flash second fallback)
- Monitor usage in the OpenRouter dashboard
- Hermes 3 (405B) is the primary provider; Claude and Gemini are only used when Hermes fails

## License

MIT
