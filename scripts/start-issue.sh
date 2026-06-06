#!/usr/bin/env bash
# Start a Claude Code session for a GitHub Issue.
# Usage: ./scripts/start-issue.sh <issue-number>
#
# What it does:
#   1. Fetches the issue title and body from GitHub
#   2. Creates a git worktree + feature branch from develop
#   3. Launches Claude Code in that worktree with the issue as context
#
# Cleanup after the PR is merged:
#   ./scripts/cleanup-issue.sh <issue-number>

set -euo pipefail

ISSUE_NUM=${1:?Usage: start-issue.sh <issue-number>}
BASE_BRANCH="develop"

REPO=$(git remote get-url origin \
  | sed 's|.*github\.com[:/]||' \
  | sed 's|\.git$||')

echo "Fetching issue #${ISSUE_NUM} from ${REPO}..."

ISSUE_TITLE=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json title -q .title)
ISSUE_BODY=$(gh issue view  "$ISSUE_NUM" --repo "$REPO" --json body  -q .body)

SLUG=$(printf '%s' "$ISSUE_TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9]/-/g' \
  | sed 's/-\+/-/g'         \
  | sed 's/^-\|-$//g'       \
  | cut -c1-40)

BRANCH="feature/issue-${ISSUE_NUM}-${SLUG}"
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="${REPO_ROOT}/../atoikura-issue-${ISSUE_NUM}"

if [ -d "$WORKTREE_DIR" ]; then
  echo "Worktree already exists at ${WORKTREE_DIR}"
  echo "If you want to restart, run: ./scripts/cleanup-issue.sh ${ISSUE_NUM}"
  exit 1
fi

echo "Branch  : ${BRANCH}"
echo "Worktree: ${WORKTREE_DIR}"

git fetch origin "$BASE_BRANCH" --quiet
git worktree add -b "$BRANCH" "$WORKTREE_DIR" "origin/${BASE_BRANCH}"

echo "Starting Claude Code..."
cd "$WORKTREE_DIR"

claude "Implement GitHub Issue #${ISSUE_NUM} in this repository.

## Title
${ISSUE_TITLE}

## Body
${ISSUE_BODY}

---
Before starting:
1. Read CLAUDE.md
2. Read docs/spec.md and relevant docs/ files

Implement only what the issue describes. When done, create a PR:
  gh pr create --base develop --title \"feat: ${ISSUE_TITLE}\" --body \"Closes #${ISSUE_NUM}\""
