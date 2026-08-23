# LINE Translation Bot

A LINE bot that automatically translates English to Thai and vice versa, designed for private group conversations between two people.

## Features

- ✨ **Bi-directional translation**: English ↔ Thai
- 🎯 **Personalized translations**: Tailored for specific user profiles
- 🧠 **Conversation memory**: Remembers recent context for better translations
- 🚀 **Dual AI support**: Gemini Flash (primary) + OpenRouter (fallback)
- 🔞 **Profanity preservation**: Translates profanity in both languages
- ⚡ **Fast response**: Optimized for instant messaging
- 📱 **Smart filtering**: Skips images, videos, URLs, emojis, etc.

## User Profiles

The bot is configured for two specific users:

| Speaker | Age | Origin | Native | Learning | Level |
|---------|-----|--------|--------|----------|-------|
| English Speaker | 37 | England | English | Thai | Beginner |
| Thai Speaker | 19 | Thailand | Thai | English | None |

## Prerequisites

- Node.js 22 or higher
- LINE Developer Account: https://developers.line.biz/
- Gemini API Key: https://ai.google.dev/gemini-api/docs/get-api-key
- OpenRouter API Key: https://openrouter.ai/

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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook` | POST | LINE webhook endpoint |
| `/api/webhook` | GET | Health check |

## How It Works

1. User sends a message in the LINE group
2. Bot receives the message via webhook
3. Bot detects message type (text vs image, etc.)
4. Text messages are translated to the recipient's language
5. Translation is sent as a reply

## Message Types Handled

✅ **Translated**: Text messages (English and Thai)
❌ **Skipped**: Images, videos, audio, stickers, files, locations

## Translation Features

### Profanity Handling
- Profanity words are translated normally if they exist in target language
- If not, equivalent vulgar terms are used
- No filtering or censorship

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

## Project Structure

```
LINE-BOT/
├── api/
│   └── webhook.ts          # Vercel serverless function
├── data/
│   └── memory.json         # Conversation memory (auto-generated)
├── src/
│   ├── bot.ts              # Bot event handlers
│   ├── config.ts           # Configuration and system prompts
│   ├── index.ts            # Entry point
│   ├── memory.ts           # Conversation memory management
│   ├── translator.ts       # Translation engine
│   └── utils.ts            # Helper functions
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
- Check GEMINI_API_KEY and OPENROUTER_API_KEY
- Both are required for fallback functionality

### Messages not translating
- Bot must be in the group
- Messages must be text (not images/files)
- Check Vercel logs in dashboard

## Cost Management

- **Gemini Free Tier**: 750M tokens/month
- **OpenRouter**: Pay-per-use model
- Monitor usage in respective dashboards

## License

MIT