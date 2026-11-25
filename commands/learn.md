---
description: Learn rules from the bugs this repository already fixed, and test them on bugs they never saw
allowed-tools: Bash(node:*)
---

Run this command from the repository root and wait for it to finish (it takes a few minutes):

```
node "${CLAUDE_PLUGIN_ROOT}/bin/twiceshy.mjs" learn
```

Then tell the user, in their language and in a few lines: how many past bugs the kept rules would have caught, the rules that were kept, and where they were saved. Do not run anything else.
