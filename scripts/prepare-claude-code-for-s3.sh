#!/bin/bash
set -e

# Script to prepare Claude Code extension for S3 upload
# Run this locally to create a tarball of the extension

SOURCE_DIR="$HOME/.vscode/extensions/anthropic.claude-code-2.0.75-darwin-arm64"
OUTPUT_FILE="claude-code-2.0.75-darwin-arm64.tar.gz"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory not found: $SOURCE_DIR"
  exit 1
fi

echo "Creating tarball from: $SOURCE_DIR"
tar -czf "$OUTPUT_FILE" -C "$(dirname "$SOURCE_DIR")" "$(basename "$SOURCE_DIR")"

echo "✅ Created: $OUTPUT_FILE"
ls -lh "$OUTPUT_FILE"

echo ""
echo "Next steps:"
echo "1. Upload to S3:"
echo "   aws s3 cp $OUTPUT_FILE s3://YOUR_BUCKET/extensions/"
echo ""
echo "2. Update download script to use S3 URL"
