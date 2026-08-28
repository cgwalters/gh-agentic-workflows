---
# Retro — retrospective analysis of workflow runs across bootc-dev repos.
# Standalone in this host repository: deliberately excluded from aw.yml, so
# downstream gh aw add installations do not deploy or schedule it.
#
# Trigger:  schedule (every 6 hours) or workflow_dispatch
# Reads:    workflow runs from target repositories, existing issues
# Writes:   new issues with improvement suggestions (via create-issue safe-output)
# Next:     nothing automated - issue triage and implementation are left to humans
# Docs:     README.md, "Retrospective analyzer"
#
# YAML comments like this one are stripped at compile time and never reach
# the agent; the markdown body below is the prompt. See README.md,
# "Where to document a workflow".
description: |
  Retrospective analyzer. Runs in this repository on a schedule, analyzes
  workflow runs in active bootc-dev repositories, identifies patterns, and
  files improvement issues here where appropriate (avoiding duplicates).

on:
  schedule:
    # Every 6 hours at :17 past the hour — avoids the :00 stampede while
    # spreading load across the day. Runs at 00:17, 06:17, 12:17, 18:17 UTC.
    - cron: "17 */6 * * *"
  workflow_dispatch:
    inputs:
      target_repos:
        description: "Comma-separated list of repos to analyze (owner/repo format)"
        required: false
        type: string
      lookback_days:
        description: "Number of days of history to analyze"
        required: false
        type: string
        default: "7"

# A retrospective can take longer than its schedule interval. Keep one active
# run without canceling its useful analysis when the next schedule fires.
concurrency:
  group: "gh-aw-${{ github.workflow }}"
  cancel-in-progress: false

permissions:
  contents: read
  actions: read
  issues: read
  pull-requests: read

model: claude-sonnet-4-5-20250929
engine:
  id: claude
network: defaults

tools:
  bash: ["*"]
  github:
    toolsets: [default, actions]
    min-integrity: approved
    trusted-users: ["${{ vars.GH_AW_APP_BOT_SLUG }}"]

safe-outputs:
  github-app:
    client-id: ${{ vars.GH_AW_APP_CLIENT_ID }}
    private-key: ${{ secrets.GH_AW_APP_PRIVATE_KEY }}
  create-issue:
    # Cap at a reasonable number per retro run — if the agent finds more than
    # this many distinct improvement opportunities in one pass, batch them or
    # prioritize the most impactful ones.
    max: 5
    labels: ["agent/retro"]
  noop:
  missing-data:

timeout-minutes: 20

