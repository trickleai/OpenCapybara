#!/bin/bash
set -e

# Capybara 本地签名构建脚本
# 使用本地证书文件进行签名构建

echo "================================================"
echo "🚀 Capybara 本地签名构建开始"
echo "================================================"

# 配置变量
CERTIFICATE_DIR="$HOME/apple"
CERTIFICATE_PATH="$CERTIFICATE_DIR/certificate.p12"
TEMP_DIR="/tmp/capybara-signing"
KEYCHAIN_PATH="$TEMP_DIR/app-signing.keychain-db"
KEYCHAIN_PASSWORD="temp-build-keychain-$(date +%s)"

# 从环境变量读取配置（安全最佳实践）
# 使用方式：
#   export CERTIFICATE_PASSWORD="your_password"
#   export APPLE_TEAM_ID="your_team_id"
#   export APPLE_ID="your@email.com"
#   export APPLE_ID_PASSWORD="your_app_specific_password"
#   ./scripts/build-signed-local.sh
CERTIFICATE_PASSWORD="${CERTIFICATE_PASSWORD:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_ID_PASSWORD="${APPLE_ID_PASSWORD:-}"

# 检查证书文件
if [ ! -f "$CERTIFICATE_PATH" ]; then
    echo "❌ 证书文件不存在: $CERTIFICATE_PATH"
    exit 1
fi

echo "✅ 证书文件检查通过"

# 验证必需的环境变量
if [ -z "$CERTIFICATE_PASSWORD" ]; then
    echo "❌ 错误: 请设置 CERTIFICATE_PASSWORD 环境变量"
    echo "   示例: export CERTIFICATE_PASSWORD=\"your_password\""
    exit 1
fi

if [ -z "$APPLE_TEAM_ID" ]; then
    echo "❌ 错误: 请设置 APPLE_TEAM_ID 环境变量"
    echo "   示例: export APPLE_TEAM_ID=\"ABCD123456\""
    exit 1
fi

if [ -z "$APPLE_ID" ]; then
    echo "❌ 错误: 请设置 APPLE_ID 环境变量"
    echo "   示例: export APPLE_ID=\"your@email.com\""
    exit 1
fi

if [ -z "$APPLE_ID_PASSWORD" ]; then
    echo "❌ 错误: 请设置 APPLE_ID_PASSWORD 环境变量"
    echo "   示例: export APPLE_ID_PASSWORD=\"xxxx-xxxx-xxxx-xxxx\""
    exit 1
fi

echo "✅ 环境变量验证通过"

# 创建临时目录
mkdir -p "$TEMP_DIR"

# 清理函数
cleanup() {
    echo "🧹 清理临时文件..."
    security delete-keychain "$KEYCHAIN_PATH" 2>/dev/null || true
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo ""
echo "Step 1: 设置签名证书..."

# 创建临时 keychain
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# 导入证书到 keychain
security import "$CERTIFICATE_PATH" \
  -P "$CERTIFICATE_PASSWORD" \
  -A \
  -t cert \
  -f pkcs12 \
  -k "$KEYCHAIN_PATH"
security list-keychain -d user -s "$KEYCHAIN_PATH"

# 设置 codesign 权限
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# 获取签名身份
SIGNING_IDENTITY=$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep "Developer ID Application" | head -1 | grep -o '".*"' | sed 's/"//g')
if [ -z "$SIGNING_IDENTITY" ]; then
    echo "❌ 未找到有效的签名身份"
    exit 1
fi
echo "✅ 找到签名身份: $SIGNING_IDENTITY"

# echo ""
echo "Step 2: 安装依赖..."
cd extensions/capybara-defaults && npm run compile
cd ../capybara-agent && npm run compile
cd ../..

echo ""
echo "Step 3: 构建 macOS 应用..."
npm run vscode-mac-arm64-build

echo ""
echo "Step 4: 签名应用..."
APP_PATH="../VSCode-darwin-arm64/Capybara.app"
ENTITLEMENTS="build/darwin/entitlements.plist"

