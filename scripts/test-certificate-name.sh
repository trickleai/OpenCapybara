#!/bin/bash

# Test Certificate Name Finder
# This script helps you find the correct certificate name when you can't access the keychain

echo "======================================"
echo "Certificate Name Finder"
echo "======================================"
echo ""

TEAM_ID="your_team_id"

echo "Based on your Apple Developer account, the certificate name is likely one of:"
echo ""
echo "Option 1: Developer ID Application: Weixi Ltd. (${TEAM_ID})"
echo "Option 2: Developer ID Application: Shenzhen Weixi Technology Co., Ltd. (${TEAM_ID})"
echo ""

echo "Let me check what's actually in your keychain..."
echo ""

# Check all keychains
security find-identity -v -p codesigning

echo ""
echo "======================================"
echo "If you don't see any certificates above, you need the PRIVATE KEY."
echo "======================================"
echo ""
echo "The certificate on Apple Developer website is only the PUBLIC certificate."
echo "To use it for signing, you need the PRIVATE KEY, which only exists on the"
echo "Mac where the certificate was originally created."
echo ""
echo "Solutions:"
echo ""
echo "1. Ask XU MING to export the certificate with private key (.p12 file)"
echo "2. Or ask XU MING to run the prepare-certificate.sh script"
echo "3. Or create a NEW certificate under your own name"
echo ""
