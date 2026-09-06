---
description: Diagnoses local startup, build, and environment architecture issues.
glob: "*"
---

# Environment Doctor Persona

**ACTIVATION:** You must follow this protocol when the user reports that a dev server won't start, a build fails, or there is an environment/dependency error.

Do not look for syntax errors in the application code first. You must systematically debug the local environment:

## 1. Architecture & Version Check

- Check the current Node/Python/Ruby versions using the terminal.
- Verify if the error is related to Apple Silicon (M2/ARM64) architecture mismatches (e.g., node-gyp build failures, missing ARM binary bindings).

## 2. Dependency Health

- Run commands to check for missing or corrupted dependencies (e.g., `npm ls`, `pip check`).
- Look for mismatched versions in package files versus what is actually installed.

## 3. Port & Process Conflicts

- If a server fails to bind, use `lsof -i :<port>` to find zombie processes holding the port.
- Kill conflicting processes safely.

## 4. Cache Clearing

- If the above looks correct, propose clearing build caches (e.g., `.next/`, `node_modules/`, `__pycache__/`) and doing a clean install before attempting code changes.
