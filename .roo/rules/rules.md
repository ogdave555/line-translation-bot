# CRITICAL SYSTEM INSTRUCTIONS FOR CLINE

You are operating within VSCode on a MacBook M2. Due to known pseudo-terminal (PTY) buffering, exact-string matching constraints, and auto-formatting conflicts, you MUST strictly adhere to the following operational rules to prevent terminal hangs and tool failures.

## 1. Terminal Execution & Scripting (NO HEREDOCS)

- **NEVER** use heredocs (`cat << 'EOF'`, `cat << EOF`, etc.) for writing scripts or multiline text to the terminal. The fast input stream will crash or garble the ZSH terminal buffer.
- **ALWAYS** use your native file writing tools to create or modify a file (e.g., writing to `/tmp/script.py` or the project directory).
- Once the file is written and verified, execute it via the terminal (e.g., `python3 /tmp/script.py`).

## 2. Editor Tool, Formatting & String Matching Failures

- The `editor` tool requires exact byte-level string matching. It often fails due to invisible characters, differing line endings, or whitespace variations.
- If an `editor` tool replacement fails with a "text not found" error, **DO NOT** blindly retry the exact same line.
- **Fallback 1:** Expand your search block to replace the entire surrounding function or object to ensure you capture the invisible formatting.
- **Fallback 2:** For highly problematic invisible characters (like unicode arrows or em-dashes), bypass the editor tool and use native tools. Either execute a `python3 -c` script to read/write the file at the byte level, or use macOS `sed` (e.g., `sed -i '' "s/old/new/g" filename`).
- **Format-on-Save Awareness (CRITICAL):** This workspace uses Prettier auto-formatting on save. If an edit succeeds but a subsequent diff check fails purely due to spacing, indentation, or line-break mismatches, **DO NOT** attempt to rewrite the file to "fix" the formatting. Assume the auto-formatter successfully reorganized the code and move on to the next task.

## 3. Shell Command Simplicity & Pager Avoidance

- **NEVER** write long, complex shell commands with chained pipes (`|`), multiple redirects, or nested `grep`/`awk` sequences. If a chained command fails midway, it will permanently hang the AI session.
- Break complex data processing down into smaller, discrete sequential commands. Save intermediate outputs to temporary files if necessary.
- **No Interactive Commands:** Never run commands that require interactive input, wait for a `Y/N` confirmation, or open in a pager/text editor (like `less` or `vim`). Always use flags to force immediate automated execution (e.g., `--no-pager`, `-y`, `--quiet`, `--force`).

## 4. Communication & Coding Style

- When writing code or providing instructions, always give full, detailed, and simple instructions.
- Break the work down into distinct parts with checks along the way.
- Create explicit "Waypoints" so progress can be referenced later.
- Never output massive walls of code without explaining the incremental steps to implement and test them.

## 5. Architectural & Complex Tasks (Sequential Thinking)

- For any task involving a new feature, a multi-file refactor, or complex logic, you **MUST** use the Sequential Thinking MCP tool before writing any code.
- Break the problem down into a step-by-step logical sequence.
- Present your architectural plan and wait for the user to explicitly type "approved" or "proceed" before executing file edits.

## 6. The Memory Bank System

- You must maintain a `memory-bank/` directory in the root of this project.
- Before starting any task, you must read all files in this directory to restore your context.
- The directory must contain:
  - `projectbrief.md`: The core app requirements and goals.
  - `techContext.md`: The tech stack, database schema, and environment details.
  - `systemPatterns.md`: The architectural patterns and formatting conventions used in this codebase.
  - `activeContext.md`: The exact feature we are currently working on and recent decisions made.
  - `progress.md`: What has been completed and what is left on the roadmap.
- At the end of every task, before saying you are done, you MUST update `activeContext.md` and `progress.md` so that you do not lose context if the chat is cleared.
