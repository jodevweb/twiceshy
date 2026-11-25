# Twice Shy

**Once bitten, twice shy.** Your coding agent won't repeat a bug your repository already fixed.

*English · [Français](README.fr.md)*

Twice Shy is a [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin. It reads the bugs your
repository already fixed, turns them into rules, **proves each rule on recent bugs it has never seen**, and then
checks your agent's work every time it says "done". When something fails, the agent is sent back with the exact
error and the offending line, before you see anything.

<p align="center"><img src="docs/demo.gif" alt="Twice Shy learning rules from a repository's past bug fixes, then sending the agent back when its change breaks one" width="820"></p>
<p align="center"><sub>On a small demo repository. Twice Shy's output is real; the agent's mistake was typed by hand, because on a
repository this small the agent got it right on its own.</sub></p>

## Why

Agents say "fixed, tests pass" a lot. Sometimes they didn't run the tests. Sometimes they re-introduce a bug
your team fixed three months ago, because nothing in the code says why it was written that way.

Running the tests when the agent stops is easy, and plenty of hooks do it. Twice Shy does that too, but the part
that matters is the rest: **rules that come from your own history, with a measured track record.**

## Does it work?

Measured on open source repositories, with rules learned from older fixes and tested on the 12 most recent ones,
which the rules had never seen:

| Repository | Language | Recent bugs the kept rules would have caught |
|---|---|---|
| [spf13/cobra](https://github.com/spf13/cobra) | Go | 5 of 12 |
| [pallets/click](https://github.com/pallets/click) | Python | 2 of 12 |

About two minutes and $1.25 at API prices for each run. Numbers like these vary from one run to the next: the
judge is a language model.

## How it works

**`/twiceshy:learn`** (once, then whenever you like)

1. Finds the bug fixes in your last 400 commits: `fix:` and friends, in English or French. When the team does
   not label them, a fast model reads the commit messages and picks the ones that repair a bug.
2. **Splits the history in two.** Older fixes are used to write rules; the most recent ones are kept aside to
   test them. A rule is never scored on the bug it was written from.
3. Tests each rule on each held-out fix, both ways:
   - before the fix, the code was wrong: would the rule have flagged it? (bug caught)
   - after the fix, the code is right: would the rule still flag it? (false alarm)
4. Rules that catch nothing or cry wolf are rewritten once and tested again. Still useless: dropped.
5. Saves what survived to `.twiceshy/rules.json`, with each rule's score. Commit it: your team gets the same rules.

**The `Stop` hook** (every time the agent says it's done)

1. Nothing changed since the last successful check: the agent stops, nothing runs.
2. Runs your project's checks (types, lint, tests), detected from the repository.
3. Asks a judge whether the changed lines break a rule that applies to the changed files.
4. Anything fails: the agent is sent back with the output and the line, and fixes it.
5. Three failed attempts in a row, or the agent stops without changing anything: Twice Shy lets it stop and
   tells you in one line what is still failing. It never loops forever.

## Install

You need [Claude Code](https://docs.claude.com/en/docs/claude-code), `git` and Node.js 18+.

In Claude Code:

```
/plugin marketplace add jodevweb/twiceshy
/plugin install twiceshy@twiceshy
```

Restart Claude Code, open your project, then:

```
/twiceshy:learn
```

That's it. From now on, every time the agent stops, Twice Shy checks its work.

## Commands

| Command | What it does |
|---|---|
| `/twiceshy:learn` | Learns rules from past bug fixes and tests them. A few minutes. |
| `/twiceshy:status` | Shows the rules, their scores, and the checks that run on every stop. |
| `/twiceshy:check` | Checks the current changes now, without waiting for the agent to stop. |

The same commands work outside Claude Code: `node <plugin folder>/bin/twiceshy.mjs learn|status|check`.

## Languages

Rules are judged on diffs, so they work in any language. Checks are detected from the project files:

| Stack | Detected checks |
|---|---|
| Node / TypeScript | `typecheck`, `lint`, `test` scripts (npm, pnpm, yarn, bun) |
| Python | `ruff`, `mypy` when configured, `pytest` (uv, poetry) or Django's `manage.py test` |
| Go | `go vet ./...`, `go test ./...` |
| Rust | `cargo test` |
| PHP | `composer test`, `php artisan test`, `phpunit` |
| Java / Kotlin | Maven, Gradle |
| Ruby, Elixir | `rspec`, `mix test` |

Anything else, or a monorepo: declare your checks yourself (see below).

## Configuration

Optional. `.twiceshy/config.json`:

```json
{
  "gates": ["pnpm typecheck", "pnpm test --run"],
  "model": "sonnet",
  "maxAttempts": 3,
  "gateTimeoutSeconds": 300,
  "enabled": true
}
```

- `gates` replaces the detected checks.
- `model` is the model used to write and judge rules.
- `enabled: false` turns the hook off for this repository without uninstalling anything.

## Cost and privacy

Twice Shy has no server and no API key. It calls the `claude` CLI already signed in on your machine. With a Claude
subscription, it is part of your usage. `learn` prints what the run would cost at API prices: around a dollar on a
typical repository. Each check on stop is one call, only when code changed.

Your code goes to the same place it already goes when you use Claude Code, and nowhere else.

## Limits

- The judge is a language model: it can be wrong. That is why every rule is scored on real bugs before it is
  kept, and why the score is shown.
- A repository with few bug fixes in its history gets few rules. Checks still run.
- If your tests were already failing before the agent started, Twice Shy stops blocking once the agent stops
  without changing anything, and tells you.

## Roadmap

- Learn from your own corrections: what you fix by hand after an agent becomes a rule, tested on history first.
- Architecture Decision Records: turn existing ADRs into checked rules, write the ADR when an agent makes a real
  architecture decision, flag ADRs the code no longer follows.
- A GitHub Action that does the same on every pull request.

## License

MIT
