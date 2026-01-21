# 安装 .p12 证书并配置 CI/CD

当你拿到 XU MING 分享的 `.p12` 证书文件后，按照以下步骤操作。

## 前提条件

确保你有：
- ✅ `.p12` 证书文件（例如：`weixi-cert.p12`）
- ✅ 证书密码（XU MING 应该告诉你）
- ✅ Apple Developer 账号信息

---

## 步骤 1: 安装证书到你的 Mac

### 方法 A: 使用 Keychain Access（图形界面）

1. **双击 `.p12` 文件**
2. **选择 keychain**：
   - 选择 **"login"** keychain（推荐）
   - 点击 "Add"
3. **输入密码**：
   - 输入 XU MING 告诉你的证书密码
   - 点击 "OK"
4. **验证安装**：
   - 打开 "Keychain Access" 应用
   - 选择 "login" keychain
   - 在 "My Certificates" 分类中查找
   - 应该看到：`Developer ID Application: Weixi Ltd. (85UKH2MY8J)`

### 方法 B: 使用命令行

```bash
# 导入证书到 login keychain
security import ~/Downloads/weixi-cert.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P "证书密码" \
  -T /usr/bin/codesign

# 验证安装
security find-identity -v -p codesigning
```

**期望输出：**
```
1) ABC123DEF456... "Developer ID Application: Weixi Ltd. (85UKH2MY8J)"
     1 valid identities found
```

✅ 如果看到这个输出，说明证书安装成功！

---

## 步骤 2: 运行准备脚本

现在可以运行之前创建的准备脚本了：

```bash
cd /Users/samdychen/Documents/repos/kled
bash scripts/prepare-certificate.sh
```

### 脚本会做什么：

1. **列出可用证书** - 你会看到刚安装的证书
2. **询问证书名称** - 复制粘贴：
   ```
   Developer ID Application: Weixi Ltd. (85UKH2MY8J)
   ```
3. **导出证书** - 输入一个**新密码**（用于 GitHub Secrets）
4. **转换为 Base64** - 自动完成
5. **显示所有需要的 Secrets** - 复制这些值

### 重要提示：

⚠️ **脚本要求的密码** ≠ **XU MING 给你的密码**

- **XU MING 的密码**：用于解锁 `.p12` 文件（步骤 1 使用）
- **新密码**：你在脚本中设置的，用于 GitHub Secrets

---

## 步骤 3: 创建 Apple ID App-Specific Password

公证需要 App-Specific Password：

1. 访问：https://appleid.apple.com/account/manage
2. 登录你的 Apple ID（Weixi Ltd. 账号的 Apple ID）
3. 找到 **"App-Specific Passwords"** 部分
4. 点击 **"+"** 生成新密码
5. 命名：`GitHub Actions Capybara`
6. **复制生成的密码**（格式：`xxxx-xxxx-xxxx-xxxx`）

---

## 步骤 4: 配置 GitHub Secrets

在 GitHub 仓库配置 **10 个 Secrets**：

**路径：** Repository → Settings → Secrets and variables → Actions

### Apple 相关（6个）

| Secret 名称 | 值 | 来源 |
|------------|-----|------|
| `APPLE_CERTIFICATE_BASE64` | Base64 编码的证书 | prepare-certificate.sh 输出 |
| `APPLE_CERTIFICATE_PASSWORD` | 证书密码 | 你在脚本中设置的**新密码** |
| `KEYCHAIN_PASSWORD` | Keychain 密码 | 任意强密码，如：`openssl rand -base64 32` |
| `APPLE_ID` | Apple ID 邮箱 | Weixi Ltd. 的 Apple ID |
| `APPLE_ID_PASSWORD` | App-Specific Password | 步骤 3 生成的密码 |
| `APPLE_TEAM_ID` | `85UKH2MY8J` | 从截图或脚本输出获取 |

### AWS 相关（4个）

| Secret 名称 | 值 | 说明 |
|------------|-----|------|
| `AWS_ACCESS_KEY_ID` | AWS Access Key | IAM 用户的访问密钥 |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key | IAM 用户的密钥 |
| `AWS_REGION` | 如：`us-west-2` | S3 bucket 所在区域 |
| `S3_BUCKET` | 如：`capybara-releases` | 存储 DMG 的 bucket |

---

## 步骤 5: 启用签名版本的工作流

### 5.1 更新 build-dmg.yml 的触发分支

```bash
cd /Users/samdychen/Documents/repos/kled
```

编辑 `.github/workflows/build-dmg.yml`，修改触发分支：

```yaml
on:
  push:
    branches:
      - main  # 改为你想要的分支，如 dev-sam
```

### 5.2 提交并推送

```bash
git add .github/workflows/build-dmg.yml
git commit -m "Enable signed build workflow"
git push origin dev-sam  # 或你的分支
```

