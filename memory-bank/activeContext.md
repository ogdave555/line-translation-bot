# Active Context — LINE Translation Bot

## What we are working on right now

**Model integration** — Integrated new models from model-guides:
- Primary: Claude Sonnet 4.6 via Anthropic API (CLAUDE_API_KEY)
- Fallback: Llama 3.3 70B via OpenRouter API (OPENROUTER_API_KEY)

## Recent decisions

- **New provider cascade**: Claude → Llama (2-tier cascade, replacing old 3-tier)
- **Claude via Anthropic direct**: Uses `claude-sonnet-4-6` model ID with CLAUDE_API_KEY
- **Llama via OpenRouter**: Uses `meta-llama/Llama-3.3-70B-Instruct` with OPENROUTER_API_KEY
- **Both models use temperature 0.1 and max_tokens 5000** (per model-guides)
- **appendLlamaDirectives()** renamed from appendHermesDirectives (deprecated alias exists)

## Open work

- None for this milestone. Models integrated and smoke test passes.
