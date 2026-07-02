# Claude Code skills for OutsiderMap

This directory vendors a set of Claude Code **skills** into the repo so they are
committed, shared with the team, and available in every session (including
Claude Code on the web, where global `~/.claude` installs do not persist).

## Vendored skills (committed here in `.claude/skills/`)

| Source | Skills | Install method |
| --- | --- | --- |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-composition-patterns`, `vercel-optimize`, `vercel-react-best-practices`, `vercel-react-native-skills`, `vercel-react-view-transitions`, `web-design-guidelines`, `writing-guidelines` | `npx skills add vercel-labs/agent-skills` (tracked in `skills-lock.json`) |
| [obra/superpowers](https://github.com/obra/superpowers) | `brainstorming`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `using-superpowers`, `verification-before-completion`, `writing-plans`, `writing-skills` | skill dirs vendored from the repo |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `impeccable` (frontend design detector/reviewer) | `npx impeccable install --scope=project --providers=claude` |
| [rebelytics/one-skill-to-rule-them-all](https://github.com/rebelytics/one-skill-to-rule-them-all) | `task-observer` ("One Skill to Rule Them All") | `SKILL.md` vendored into `task-observer/` |

## Not committed — global, per-machine installs (re-run locally)

These modify the global `~/.claude` environment or run a background service, so
they cannot be committed to the repo. Re-run them on each machine/session where
you want them:

- **claude-mem** — persistent memory service + hooks + MCP:
  ```bash
  npx claude-mem install            # then: npx claude-mem start
  ```
- **superpowers** as a full Claude Code *plugin* (adds its slash commands and
  session-start hook on top of the vendored skills above):
  ```
  /plugin marketplace add obra/superpowers-marketplace
  /plugin install superpowers@superpowers-marketplace
  ```
- **impeccable** globally (design-check hook for all projects):
  ```bash
  npx impeccable install --scope=global --providers=claude
  ```

## Notes

- `.claude/settings.local.json` is intentionally **not** committed — it is
  personal, machine-specific config (e.g. the impeccable PostToolUse hook, which
  references an absolute `~/.claude` path).
- Some skills (`task-observer`, `using-superpowers`) recommend a `CLAUDE.md`
  instruction or a session-start hook for reliable auto-activation. They still
  work on-demand via description matching without that setup.
- All skills run with full agent permissions — review before use.
