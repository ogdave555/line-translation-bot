---
description: Enforces a strict evidence-first verification protocol.
glob: "*"
alwaysApply: false
---

# Truth-First (Anti-Hallucination Guardrail)

**ACTIVATION:** You must follow this protocol whenever the user asks you to "fix", "debug", or resolve an error.

When this rule is active, you are strictly prohibited from assuming the cause of a bug or rewriting code based on a first glance. You must follow this Evidence Protocol:

## 1. Verify the Current State

- Read the relevant files using your file reading tools.
- Do NOT trust the user's summary of the code if you haven't seen the actual file contents yourself.

## 2. Gather Evidence

- If there is an error, use terminal commands to run the script, test suite, or linter to reproduce the error locally.
- Use `grep` or search tools to find where the error originates.
- Output the exact error or log trace in your thought process.

## 3. Hypothesize and Confirm

- State 2-3 possible reasons for the failure based _only_ on the gathered evidence.
- Add debug logging and run the code again to confirm which hypothesis is true.

## 4. Execute the Fix

- Only after you have concrete proof of the root cause, propose the file edit.
- After the edit, you MUST run the verification step again to prove the fix worked.
