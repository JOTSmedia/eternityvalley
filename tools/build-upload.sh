#!/usr/bin/env bash
# Rebuild github_upload/ from the working tree.
#
# The folder is a derived artefact, not a second copy of the project:
# it is what gets uploaded to GitHub Pages. Regenerate it after any
# change rather than editing it directly, or the two drift and you
# publish yesterday's site.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=github_upload

rm -rf "$OUT"
mkdir -p "$OUT/server"

# The site itself
cp -R css js images "$OUT/"
cp index.html admin.html credits.html memorial.html partner-materials.html partners.html privacy.html terms.html manifest.json "$OUT/"
cp Start-Eternal-Valley.command Start-Eternal-Valley.bat "$OUT/"

# Docs and rules that belong with the source
cp SETUP.md firestore.rules "$OUT/"

# The optional payment server, without its dependencies
cp server/server.js server/package.json server/package-lock.json server/.env.example "$OUT/server/"
cp -R server/data "$OUT/server/"

# Files that only exist in the upload
cp tools/upload-assets/README.md "$OUT/README.md"
cp tools/upload-assets/404.html "$OUT/404.html"
cp tools/upload-assets/gitignore "$OUT/.gitignore"
touch "$OUT/.nojekyll"          # serve files as-is; don't run Jekyll

# A PWA start_url of "/" points at the account root on a project site
python3 - "$OUT/manifest.json" <<'PY'
import json, sys, pathlib
p = pathlib.Path(sys.argv[1]); m = json.loads(p.read_text())
m['start_url'] = './'; m['scope'] = './'
p.write_text(json.dumps(m, indent=2) + '\n')
PY

find "$OUT" -name '.DS_Store' -delete
echo "Built $OUT — $(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
