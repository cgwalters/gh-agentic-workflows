# gh-agentic-workflows development helpers.
# Run `just --list` to see available recipes.

gh_aw_version := `cat .github/aw/gh-aw-version`

# Install (or re-pin) the gh-aw CLI extension to the version this repo requires.
setup:
    #!/usr/bin/env bash
    set -euo pipefail
    wanted="{{ gh_aw_version }}"
    if gh extension list 2>/dev/null | grep -q 'github/gh-aw'; then
        installed=$(gh aw version 2>&1 | awk '{print $NF}')
        if [ "$installed" = "$wanted" ]; then
            echo "gh-aw $wanted already installed."
            exit 0
        fi
        echo "gh-aw installed at ${installed:-unknown}, re-pinning to $wanted..."
        gh extension remove gh-aw
    fi
    gh extension install github/gh-aw --pin "$wanted"

# Compile all gh-aw workflow .md sources to .lock.yml (run `just setup` first).
compile:
    gh aw compile drafter review fix queue-triage ci-triage retro --approve

# Setup + compile in one step.
all: setup compile
