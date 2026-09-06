# Model Translation Guides — Index

This folder contains everything needed to run Claude Sonnet 4.6 and Llama 3.3 70B for Thai-English translation.

## Files

| File | Purpose |
|------|---------|
| **[thai-translation-guide.md](thai-translation-guide.md)** | Complete setup guide with API settings, prompts, judge config, troubleshooting |
| **[claude-quick-reference.md](claude-quick-reference.md)** | Copy-paste ready code for Claude only |
| **[llama-quick-reference.md](llama-quick-reference.md)** | Copy-paste ready code for Llama only |
| **[glossary.md](glossary.md)** | Thai particles, pronouns, slang, Buddhist terms, explicit vocabulary |

## Quick Start

### Primary Model (Claude)
```javascript
// From: memory-bank/model-guides/claude-quick-reference.md
const CONFIG = {
  model: "anthropic/claude-sonnet-4.6",
  temperature: 0.1,
  max_tokens: 5000
};
```

### Backup Model (Llama)
```javascript
// From: memory-bank/model-guides/llama-quick-reference.md
const CONFIG = {
  model: "meta-llama/Llama-3.3-70B-Instruct",
  temperature: 0.1,
  max_tokens: 5000
};
```

## Model Comparison

| | Claude Sonnet 4.6 | Llama 3.3 70B |
|--|--|--|
| **Role** | Primary | Backup |
| **Provider** | OpenRouter | OpenRouter |
| **Quality** | 51% pass rate | 47% pass rate |
| **Speed** | Slower (P95 ~14s en→th) | Faster |
| **400 Errors** | None | None |
| **Emoji Handling** | Excellent | Minor glitches |
| **Cost** | Higher | Lower |

## Key Differences

### Temperature
**Both: 0.1** — prevents persona drift, maintains consistency

### Max Tokens
**Both: 5000** — 2500 is TOO LOW for multi-turn conversations

### System Prompts
- **Claude**: Full detailed prompt with comprehensive instructions
- **Llama**: Shorter prompt with explicit "CASUAL REGISTER (CRITICAL FOR LLAMA)" section

### Thai → English (Critical Difference)
**Qwen has 400 errors on Thai→English. Use Llama as backup instead.**

## Architecture

```
memory-bank/model-guides/
├── README.md              ← This file
├── thai-translation-guide.md   ← Full guide (all models)
├── claude-quick-reference.md   ← Claude-only copy-paste
├── llama-quick-reference.md    ← Llama-only copy-paste
└── glossary.md                 ← Thai language reference
```

## Usage Pattern

1. **Always try Claude first** — highest quality
2. **Fall back to Llama if:**
   - Claude unavailable
   - Rate limited
   - Cost constraints
   - Thai→English direction (Qwen fails, Llama works)
3. **Never use Qwen for Thai→English** — has 400 errors

## Testing Checklist

From [thai-translation-guide.md](thai-translation-guide.md#testing-checklist):

- [ ] Emoji count matches source exactly
- [ ] No script leak (Thai script in en→th output, Latin in th→en output)
- [ ] Proper nouns preserved
- [ ] Numbers/dates preserved exactly
- [ ] Casual register maintained
- [ ] Thai pragmatic particles rendered correctly
- [ ] Non-native English persona consistent
- [ ] No native slang leaking through
- [ ] Explicit content translated faithfully
- [ ] URLs/phone numbers preserved

## Integration with Translation Suite

These models are configured in:
- `config/bilingual-models.json` — model lineup
- `config/rules.json` — per-direction prompts
- `config/judge.json` — quality judgment settings
- `lib/bilingualRunner.js` — conversation-aware translation runner

For standalone use outside the translation suite, copy the relevant quick-reference file.

---

*Last updated: 2026-09-06*
