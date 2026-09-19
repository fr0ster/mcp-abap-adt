#!/usr/bin/env bash
# Publish both packages of this repository to npm, in dependency order.
#
# Usage: npm run release:publish            (add --dry-run to rehearse)
#
# Same shape as llm-agent's scripts/publish-all.sh, deliberately: one command,
# already-published versions skipped, abort on the first failure.
#
# The two packages are NOT npm workspaces here, and that is on purpose —
# declaring the workspace pulls @mcp-abap-adt/lib into the root install, and a
# version not yet on the registry makes a plain `npm install` fail with a 404.
# So each is published by path instead; `npm publish <folder>` runs that
# package's own prepublishOnly.
#
# On the first publish a browser window may open for 2FA. Tick "trust this
# device for 5 minutes" and the second package goes through without a prompt.
set -uo pipefail

cd "$(dirname "$0")/.."

DRY=""
for arg in "$@"; do
  [ "$arg" = "--dry-run" ] && DRY="--dry-run"
done

# Order matters and is not cosmetic: server/tsconfig.json resolves
# @mcp-abap-adt/lib through paths into ../dist, so the server cannot build
# until the library has.
PACKAGES=(
  "."
  "./server"
)

PUBLISHED=0
SKIPPED=0

for dir in "${PACKAGES[@]}"; do
  echo
  name="$(node -p "require('$dir/package.json').name")"
  version="$(node -p "require('$dir/package.json').version")"
  echo ">>> $name@$version"

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "    already on npm — skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Abort on ANY failure. Continuing would publish the server on top of a
  # library that is not there, which is an uninstallable release set.
  npm publish "$dir" --access public $DRY
  status=$?
  if [ "$status" -ne 0 ]; then
    echo >&2
    echo "ERROR: 'npm publish' failed for $name@$version (exit $status)." >&2
    echo "Aborting: the remaining package will NOT be published." >&2
    echo "A 404/401/403 here usually means the npm login / 2FA session dropped —" >&2
    echo "re-authenticate ('npm whoami' to check, 'npm login' to renew) and re-run." >&2
    echo "Already-published packages are detected and skipped on the next run." >&2
    echo >&2
    echo "Published before failure: $PUBLISHED  Skipped: $SKIPPED" >&2
    exit "$status"
  fi
  PUBLISHED=$((PUBLISHED + 1))
done

echo
echo "Published: $PUBLISHED  Skipped: $SKIPPED"
