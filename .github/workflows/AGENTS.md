# Workflow authoring checklist

When adding or modifying an agentic workflow:

- Agents run in a sandbox. Use `bash: ["*"]`; do not try to duplicate that
  boundary with a command allowlist.
- Assume the agent may need ordinary inspection and data-processing tools such
  as `jq`, even when the authored prompt does not predict every command.
- Do not replace `bash: ["*"]` with a narrower list during security or cleanup
  review unless a maintainer explicitly requests that restriction.