if [ ! -f "$ENTITLEMENTS" ]; then
    echo "❌ Entitlements 文件不存在: $ENTITLEMENTS"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "❌ 应用程序不存在: $APP_PATH"
    exit 1
fi

echo "正在签名应用，签名身份: $SIGNING_IDENTITY"
bash scripts/sign-app.sh "$APP_PATH" "$SIGNING_IDENTITY" "$ENTITLEMENTS"

echo ""
echo "Step 5: 创建 DMG..."
# 安装 create-dmg（如果未安装）
if ! command -v create-dmg &> /dev/null; then
    echo "安装 create-dmg..."
    brew install create-dmg
fi

DMG_PATH="./Capybara-macOS-arm64-signed.dmg"
rm -f "$DMG_PATH"

# 创建 DMG
create-dmg \
  --volname "Capybara" \
  --volicon "resources/darwin/capybara.icns" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "Capybara.app" 175 190 \
  --hide-extension "Capybara.app" \
  --app-drop-link 425 190 \
  --codesign "$SIGNING_IDENTITY" \
  "$DMG_PATH" \
  "$APP_PATH" || {
    echo "create-dmg 失败，使用备用方法..."
    bash scripts/create-dmg.sh
    mv "Capybara-macOS-arm64.dmg" "$DMG_PATH" 2>/dev/null || true
}

echo ""
echo "Step 6: 公证 DMG（可选）..."
echo "开始公证流程..."

if [ -f "$DMG_PATH" ]; then
    echo "提交公证请求..."
    SUBMISSION_ID=$(xcrun notarytool submit "$DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_ID_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait \
      --timeout 30m \
      --output-format json 2>/dev/null | jq -r '.id' 2>/dev/null || echo "")

    if [ -n "$SUBMISSION_ID" ]; then
        echo "提交 ID: $SUBMISSION_ID"

        # 检查公证状态
        STATUS=$(xcrun notarytool info "$SUBMISSION_ID" \
          --apple-id "$APPLE_ID" \
          --password "$APPLE_ID_PASSWORD" \
          --team-id "$APPLE_TEAM_ID" \
          --output-format json 2>/dev/null | jq -r '.status' 2>/dev/null || echo "Unknown")

        if [ "$STATUS" = "Accepted" ]; then
            echo "✅ 公证成功！"
            echo "装订公证票据..."
            xcrun stapler staple "$DMG_PATH"

            echo "验证公证..."
            spctl -a -vvv -t install "$DMG_PATH"

            # 重命名为已公证版本
            NOTARIZED_DMG="Capybara-macOS-arm64-signed-notarized.dmg"
            mv "$DMG_PATH" "$NOTARIZED_DMG"
            DMG_PATH="$NOTARIZED_DMG"
        else
            echo "⚠️ 公证状态: $STATUS"
            echo "DMG 已签名但未公证"
        fi
    else
        echo "⚠️ 无法提交公证请求"
        echo "DMG 已签名但未公证"
    fi
else
    echo "❌ DMG 文件不存在，无法公证"
fi

echo ""
echo "================================================"
echo "🎉 构建完成！"
echo "================================================"

if [ -f "$DMG_PATH" ]; then
    echo "✅ 签名 DMG 文件已生成: $DMG_PATH"
    echo "文件大小: $(du -h "$DMG_PATH" | cut -f1)"

    # 验证签名
    echo ""
    echo "🔍 签名验证:"
    codesign -dv --verbose=4 "$DMG_PATH" || true

    echo ""
    echo "🔍 公证验证:"
    spctl -a -vvv -t install "$DMG_PATH" || true
else
    echo "❌ 构建失败，未生成 DMG 文件"
    exit 1
fi

echo ""
echo "📝 使用说明:"
echo "1. DMG 文件位于: $(pwd)/$DMG_PATH"
echo "2. 双击 DMG 文件进行安装"
echo "3. 将 Capybara.app 拖拽到 Applications 文件夹"
echo "4. 从 Applications 文件夹启动 Capybara"
