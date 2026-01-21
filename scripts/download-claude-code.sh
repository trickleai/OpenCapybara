#!/bin/bash
set -e

# Script to install Claude Code extension
# Priority:
# 1. Copy from user's VS Code extensions (local dev)
# 2. Download from S3 (CI/CD)
# 3. Download from VS Marketplace (fallback)

EXTENSION_DIR="extensions/.claude-code"
EXTENSION_VERSION="2.1.6"
PUBLISHER="Anthropic"
EXTENSION_NAME="claude-code"
PLATFORM="darwin-arm64"

echo "================================================"
echo "Installing Claude Code extension v${EXTENSION_VERSION}"
echo "================================================"

# Skip if extension already exists
if [ -d "$EXTENSION_DIR" ] && [ -f "$EXTENSION_DIR/extension.js" ] && [ -f "$EXTENSION_DIR/resources/native-binary/claude" ]; then
  echo "✅ Claude Code extension already exists with ARM64 binary"
  exit 0
fi

# Method 1: Copy from user's installed extensions (LOCAL DEV)
USER_EXTENSION_DIR=""
for dir in "$HOME/.vscode/extensions" "$HOME/.vscode-insiders/extensions" "$HOME/Library/Application Support/Code/User/globalStorage"; do
  if [ -d "$dir/anthropic.claude-code-$EXTENSION_VERSION-$PLATFORM" ]; then
    USER_EXTENSION_DIR="$dir/anthropic.claude-code-$EXTENSION_VERSION-$PLATFORM"
    break
  fi
done

if [ -n "$USER_EXTENSION_DIR" ] && [ -d "$USER_EXTENSION_DIR" ]; then
  echo "Found user-installed extension at: $USER_EXTENSION_DIR"
  echo "Copying to project..."
  rm -rf "$EXTENSION_DIR"
  mkdir -p "$(dirname "$EXTENSION_DIR")"
  cp -r "$USER_EXTENSION_DIR" "$EXTENSION_DIR"
  echo "✅ Successfully copied from user installation"
  ls -lh "$EXTENSION_DIR/resources/native-binary/"
  exit 0
fi

# Method 2: Download from S3 (CI/CD)
if [ -n "$CLAUDE_CODE_S3_URL" ]; then
  echo "Downloading from S3: $CLAUDE_CODE_S3_URL"
  if command -v aws &> /dev/null; then
    aws s3 cp "$CLAUDE_CODE_S3_URL" /tmp/claude-code.tar.gz
    tar -xzf /tmp/claude-code.tar.gz -C /tmp/
    mv /tmp/anthropic.claude-code-* "$EXTENSION_DIR"
    echo "✅ Successfully downloaded from S3"
    exit 0
  else
    echo "AWS CLI not found, skipping S3 download"
  fi
fi

# Method 3: Download from VS Marketplace (FALLBACK - will get Windows binary)
echo "⚠️  Warning: Marketplace download will get Windows binary, not macOS!"
echo "Please set CLAUDE_CODE_S3_URL environment variable or install extension locally"
echo ""
echo "Attempting Marketplace download anyway..."

# Method 2: Download platform-specific VSIX using vsce
# The VS Marketplace API requires special handling for platform-specific extensions
echo "Downloading VSIX for platform: ${PLATFORM}"

# Use vsce to download the correct platform-specific version
npx @vscode/vsce download "$PUBLISHER.$EXTENSION_NAME@$EXTENSION_VERSION" \
  --target "$PLATFORM" \
  --output /tmp/claude-code.vsix 2>&1 | grep -v "npm warn"

if [ ! -f /tmp/claude-code.vsix ]; then
  echo "Error: vsce download failed, trying fallback method..."

  # Fallback: Use direct API call with platform query parameter
  ASSET_URL="https://${PUBLISHER}.gallery.vsassets.io/_apis/public/gallery/publisher/${PUBLISHER}/extension/${EXTENSION_NAME}/${EXTENSION_VERSION}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage?targetPlatform=${PLATFORM}"

  curl -sS -L \
    -H "User-Agent: Mozilla/5.0" \
    -H "Accept: application/octet-stream" \
    --max-time 300 \
    -o /tmp/claude-code.vsix \
    "$ASSET_URL"
fi

# Check if download was successful
if [ ! -f /tmp/claude-code.vsix ] || [ ! -s /tmp/claude-code.vsix ]; then
  echo "Error: Failed to download extension"
  exit 1
fi

# Verify the downloaded file is a valid ZIP
echo "Verifying download..."
file /tmp/claude-code.vsix

# Check if it's actually a ZIP file
if ! file /tmp/claude-code.vsix | grep -q "Zip\|ZIP"; then
  echo "Error: Downloaded file is not a valid VSIX (ZIP) file"
  echo "File type:"
  file /tmp/claude-code.vsix
  echo "First 100 bytes:"
  head -c 100 /tmp/claude-code.vsix
  exit 1
fi

echo "Extracting VSIX..."
rm -rf "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR"

# VSIX is a ZIP file
unzip -q /tmp/claude-code.vsix -d /tmp/claude-code-tmp

# Copy extension contents (skip the metadata)
cp -r /tmp/claude-code-tmp/extension/* "$EXTENSION_DIR/"

# Cleanup
rm -rf /tmp/claude-code.vsix /tmp/claude-code-tmp

echo "✅ Claude Code extension installed at $EXTENSION_DIR"
ls -lh "$EXTENSION_DIR"
