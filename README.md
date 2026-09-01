# LINE Translation Bot

A LINE bot that automatically translates English to Thai and vice versa, designed for private group conversations between two people.

Features

- ✨ **Bi-directional translation**: English ↔ Thai
- 🎯 **Personalized translations**: Tailored for specific user profiles
- 🧠 **Conversation memory**: Remembers recent context for better translations
- 🚀 **Triple AI routing**: Hermes 3 (405B, primary for ALL content) → Claude Sonnet 5 (fallback) → Gemini 3.7 Flash (second fallback), all via OpenRouter
- 🔞 **Profanity preservation**: Translates profanity in both languages, no filtering
- ⚡ **Smart response**: Optimized parameters for accuracy
- 📱 **Smart filtering**: Skips images, videos, URLs, emojis, etc.
- 🧪 **Testable**: Built-in test suite with `npm test` and provider endpoint checks

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
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional (for OpenRouter attribution)
OPENROUTER_SITE_URL=https://your-app.vercel.app
OPENROUTER_SITE_TITLE=LINE Translation Bot
```

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
5. Hermes 3 (405B) translates the message via OpenRouter — handles ALL content (clean + explicit)
6. Output is checked against `WRONG_LANG_OUTPUT_REGEX` (Cyrillic / CJK). If the model
   leaked into the wrong script, the response is rejected and we fall through to the next provider.
7. If Hermes fails → falls back to Claude Sonnet 5 (clean content only)
8. If Claude also fails → falls back to Gemini 3.7 Flash (clean content only)
9. Translation is sent as a reply

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

| Provider                    | Temperature | Rationale                                         |
| --------------------------- | ----------- | ------------------------------------------------- |
| Hermes 3 (primary)          | `0.3`       | slightly higher; less "rushing" into wrong tokens |
| Claude Sonnet 5 (fallback)  | `0.2`       | deterministic for clean content                   |
| Gemini 3.7 Flash (fallback) | `0.2`       | deterministic for clean content                   |

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
- Hermes 3 handles both clean and explicit content as the primary provider
- **Profanity preprocessing pipeline** (advanced): When testing fallback providers,
  explicit content can be masked with `[PROFANITY:N]` markers so that Claude/Gemini
  never see raw profanity. Masked tokens are then translated individually through Hermes.

**Provider Cascade:**

| Tier         | Provider         | Model                                  | Handles Explicit |
| ------------ | ---------------- | -------------------------------------- | ---------------- |
| 1 (primary)  | Hermes 3         | `nousresearch/hermes-3-llama-3.1-405b` | ✅ Yes           |
| 2 (fallback) | Claude Sonnet 5  | `anthropic/claude-sonnet-5`            | ❌ No (blocked)  |
| 3 (fallback) | Gemini 3.7 Flash | `google/gemini-3.7-flash`              | ❌ No (blocked)  |

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

# Run tests
npm test
npm run test:watch

# Test provider endpoints
npm run test:providers

# Format code
npm run format
```

## Project Structure

```
LINE-BOT/
├── api/
│   └── webhook.ts          # Vercel serverless function
├── data/
│   └── memory.json         # Conversation memory (auto-generated)
├── scripts/
│   └── test-providers.js   # Provider endpoint connectivity tests
├── src/
│   ├── bot.ts              # Bot event handlers
│   ├── config.ts           # Configuration and system prompts
│   ├── index.ts            # Entry point
│   ├── memory.ts           # Conversation memory management
│   ├── translator.ts       # Translation engine (Hermes primary cascade)
│   └── utils.ts            # Helper functions
├── tests/
│   ├── translator.test.ts  # Unit tests for translator & config
│   └── webhook.test.ts     # Unit tests for webhook logic
├── .env.example            # Environment variable template
├── package.json
├── tsconfig.json
├── vercel.json             # Vercel configuration
└── README.md
```

## Troubleshooting

### "Invalid signature" error

- Check your CHANNEL_SECRET in .env
- Ensure webhook URL matches exactly

### Translation failing

- Check that OPENROUTER_API_KEY is set (this key provides access to all three models:
  Hermes 3, Claude Sonnet 5, and Gemini 3.7 Flash)
- Run `npm run test:providers` to verify all provider endpoints are accessible

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
