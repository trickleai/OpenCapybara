#!/bin/bash

# Capybara - Prepare Apple Developer Certificate for GitHub Actions
# This script helps you export your certificate and prepare it for CI/CD

set -e

echo "======================================"
echo "Capybara Certificate Preparation"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This script must be run on macOS${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: List available certificates${NC}"
echo ""
security find-identity -v -p codesigning
echo ""

read -p "Enter the name of your Developer ID Application certificate (e.g., 'Developer ID Application: Your Name (TEAM_ID)'): " CERT_NAME

if [[ -z "$CERT_NAME" ]]; then
    echo -e "${RED}Error: Certificate name cannot be empty${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Export certificate${NC}"
OUTPUT_FILE="${HOME}/Desktop/certificate.p12"

read -sp "Enter a password to protect the exported certificate (you'll need this for GitHub Secrets): " CERT_PASSWORD
echo ""

if [[ -z "$CERT_PASSWORD" ]]; then
    echo -e "${RED}Error: Certificate password cannot be empty${NC}"
    exit 1
fi

echo "Exporting certificate to: $OUTPUT_FILE"
security export -k login.keychain -t identities -f pkcs12 -P "$CERT_PASSWORD" -o "$OUTPUT_FILE"

if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo -e "${RED}Error: Certificate export failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Certificate exported successfully${NC}"
echo ""

echo -e "${YELLOW}Step 3: Convert to Base64${NC}"
BASE64_CERT=$(base64 -i "$OUTPUT_FILE")

echo -e "${GREEN}✓ Certificate converted to Base64${NC}"
echo ""

echo "======================================"
echo -e "${GREEN}Success! Now add these to GitHub Secrets:${NC}"
echo "======================================"
echo ""
echo -e "${YELLOW}1. APPLE_CERTIFICATE_BASE64${NC}"
echo "   Value (copy the entire line below):"
echo "   $BASE64_CERT"
echo ""
echo -e "${YELLOW}2. APPLE_CERTIFICATE_PASSWORD${NC}"
echo "   Value: [the password you entered above]"
echo ""
echo -e "${YELLOW}3. KEYCHAIN_PASSWORD${NC}"
echo "   Value: [any secure random password, e.g., $(openssl rand -base64 32)]"
echo ""

# Get Apple ID info
echo "======================================"
echo -e "${YELLOW}Additional Information Needed:${NC}"
echo "======================================"
echo ""

read -p "Enter your Apple ID email: " APPLE_ID
echo ""

echo -e "${YELLOW}4. APPLE_ID${NC}"
echo "   Value: $APPLE_ID"
echo ""

echo -e "${YELLOW}5. APPLE_ID_PASSWORD${NC}"
echo "   You need to create an App-Specific Password:"
echo "   1. Go to https://appleid.apple.com/account/manage"
echo "   2. Sign in with your Apple ID"
echo "   3. In the 'Sign-In and Security' section, click 'App-Specific Passwords'"
echo "   4. Click '+' to generate a new password"
echo "   5. Give it a name like 'GitHub Actions Capybara'"
echo "   6. Copy the generated password and save it as APPLE_ID_PASSWORD secret"
echo ""

# Get Team ID
echo "Getting your Team ID..."
TEAM_ID=$(security find-certificate -c "$CERT_NAME" -p | openssl x509 -subject -noout | grep -o 'OU=[^/]*' | cut -d'=' -f2 | head -1)

if [[ -n "$TEAM_ID" ]]; then
    echo -e "${YELLOW}6. APPLE_TEAM_ID${NC}"
    echo "   Value: $TEAM_ID"
else
    echo -e "${YELLOW}6. APPLE_TEAM_ID${NC}"
    echo "   Could not automatically detect Team ID."
    echo "   Find it at: https://developer.apple.com/account#MembershipDetailsCard"
fi
echo ""

echo "======================================"
echo -e "${YELLOW}AWS S3 Configuration:${NC}"
echo "======================================"
echo ""
echo "You also need to configure AWS credentials for S3 upload:"
echo ""
echo -e "${YELLOW}7. AWS_ACCESS_KEY_ID${NC}"
echo "   Your AWS access key ID"
echo ""
echo -e "${YELLOW}8. AWS_SECRET_ACCESS_KEY${NC}"
echo "   Your AWS secret access key"
echo ""
echo -e "${YELLOW}9. AWS_REGION${NC}"
echo "   e.g., us-east-1, us-west-2, etc."
echo ""
echo -e "${YELLOW}10. S3_BUCKET${NC}"
echo "    Your S3 bucket name (e.g., capybara-releases)"
echo ""

echo "======================================"
echo -e "${GREEN}Next Steps:${NC}"
echo "======================================"
echo ""
echo "1. Go to your GitHub repository settings"
echo "2. Navigate to: Settings → Secrets and variables → Actions"
echo "3. Click 'New repository secret' and add all the secrets listed above"
echo "4. Delete the certificate file from your desktop:"
echo "   rm $OUTPUT_FILE"
echo ""
echo -e "${YELLOW}IMPORTANT: Keep your certificate password safe!${NC}"
echo ""
