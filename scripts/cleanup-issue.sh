#!/usr/bin/env bash
# Remove the worktree and local branch for a completed issue.
# Usage: ./scripts/cleanup-issue.sh <issue-number>
# Run this after the PR has been merged.

set -euo pipefail

ISSUE_NUM=${1:?Usage: cleanup-issue.sh <issue-number>}

REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="${REPO_ROOT}/../atoikura-issue-${ISSUE_NUM}"

if [ ! -d "$WORKTREE_DIR" ]; then
  echo "Worktree not found: ${WORKTREE_DIR}"
  exit 1
fi

BRANCH=$(git -C "$WORKTREE_DIR" rev-parse --abbrev-ref HEAD)

git worktree remove "$WORKTREE_DIR" --force
git branch -d "$BRANCH" 2>/dev/null || git branch -D "$BRANCH"

echo "Removed worktree and branch: ${BRANCH}"
