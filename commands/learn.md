---
description: Learn rules from your past bugs, your corrections to agents and your written decisions (ADR, CLAUDE.md), and test them
allowed-tools: Bash(node:*)
---

Run this command from the repository root and wait for it to finish (it takes a few minutes):

```
node "${CLAUDE_PLUGIN_ROOT}/bin/twiceshy.mjs" learn
```

Then tell the user, in their language and in a few lines: how many rules were kept and where they come from, how many past bugs they would have caught, any written decision the code no longer follows, and where they were saved. Do not run anything else.
