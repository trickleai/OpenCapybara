# Capybara 应用签名指南

## 问题说明

在 macOS 上，未经过 Apple 公证的应用会被 Gatekeeper 阻止运行，显示 "Apple could not verify 'Capybara' is free of malware" 的警告。

## 解决方案

### 方案 1：自签名（推荐用于本地开发和内部分发）

我们已经配置了自签名脚本，可以自动签名应用并移除隔离属性。

#### 使用方法

1. **签名已构建的应用**
   ```bash
   bash scripts/sign-app.sh
   ```

2. **创建签名的 DMG**
   ```bash
   bash scripts/create-dmg.sh
   ```
   生成的 DMG 位于：`Capybara-macOS-arm64.dmg`

#### 用户安装说明

如果用户在安装后仍然看到 Gatekeeper 警告，可以通过以下方式绕过：

**方法 1：通过系统设置（推荐）**
1. 尝试打开应用，会弹出警告
2. 打开 **系统设置** → **隐私与安全性**
3. 在 "安全性" 部分找到 "仍要打开" 按钮
4. 点击 "打开"

**方法 2：使用右键菜单**
1. 右键点击应用图标
2. 选择 "打开"
3. 在弹出的对话框中点击 "打开"

**方法 3：终端命令（一次性移除隔离）**
```bash
xattr -cr /Applications/Capybara.app
```

### 方案 2：Apple 开发者签名（用于公开分发）

如果需要公开分发应用，建议使用 Apple 开发者证书进行签名和公证。

#### 前置条件

1. 加入 Apple Developer Program（$99/年）
2. 创建 Developer ID Application 证书
3. 获取 Apple ID 专用密码

#### 步骤

1. **查看可用的签名证书**
   ```bash
   security find-identity -v -p codesigning
   ```

2. **修改签名脚本**
   编辑 `scripts/sign-app.sh`，将：
   ```bash
   codesign --force --deep --sign -
   ```
   改为：
   ```bash
   codesign --force --deep --sign "Developer ID Application: Your Name (TEAM_ID)"
   ```

3. **签名并公证**
   ```bash
   # 签名
   bash scripts/sign-app.sh

   # 创建 DMG
   bash scripts/create-dmg.sh

   # 公证（需要 Apple ID）
   xcrun notarytool submit Capybara-macOS-arm64.dmg \
       --apple-id "your@email.com" \
       --password "app-specific-password" \
       --team-id "TEAM_ID" \
       --wait

   # 装订公证票据
   xcrun stapler staple Capybara-macOS-arm64.dmg
   ```

4. **验证公证**
   ```bash
   spctl -a -vvv -t install Capybara-macOS-arm64.dmg
   ```

## 当前配置

- **签名类型**：Ad-hoc（自签名）
- **Entitlements**：`build/darwin/entitlements.plist`
- **Bundle ID**：`com.capybara.app`
- **硬化运行时**：已启用

## 权限说明

应用包含以下权限（entitlements）：

- `com.apple.security.cs.allow-jit` - 允许 JIT 编译（Electron 需要）
- `com.apple.security.cs.allow-unsigned-executable-memory` - 允许未签名的可执行内存
- `com.apple.security.cs.disable-library-validation` - 禁用库验证
- `com.apple.security.automation.apple-events` - Apple Events 自动化
- `com.apple.security.network.client` - 网络客户端访问
- `com.apple.security.network.server` - 网络服务器访问
- `com.apple.security.files.user-selected.read-write` - 用户选择的文件读写

## 故障排除

### 问题：签名后仍然提示恶意软件警告

**解决方法**：
```bash
# 重新签名并移除隔离属性
bash scripts/sign-app.sh

# 或者手动移除隔离属性
xattr -cr .build/electron/Capybara.app
```

### 问题：DMG 打开后应用无法启动

**解决方法**：
检查应用是否正确签名：
```bash
codesign -dv --verbose=4 /Applications/Capybara.app
```

如果显示 "Signature=adhoc"，则签名正常。

### 问题：需要分发给其他人使用

**建议**：
- 对于内部分发：使用自签名 + 用户手动信任
- 对于公开分发：使用 Apple 开发者证书 + 公证

## 参考资源

- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
