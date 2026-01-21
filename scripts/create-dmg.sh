#!/bin/bash
# Capybara DMG Creation Script
# Simple and reliable DMG creation

set -e

# Configuration
APP_NAME="Capybara"
DMG_NAME="Capybara-macOS"
VOLUME_NAME="Capybara"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
APP_PATH="$(dirname "$ROOT_DIR")/VSCode-darwin-$(uname -m)/$APP_NAME.app"
DMG_FINAL="$ROOT_DIR/$DMG_NAME-$(uname -m).dmg"
DMG_TEMP="$ROOT_DIR/.build/temp.dmg"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Capybara DMG Creator ===${NC}"
echo ""

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
	echo -e "${RED}Error: App not found at $APP_PATH${NC}"
	exit 1
fi

# Clean up any mounted volumes
hdiutil detach "/Volumes/$VOLUME_NAME" -force 2>/dev/null || true

# Clean up old files
rm -f "$DMG_TEMP" "$DMG_FINAL"
mkdir -p "$(dirname "$DMG_TEMP")"

echo -e "${YELLOW}Step 1: Signing the app...${NC}"
# Sign with ad-hoc signature (no developer certificate required)
codesign --deep --force \
	--sign - \
	--entitlements "$ROOT_DIR/build/darwin/entitlements.plist" \
	--options runtime \
	"$APP_PATH"
# Remove quarantine attribute
xattr -cr "$APP_PATH"
echo "App signed with ad-hoc signature"

echo -e "${YELLOW}Step 2: Creating staging directory...${NC}"
STAGING="$ROOT_DIR/.build/dmg-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$APP_PATH" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

echo -e "${YELLOW}Step 3: Creating DMG...${NC}"
# Calculate size
SIZE=$(du -sm "$STAGING" | cut -f1)
SIZE=$((SIZE + 20))

# Create writable DMG
hdiutil create -srcfolder "$STAGING" \
	-volname "$VOLUME_NAME" \
	-fs HFS+ \
	-format UDRW \
	-size ${SIZE}m \
	"$DMG_TEMP"

echo -e "${YELLOW}Step 4: Customizing DMG window...${NC}"
# Mount with readwrite
MOUNT_OUTPUT=$(hdiutil attach -readwrite -noverify -noautoopen "$DMG_TEMP")
DEVICE=$(echo "$MOUNT_OUTPUT" | grep "Apple_HFS" | awk '{print $1}')
MOUNT_POINT="/Volumes/$VOLUME_NAME"

echo "   Mounted at: $MOUNT_POINT (device: $DEVICE)"
sleep 2

# Set Finder window appearance using AppleScript
osascript <<APPLESCRIPT
tell application "Finder"
	tell disk "$VOLUME_NAME"
		open
		set current view of container window to icon view
		set toolbar visible of container window to false
		set statusbar visible of container window to false
		set the bounds of container window to {100, 100, 640, 420}
		set theViewOptions to the icon view options of container window
		set arrangement of theViewOptions to not arranged
		set icon size of theViewOptions to 100
		set background color of theViewOptions to {65535, 65535, 65535}
		set position of item "$APP_NAME.app" of container window to {140, 160}
		set position of item "Applications" of container window to {400, 160}
		update without registering applications
		delay 1
		close
	end tell
end tell
APPLESCRIPT

# Wait and sync
sync
sleep 2

# Unmount
echo -e "${YELLOW}Step 5: Finalizing...${NC}"
hdiutil detach "$DEVICE" -force

# Convert to compressed DMG
hdiutil convert "$DMG_TEMP" -format UDZO -imagekey zlib-level=9 -o "$DMG_FINAL"

# Cleanup
rm -rf "$STAGING" "$DMG_TEMP"

echo ""
echo -e "${GREEN}=== DMG Created Successfully ===${NC}"
echo -e "Output: ${YELLOW}$DMG_FINAL${NC}"
echo "Size: $(du -h "$DMG_FINAL" | cut -f1)"
