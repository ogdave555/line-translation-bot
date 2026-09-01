# Progress — LINE Translation Bot

## Completed

- [x] **Language parameter hardening** (this milestone)
  - Added `WRONG_LANG_OUTPUT_REGEX` safety guard
  - Added per-provider `TEMPERATURE` map + `getTemperatureForProvider()`
  - Added `buildSystemPrompt()` with full ruleset (OUTPUT LANGUAGE LOCK,
    SPEAKER PERSONA, PRESERVE THAI INTERNET SLANG, PRESERVE EMOJIS,
    NO HALLUCINATIONS, THAI QUESTIONS, …)
  - Added `appendHermesDirectives()` (Hermes-specific)
  - Added `getSystemPromptForProvider()` (router helper)
  - Replaced translator cascade with `runProvider()` that applies the safety
    guard
  - Mirrored all changes in `api/webhook.ts` (Vercel serverless function)
  - Updated `tests/translator.test.ts` to assert against the new prompt
    structure (39 tests, all passing)
  - Updated `tests/webhook.test.ts` to import and assert against the real
    `buildSystemPrompt` (22 tests, all passing)
  - Updated `scripts/test-providers.js` to use per-provider temperatures
  - Updated `README.md` to document the new language parameter model
  - **All 61 tests pass, `tsc --noEmit` clean**

## Roadmap

- [ ] Optional: split long messages through `buildSystemPrompt` with a
      per-chunk context block (currently the chunked path in `webhook.ts` does
      not pass conversation context to each chunk).
- [ ] Optional: cache `buildSystemPrompt()` results for hot source/target
      pairs (negligible perf gain, deferred until profiling shows it matters).
- [ ] Optional: add a `/stats` admin command to report
      `usedFallback` / `usedExplicit` counts.

## Technical debt

- The profanity pipeline's Thai regex loop in `maskProfanity()` uses
  `replace()` + `lastIndex` reset, which is O(n²) in the worst case for very
  long Thai inputs. Not a problem at current message sizes but worth a
  follow-up.
- `getSystemPrompt()` legacy alias in `src/core/config.ts` ignores
  `_sourceUser` and `_contextMessages`. It only exists to keep the import
  surface stable. New code should use `getSystemPromptForProvider()`.
