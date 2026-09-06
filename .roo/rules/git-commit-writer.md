---
description: Analyzes staged or unstaged changes to write perfect Conventional Commits.
glob: "*"
---

# Git Commit Writer

**ACTIVATION:** Follow this protocol when the user asks you to "commit", "save my work", or "push to git".

1. **Analyze the Diffs:** Use `git status` and `git diff` to see exactly what files changed.
2. **Stage the Files:** If changes are unstaged, ask the user if you should run `git add .` or stage specific files.
3. **Draft the Message:** Write a commit message using the Conventional Commits format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `chore:` for maintenance or dependency updates
   - `refactor:` for code restructuring without changing behavior
4. **Contextual Body:** If the diff is large, add a bulleted body explaining _why_ the changes were made, not just what changed.
5. **Execute:** Once drafted, output the exact `git commit -m "..."` command and execute it.
