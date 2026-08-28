# Scripts

This directory contains utility scripts for setting up and managing the gh-agentic-workflows pipeline.

## install-labels.js

Installs the required labels on a repository for the issue → PR → review → fix → merge pipeline.

### Labels Created

The script creates or updates the following labels:

- **`agent/code`** (green) — Triggers the drafter agent. When applied to an issue, the drafter agent reads the issue, implements the change, validates it, and opens a pull request.

- **`agent/fixme`** (red) — Applied by the review workflow when a PR needs work. The fix workflow consumes this label, reads the reviewer's feedback, and pushes a fix commit.

- **`agent/lgtm`** (green) — Applied by the review workflow when a PR is approved and ready to merge. The merge workflow automatically merges PRs with this label.

- **`agent/drafter-working`**, **`agent/review-working`**, **`agent/fix-working`** (yellow) — Indicates that the corresponding agent (drafter, review, or fix) is actively working on the issue or PR. Per-workflow labels avoid one workflow's cleanup clearing another's still-in-progress signal on the same PR.

- **`agent/workflow-edits-allowed`** (purple) — Pre-authorizes an agent run to edit protected files (workflows, README, etc.) without triggering the request_review gate. Apply this to an issue before labeling it `agent/code`, or to a PR before applying `agent/fixme`.

- **`agent/retro`** (blue) — Marks improvement issues filed by this repository's host-only retrospective analyzer. It is not needed by downstream pipeline installations.

### Usage

#### Via GitHub Actions

The easiest way to install labels is using the included workflow. It also runs weekly on
its own (the create-or-update loop is idempotent, so this just self-heals any label
that gets renamed, deleted, or recolored by hand) — running it manually is only needed
to create the labels immediately instead of waiting for the first scheduled run:

1. Go to your repository's **Actions** tab
2. Select the **Install Labels** workflow
3. Click **Run workflow**

Alternatively, you can copy `.github/workflows/install-labels.yml` to your own repository and run it there. That
workflow inlines the LABELS array and install loop directly in its `actions/github-script` step, so it has no
dependency on this file being checked out.

#### Via github-script action

If you want to integrate label installation into your own workflow, `install-labels.js` is a plain CommonJS module
you can `require()` after checking out the repo:

```yaml
- uses: actions/checkout@v4
- name: Install gh-agentic-workflows labels
  uses: actions/github-script@v7
  with:
    script: |
      const { installLabels } = require('./scripts/install-labels.js');
      await installLabels(github, context);
```

#### Via GitHub CLI

You can also use the GitHub CLI to create the labels directly:

```bash
gh label create "agent/code" --color 0E8A16 \
  --description "Triggers the drafter agent"

gh label create "agent/fixme" --color D93F0B \
  --description "Reviewer agent found issues that need fixing"

gh label create "agent/lgtm" --color 0E8A16 \
  --description "Reviewer agent approved; ready to auto-merge"

gh label create "agent/drafter-working" --color FBCA04 \
  --description "The drafter agent is actively working on this issue"

gh label create "agent/review-working" --color FBCA04 \
  --description "The review agent is actively working on this PR"

gh label create "agent/fix-working" --color FBCA04 \
  --description "The fix agent is actively working on this PR"

gh label create "agent/workflow-edits-allowed" --color 5319E7 \
  --description "Pre-authorizes agent runs to edit protected files without the request_review gate"

gh label create "agent/retro" --color 1D76DB \
  --description "Marks improvement issues filed by the retrospective analyzer"
```

Or via `gh api`, e.g. to update an existing label:

```bash
gh api repos/:owner/:repo/labels/agent/code -X PATCH \
  -f color="0E8A16" -f description="Triggers the drafter agent"
```

### Customizing Labels

To customize the labels (change colors, descriptions, or add new ones), edit the `LABELS` array in
`install-labels.js` **and** the matching copy in `.github/workflows/install-labels.yml`, then rerun the
installation workflow to update the labels on your repository.