---

## 步骤 6: 测试构建

### 方法 A: 推送代码触发

```bash
# 做一个小改动
echo "# Test signed build" >> test.txt
git add test.txt
git commit -m "Test signed build workflow"
git push origin dev-sam
```

### 方法 B: 手动触发（如果配置了）

在 GitHub Actions 页面手动触发工作流。

---

## 步骤 7: 监控构建

1. **访问 GitHub Actions**：
   ```
   https://github.com/trickleai/capybara/actions
   ```

2. **查看工作流运行**：
   - 点击最新的 "Build and Release Capybara DMG" 运行
   - 监控各个步骤

3. **关键步骤检查**：
   - ✅ Setup Apple Developer Certificate
   - ✅ Sign application
   - ✅ Notarize DMG
   - ✅ Upload to S3

4. **预计时间**：
   - 构建：~25 分钟
   - 公证：~5-10 分钟
   - 总计：~30-35 分钟

---

## 步骤 8: 验证结果

### 构建成功后：

1. **在 Actions Summary 中**：
   - ✅ 看到下载链接
   - ✅ 看到 Release Notes

2. **在 S3 中**：
   ```bash
   aws s3 ls s3://your-bucket/releases/latest/
   ```
   应该看到：`Capybara-latest-darwin-arm64.dmg`

3. **下载并测试 DMG**：
   - 下载 DMG
   - 双击打开
   - 拖动到 Applications
   - **直接打开**（不需要右键或系统设置批准！）

---

## 成功标志

✅ **签名和公证成功**的标志：

1. **GitHub Actions**：
   - 所有步骤都是绿色 ✓
   - Notarize DMG 步骤成功

2. **用户体验**：
   - DMG 可以直接打开
   - 应用可以直接启动
   - **没有 Gatekeeper 警告**

3. **验证命令**：
   ```bash
   # 验证签名
   codesign -dv /Applications/Capybara.app

   # 验证公证
   spctl -a -vvv -t install /Applications/Capybara.app
   ```

   应该看到：
   ```
   /Applications/Capybara.app: accepted
   source=Notarized Developer ID
   ```

---

## 对比：签名 vs 未签名

| 特性 | 未签名版本 | 签名+公证版本 |
|------|-----------|--------------|
| 需要证书 | ❌ 否 | ✅ 是 |
| 需要公证 | ❌ 否 | ✅ 是 |
| 构建时间 | ~25分钟 | ~35分钟 |
| 用户安装 | 需手动批准 | 直接打开 ✓ |
| Gatekeeper警告 | ⚠️ 有 | ❌ 无 |
| 适用场景 | 内部测试 | 公开分发 |

---

## 故障排除

### 问题 1: 证书安装后仍然找不到

**检查：**
```bash
security find-identity -v -p codesigning
```

**解决：**
- 确认导入到 `login` keychain
- 检查证书类型是否为 "Developer ID Application"
- 重启终端或电脑

### 问题 2: 签名步骤失败

**错误信息：** `No identity found`

**解决：**
- 检查 `APPLE_CERTIFICATE_BASE64` 是否正确
- 检查 `APPLE_CERTIFICATE_PASSWORD` 是否匹配
- 验证证书未过期

### 问题 3: 公证失败

**错误信息：** `Unable to notarize app`

**解决：**
- 确认使用 App-Specific Password（不是 Apple ID 密码）
- 检查 `APPLE_TEAM_ID` 是否正确
- 验证 Apple Developer 账号状态正常

### 问题 4: S3 上传失败

**错误信息：** `AccessDenied`

**解决：**
- 检查 AWS IAM 权限
- 验证 bucket 名称和 region
- 确认 AWS credentials 有效

---

## 安全建议

1. **删除本地 .p12 文件**：
   ```bash
   rm ~/Downloads/weixi-cert.p12
   ```
   安装后就不再需要了

2. **保护证书密码**：
   - 不要在代码中硬编码
   - 只存储在 GitHub Secrets 中
   - 定期更换密码

3. **定期检查证书有效期**：
   ```bash
   security find-certificate -c "Developer ID Application: Weixi Ltd." -p \
     | openssl x509 -noout -enddate
   ```

4. **监控 S3 访问**：
   - 启用 S3 访问日志
   - 监控下载量
   - 设置预算告警

---

## 下一步

✅ 证书安装并配置完成后：

1. 启用签名版本的工作流
2. 禁用或删除未签名版本的工作流
3. 更新文档说明用户可以直接安装
4. 设置证书到期提醒（5年后）

---

## 需要帮助？

如果遇到问题：
1. 查看 [CI-CD-SETUP.md](./CI-CD-SETUP.md) 详细文档
2. 检查 GitHub Actions 日志
3. 在项目 Issues 中提问

---

**祝配置顺利！** 🎉
