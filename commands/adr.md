---
description: List this repository's ADRs and the decisions the code no longer follows; "init" creates the ADR folder
argument-hint: "[init]"
allowed-tools: Bash(node:*)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/twiceshy.mjs" adr $ARGUMENTS` and show its output to the user as is.

If it created the folder, tell the user in one sentence what changes from now on: when an agent adds a dependency, Twice Shy asks it to write an ADR explaining why before it can stop.
