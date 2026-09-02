# Active Context — LINE Translation Bot

## What we are working on right now

**Translation quality fixes (post-language-hardening)** — three regressions
reported from the live bot:

1. **Profanity marker leak**: input
   `"...after you have sucked on my nipples and dick, we will walk..."`
   was producing output that contained `[คำสบถ:1]` (the Thai translation of
   the `[PROFANITY:1]` marker) instead of the substituted profanity token.
2. **Numbers / codes returning the user-facing error**: input `"1300"` or
   `"255/65 R17 110H"` returned
   `"⚠️ การแปลล้มเหลว — กรุณาลองส่งข้อความสั้นลง"` even though the model had
   correctly passed the untranslatable token through verbatim.
3. **Thai loanword mistranslation**: input
   `"จะเปลี่ยนหล้อเหรอค่ะ"` was translated as
   `"Are you going to change your panties, dear?"` — the model confused the
   Chinese-loanword "หล้อ" (tire/wheel, from Mandarin "lún" 轮) with an
   unrelated Thai word.

## Recent decisions

- **Marker-preservation rule moved into `buildSystemPrompt()`** instead of
  living only inside `appendHermesDirectives()`. The cascade may route
  masked text through Claude or Gemini, and those providers need the same
  rule. The new rule 10 in `buildSystemPrompt` says "PRESERVE PLACEHOLDER
  MARKERS" and explicitly says "applies to all providers".
- **`translate()` in `api/webhook.ts` now returns `{ text, ok }`** instead
  of a bare string. The previous "if `result === text` then error" check
  incorrectly treated untranslatable inputs (numbers, codes) as failures.
  Now `ok: false` is set only when all providers actually failed, and
  `ok: true` is set when any provider returned a response — even if that
  response equals the input (which is the correct behavior for numbers).
- **Defensive marker-loss check in both `translateWithPipeline` (webhook)
  and `translateWithProfanityPipeline` (library)**: before substituting
  the translated profanity tokens back, the code now checks that every
  `[PROFANITY:N]` marker is still present in the masked translation. If
  the cascade translated the markers away (e.g. into Thai "คำสบถ:1"),
  the pipeline returns the masked translation as-is rather than producing
  a corrupted result.
- **Thai loanword rule + glossary hint**: added rule 12 to
  `buildSystemPrompt` calling out "หล้อ" = tire (from Mandarin "lún" 轮)
  and the general principle "if a Thai word has multiple distinct meanings,
  prefer the meaning that fits the surrounding context".
- **Number / code pass-through rule**: added rule 11 to `buildSystemPrompt`
  telling the model to pass pure numbers, product codes, phone numbers,
  etc. through verbatim when they're already in the right script.

## Open work

- None for this milestone. All three reported regressions are fixed and
  the test suite (64 tests) covers the new prompt rules.