# Pre-fetch and validate the target list before the agent starts. This does not
# fetch run data; the agent reads runs with GitHub MCP after receiving a bounded,
# deterministic list of repositories and a validated lookback window.
steps:
  - name: Pre-fetch retro data
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      INPUT_REPOS: ${{ github.event.inputs.target_repos }}
      LOOKBACK_DAYS: ${{ github.event.inputs.lookback_days || '7' }}
      REPO: ${{ github.repository }}
      OWNER: ${{ github.repository_owner }}
    run: |
      set -euo pipefail

      BASE_DIR="/tmp/gh-aw/agent/retro"
      mkdir -p "$BASE_DIR"

      if ! [[ "$LOOKBACK_DAYS" =~ ^[0-9]+$ ]] || [ "$LOOKBACK_DAYS" -lt 1 ] || [ "$LOOKBACK_DAYS" -gt 90 ]; then
        echo "::error::lookback_days must be a whole number from 1 through 90; got '$LOOKBACK_DAYS'."
        exit 1
      fi

      WARNINGS="$BASE_DIR/inaccessible-repos.txt"
      : > "$WARNINGS"
      TARGETS="$BASE_DIR/target-repos.txt"
      : > "$TARGETS"
      TARGET_STATE="$BASE_DIR/target-state.txt"

      # A dispatch override is intentionally limited to this organization and
      # verified as active/non-fork. The host may be named explicitly, but the
      # organization-wide default excludes it because retro runs from here and
      # is intended to scan the other repositories.
      if [ -n "${INPUT_REPOS:-}" ]; then
        declare -A seen=()
        while IFS= read -r target; do
          target="${target#"${target%%[![:space:]]*}"}"
          target="${target%"${target##*[![:space:]]}"}"
          if ! [[ "$target" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
            echo "::error::target_repos entry '$target' must use owner/repo format."
            exit 1
          fi
          if [ "${target%%/*}" != "$OWNER" ]; then
            echo "::error::target_repos entry '$target' is outside organization '$OWNER'."
            exit 1
          fi
          if [ -n "${seen[$target]:-}" ]; then
            continue
          fi
          seen[$target]=1
          if metadata=$(gh api "repos/$target" 2>&1); then
            if repo_name=$(jq -er 'select(.archived == false and .fork == false) | .full_name' <<<"$metadata"); then
              printf '%s\n' "$repo_name" >> "$TARGETS"
            else
              printf '%s\n' "$target is archived or a fork and was skipped." >> "$WARNINGS"
            fi
          else
            printf '%s\n' "$target could not be read and was skipped: $metadata" >> "$WARNINGS"
          fi
        done < <(printf '%s' "$INPUT_REPOS" | tr ',' '\n')
      else
        DISCOVERED="$BASE_DIR/discovered-repos.json"
        DISCOVERY_ERROR="$BASE_DIR/discovery-error.txt"
        if ! gh api --paginate "orgs/$OWNER/repos?type=all&per_page=100" > "$DISCOVERED" 2> "$DISCOVERY_ERROR"; then
          {
            echo "Could not list repositories for organization '$OWNER'."
            cat "$DISCOVERY_ERROR"
          } >> "$WARNINGS"
        else
          jq -sr --arg host "$REPO" '[.[][] | select(.archived == false and .fork == false and .full_name != $host) | .full_name] | sort | .[]' "$DISCOVERED" > "$TARGETS"
          printf '%s\n' "Default discovery lists only repositories visible to this workflow's GITHUB_TOKEN; private or internal repositories without token access cannot be analyzed." >> "$WARNINGS"
        fi
      fi

      if [ ! -s "$TARGETS" ]; then
        printf '%s\n' "No accessible active, non-fork target repositories were found. Do not analyze runs; report this through missing-data." >> "$WARNINGS"
        printf '%s\n' "empty" > "$TARGET_STATE"
      else
        printf '%s\n' "ready" > "$TARGET_STATE"
      fi

      CUTOFF_DATE=$(date -u -d "$LOOKBACK_DAYS days ago" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
        || date -u "-v-${LOOKBACK_DAYS}d" '+%Y-%m-%dT%H:%M:%SZ')
      echo "Lookback window: runs created after $CUTOFF_DATE"
      echo "$CUTOFF_DATE" > "$BASE_DIR/cutoff-date.txt"

      {
        echo "=== Retro Pre-Analysis ==="
        echo "Target repositories (from $TARGETS):"
        cat "$TARGETS"
        echo ""
        echo "Target state (from $TARGET_STATE):"
        cat "$TARGET_STATE"
        echo ""
        echo "Lookback window: $LOOKBACK_DAYS days (after $CUTOFF_DATE)"
        echo ""
        echo "Access limitations (from $WARNINGS):"
        cat "$WARNINGS"
        echo ""
        echo "The agent should:"
        echo "1. List and analyze workflow runs in these repos from the lookback window"
        echo "2. Identify patterns: recurring failures, slow workflows, flaky tests, etc."
        echo "3. Check existing issues (labeled 'agent/retro' or related) to avoid duplicates"
        echo "4. File new issues for actionable improvements via create-issue safe-output"
        echo "5. Call noop if no new issues are warranted this run"
      } | tee "$BASE_DIR/summary.txt"

      echo ""
      echo "Pre-analysis complete. Agent should start with $BASE_DIR/summary.txt"
---

# Retro: Workflow Retrospective Analyzer

You're running from the host `gh-agentic-workflows` repository. You analyze
workflow runs in the target repositories selected by pre-fetch, but duplicate
searches and every new improvement issue are centralized in this host repository.

## Your task

1. **Read the pre-fetch summary** at `/tmp/gh-aw/agent/retro/summary.txt` to
    see which repos to analyze and the lookback window.

2. **Stop on an empty target state**: Read
   `/tmp/gh-aw/agent/retro/target-state.txt`. If it says `empty`, do not query
   GitHub, analyze runs, or check duplicates. Call `missing-data` with the
   relevant warnings from `inaccessible-repos.txt`, then stop.

3. **Analyze workflow runs** in each target repository:
   - List workflow runs from the lookback window using GitHub MCP tools
   - Identify patterns worth investigating:
     - Recurring failures (same workflow/job failing repeatedly)
     - Long-running workflows that could be optimized
     - Flaky tests or intermittent issues
     - Underutilized or overly complex workflows
     - Error patterns in failed runs
   - Look for opportunities to improve the agentic pipeline itself
     (drafter/review/fix/merge) based on how it's performing in practice

4. **Check for duplicate issues**:
   - List existing open issues in the host repository (`gh-agentic-workflows`)
     labeled `agent/retro` or related to the patterns you've identified
   - Don't file an issue if an open one already covers the same improvement
   - If an existing issue is stale or incomplete, note that in your analysis
     but don't create a duplicate

5. **File actionable issues**:
   - For each distinct, actionable improvement you identify, create one issue
     via the `create-issue` safe-output
   - Each issue should include:
     - Clear title describing the improvement opportunity
     - Evidence from the analysis (which repos, which runs, frequency, etc.)
     - Concrete suggested action (what should change and why)
     - Links to example workflow runs demonstrating the pattern
   - Label each issue `agent/retro` (done automatically by the safe-output config)
   - Cap at 5 issues per run — if you find more, prioritize the highest-impact
     ones and note in one issue that there are additional opportunities

6. **Output**:
   - If you file any issues, you're done (create-issue safe-output called)
   - If no new issues are warranted (everything looks good, or all relevant
     issues already exist), call `noop` with a summary of what you checked
   - If you can't complete the analysis (GitHub API errors, missing data, etc.),
     call `missing-data` describing what went wrong

## Constraints

- Only analyze the repositories listed in `/tmp/gh-aw/agent/retro/target-repos.txt`
- Do not analyze anything when `target-state.txt` says `empty`; call
  `missing-data` and stop instead
- Only look at runs within the lookback window (after the cutoff date in
  `cutoff-date.txt`)
- Never create duplicate issues — always check existing open issues first
- Focus on actionable improvements with clear evidence, not vague hunches
- Each issue should stand alone and be immediately actionable by a human or
  another agent
- Respect the 5-issue-per-run cap — quality over quantity
- Report inaccessible repositories from `inaccessible-repos.txt` via `missing-data`
  when access prevents a useful organization-wide analysis; do not claim that
  private or internal repositories were covered unless they appear in the target list

## Context

This repository contains the gh-agentic-workflows pipeline itself (drafter →
review → fix → merge), plus ci-triage, queue-triage, and other workflows. Look
for patterns that would improve the pipeline's effectiveness, reduce noise, or
make the agents more helpful to contributors.
