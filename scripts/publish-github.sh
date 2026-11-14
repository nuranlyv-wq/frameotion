#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo="nuranlyv-wq/frameotion"
gh auth status
gh repo edit "$repo" --visibility public --accept-visibility-change-consequences
git push origin main
git push origin v0.1.0
if gh api "repos/$repo/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$repo/pages" -f 'source[branch]=main' -f 'source[path]=/docs'
else
  gh api --method POST "repos/$repo/pages" -f 'source[branch]=main' -f 'source[path]=/docs'
fi
if ! gh release view v0.1.0 --repo "$repo" >/dev/null 2>&1; then
  gh release create v0.1.0 --repo "$repo" --verify-tag --title 'Frameotion v0.1.0' --notes 'Local motion engine with 16 MCP tools, editable scenes, browser frame previews and MP4 export. Includes a website for generating local client configuration. Requires Node.js, Chrome and FFmpeg. Client model costs and optional third-party runtime terms apply.'
fi
printf '\nRepository: https://github.com/%s\nConnection page: https://nuranlyv-wq.github.io/frameotion/ (allow a few minutes for deployment)\n' "$repo"
