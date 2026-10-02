# AMU installation provenance

- Source: `nextlevelbuilder/ui-ux-pro-max-skill`
- Source path: `.claude/skills/ui-ux-pro-max`
- Release: `v2.11.3`
- Commit: `4857a2c5ef989794751a0f66b8545a4a49566286`
- Installed: `2026-07-30`
- License: MIT (`LICENSE` in the upstream repository)

The AMU canonical copy only adapts executable paths from the Claude plugin root to
`{{AGENT_ROOT}}/skills/ui-ux-pro-max/`. Product-specific precedence, persistence,
dependency, and validation rules live in each canonical `AGENT_GUIDE.md`.

Update the canonical copy first. Do not patch synchronized `.claude/` or `.codex/`
copies directly.
