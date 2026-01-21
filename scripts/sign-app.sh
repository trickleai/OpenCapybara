#!/bin/bash
set -e

# Script to properly sign all components of the Capybara.app bundle
# This ensures Apple notarization will succeed

APP_PATH="${1:?Usage: $0 <app-path> <signing-identity> <entitlements-plist>}"
SIGNING_IDENTITY="${2:?Usage: $0 <app-path> <signing-identity> <entitlements-plist>}"
ENTITLEMENTS="${3:?Usage: $0 <app-path> <signing-identity> <entitlements-plist>}"

echo "================================================"
echo "Signing Capybara.app for notarization"
echo "================================================"
echo "App Path: $APP_PATH"
echo "Identity: $SIGNING_IDENTITY"
echo "Entitlements: $ENTITLEMENTS"
echo ""

# Function to sign a binary with proper flags
sign_binary() {
  local file="$1"
  local is_executable="${2:-false}"

  echo "Signing: $file"

  if [ "$is_executable" = "true" ]; then
    # Executables need hardened runtime
    codesign --force \
      --sign "$SIGNING_IDENTITY" \
      --entitlements "$ENTITLEMENTS" \
      --options runtime \
      --timestamp \
      "$file"
  else
    # Libraries and frameworks
    codesign --force \
      --sign "$SIGNING_IDENTITY" \
      --options runtime \
      --timestamp \
      "$file"
  fi
}

echo "Step 1: Sign Electron Framework libraries..."
sign_binary "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib"
sign_binary "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib"
sign_binary "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib"
sign_binary "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib"

echo ""
echo "Step 2: Sign Electron Framework itself..."
sign_binary "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"

echo ""
echo "Step 3: Sign Squirrel Framework components..."
sign_binary "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt" true
sign_binary "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel"

echo ""
echo "Step 4: Sign native Node modules..."
find "$APP_PATH/Contents/Resources/app" -name "*.node" -type f | while read -r file; do
  sign_binary "$file"
done

echo ""
echo "Step 5: Sign native executables..."
# ripgrep
if [ -f "$APP_PATH/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg" ]; then
  sign_binary "$APP_PATH/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg" true
fi

# node-pty spawn-helper
if [ -f "$APP_PATH/Contents/Resources/app/node_modules/node-pty/build/Release/spawn-helper" ]; then
  sign_binary "$APP_PATH/Contents/Resources/app/node_modules/node-pty/build/Release/spawn-helper" true
fi

echo ""
echo "Step 6: Sign Microsoft Authentication libraries..."
if [ -f "$APP_PATH/Contents/Resources/app/extensions/microsoft-authentication/dist/libmsalruntime.dylib" ]; then
  sign_binary "$APP_PATH/Contents/Resources/app/extensions/microsoft-authentication/dist/libmsalruntime.dylib"
fi

if [ -f "$APP_PATH/Contents/Resources/app/extensions/microsoft-authentication/dist/msal-node-runtime.node" ]; then
  sign_binary "$APP_PATH/Contents/Resources/app/extensions/microsoft-authentication/dist/msal-node-runtime.node"
fi

echo ""
echo "Step 7: Sign other frameworks..."
sign_binary "$APP_PATH/Contents/Frameworks/Capybara Helper.app" true
sign_binary "$APP_PATH/Contents/Frameworks/Capybara Helper (GPU).app" true
sign_binary "$APP_PATH/Contents/Frameworks/Capybara Helper (Plugin).app" true
sign_binary "$APP_PATH/Contents/Frameworks/Capybara Helper (Renderer).app" true

echo ""
echo "Step 8: Sign the main app bundle..."
codesign --deep --force \
  --sign "$SIGNING_IDENTITY" \
  --entitlements "$ENTITLEMENTS" \
  --options runtime \
  --timestamp \
  "$APP_PATH"

echo ""
echo "Step 9: Verify signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo ""
echo "Step 10: Test with spctl..."
spctl -a -vvv -t install "$APP_PATH" || true

echo ""
echo "================================================"
echo "✅ Signing complete!"
echo "================================================"
