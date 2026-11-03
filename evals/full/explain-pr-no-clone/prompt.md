---
tags: [full]
max_turns: 150
timeout_seconds: 1800
# allowed_tools only picks read-only tools. The run also needs Bash and Write,
# which only the CLI can grant: claude plugin eval . --allow-tools Write Bash
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
runs: 1
description: One end-to-end run against a real pull request from a workspace with no git checkout, graded on the produced page.
---

Explain https://github.com/malav2110/explain-diff-html/pull/9 as a
self-contained HTML page I can read to learn what changed and why. This
directory is not a clone of that repository. When the page is finished, also
copy it to `./page.html` in this directory so I can find it. If the home folder
is not writable here, write the page into this directory instead.
