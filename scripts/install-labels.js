/**
 * Install gh-agentic-workflows labels
 *
 * Defines the labels required by the gh-agentic-workflows
 * issue → PR → review → fix → merge pipeline, and a helper to create or
 * update them via the GitHub REST API.
 *
 * `.github/workflows/install-labels.yml` embeds this same LABELS array and
 * install loop directly in its actions/github-script step (github-script
 * already injects `github`/`context` as globals there, so the workflow
 * doesn't need to require() this file). This module exists so the same
 * logic can be reused from your own scripts or workflows - see
 * scripts/README.md for other installation methods (the Actions workflow,
 * `gh label create`, `gh api`).
 *
 * Keep LABELS here in sync with the copy in
 * .github/workflows/install-labels.yml.
 */

const LABELS = [
  {
    name: 'agent/code',
    description: 'Triggers the drafter agent',
    color: '0E8A16', // green
  },
  {
    name: 'agent/fixme',
    description: 'Reviewer agent found issues that need fixing',
    color: 'D93F0B', // red
  },
  {
    name: 'agent/lgtm',
    description: 'Reviewer agent approved; ready to auto-merge',
    color: '0E8A16', // green
  },
  {
    name: 'agent/drafter-working',
    description: 'The drafter agent is actively working on this issue',
    color: 'FBCA04', // yellow
  },
  {
    name: 'agent/review-working',
    description: 'The review agent is actively working on this PR',
    color: 'FBCA04', // yellow
  },
  {
    name: 'agent/fix-working',
    description: 'The fix agent is actively working on this PR',
    color: 'FBCA04', // yellow
  },
  {
    name: 'agent/workflow-edits-allowed',
    description: 'Pre-authorizes agent runs to edit protected files without the request_review gate',
    color: '5319E7', // purple
  },
  {
    name: 'agent/flake-tracker',
    description: 'Marks the CI flake tracker issue the merge queue analyzer maintains',
    color: '1D76DB', // blue
  },
  {
    name: 'agent/retro',
    description: 'Marks improvement issues filed by the retrospective analyzer',
    color: '1D76DB', // blue
  },
];

/**
 * Create or update all LABELS on a repository.
 *
 * `github` must be an Octokit-like client exposing `rest.issues.getLabel`,
 * `rest.issues.createLabel`, and `rest.issues.updateLabel` (e.g. the
 * `github` object actions/github-script injects, or the result of
 * `@actions/github`'s `getOctokit()`). `context` must expose
 * `repo: { owner, repo }`.
 */
async function installLabels(github, context) {
  const { owner, repo } = context.repo;

  console.log(`Installing labels on ${owner}/${repo}...`);

  for (const label of LABELS) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name: label.name });

      console.log(`Updating label: ${label.name}`);
      await github.rest.issues.updateLabel({
        owner,
        repo,
        name: label.name,
        description: label.description,
        color: label.color,
      });
    } catch (error) {
      if (error.status === 404) {
        console.log(`Creating label: ${label.name}`);
        await github.rest.issues.createLabel({
          owner,
          repo,
          name: label.name,
          description: label.description,
          color: label.color,
        });
      } else {
        console.error(`Error processing label ${label.name}:`, error.message);
        throw error;
      }
    }
  }

  console.log('All labels installed successfully.');
}

module.exports = { LABELS, installLabels };
