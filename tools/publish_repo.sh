#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="reider789/rin_dnd"
if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI (gh) and run gh auth login first" >&2; exit 1
fi
gh auth status >/dev/null
if git remote get-url origin >/dev/null 2>&1; then
 git remote set-url origin "https://github.com/$REPO.git"
else
 git remote add origin "https://github.com/$REPO.git"
fi
git push -u origin HEAD:main
printf 'Published: https://github.com/%s\n' "$REPO"
