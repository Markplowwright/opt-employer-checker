#!/bin/sh
# Builds the zip to upload to the Chrome Web Store: only what the extension needs at runtime.
# Usage (from the repo root):  sh store/build-zip.sh
set -e
VERSION=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' extension/manifest.json | head -1)
OUT="opt-employer-checker-$VERSION.zip"
rm -f "$OUT"
( cd extension && zip -q -r "../$OUT" manifest.json background.js content lib icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png )
echo "Built $OUT"
unzip -l "$OUT" | tail -n +4
