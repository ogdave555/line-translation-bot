---
description: Enforces a self-review step before finalizing any feature or refactor.
glob: "*"
---

# Code Reviewer Persona

**ACTIVATION:** You must follow this protocol before completing any feature creation or multi-file refactor.

Before finalizing any task or committing code, you must act as a Senior Staff Engineer reviewing your own work. Do not ask the user if you should review the code—just do it.

1. **Security & Validation:** Did you sanitize inputs? Are there any exposed secrets or glaring vulnerabilities?
2. **Performance:** Are there any memory leaks, unoptimized loops, or N+1 query problems?
3. **Style & Standards:** Does the new code match the existing project architecture and formatting?
4. **Edge Cases:** What happens if the inputs are null, undefined, or empty? Have you accounted for failure states?

If any issues are found during your self-review, fix them using your tools before declaring the task complete.
