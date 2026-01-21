# 快速配置：使用 .p12 证书

> 适用于已经拿到 XU MING 分享的 `.p12` 证书文件的情况

## 🚀 快速步骤（10分钟）

### 1️⃣ 安装证书（1分钟）

```bash
# 双击 .p12 文件，或使用命令行
security import ~/Downloads/weixi-cert.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P "XU_MING给你的密码"

# 验证安装
security find-identity -v -p codesigning
```

**期望看到：**
```
1) ABC123... "Developer ID Application: Weixi Ltd. (85UKH2MY8J)"
```

✅ 看到这个就成功了！

---

### 2️⃣ 运行准备脚本（3分钟）

```bash
cd /Users/samdychen/Documents/repos/kled
bash scripts/prepare-certificate.sh
```

**按照提示操作：**

1. 看到证书列表后，输入完整名称：
   ```
   Developer ID Application: Weixi Ltd. (85UKH2MY8J)
   ```

2. 设置一个**新密码**（用于 GitHub Secrets）
   - 这个密码 ≠ XU MING 的密码
   - 建议使用密码管理器生成

3. 复制脚本输出的所有信息：
   - ✅ Base64 编码的证书
   - ✅ Team ID: `85UKH2MY8J`
   - ✅ 需要配置的所有 Secrets

---

### 3️⃣ 创建 Apple App-Specific Password（2分钟）

1. 访问：https://appleid.apple.com/account/manage
2. 登录 Weixi Ltd. 的 Apple ID
3. 生成新的 App-Specific Password
4. 命名：`GitHub Actions Capybara`
5. **复制密码**（格式：`xxxx-xxxx-xxxx-xxxx`）

---

### 4️⃣ 配置 GitHub Secrets（4分钟）

进入：**GitHub Repository → Settings → Secrets and variables → Actions**

点击 **"New repository secret"**，添加以下 10 个：

#### Apple 相关（6个）

```yaml
APPLE_CERTIFICATE_BASE64: [从脚本复制的 Base64 字符串]
APPLE_CERTIFICATE_PASSWORD: [你在脚本中设置的新密码]
KEYCHAIN_PASSWORD: [任意强密码，如：openssl rand -base64 32]
APPLE_ID: [Weixi Ltd. 的 Apple ID 邮箱]
APPLE_ID_PASSWORD: [步骤 3 生成的 App-Specific Password]
APPLE_TEAM_ID: 85UKH2MY8J
```

#### AWS 相关（4个）- 可选

```yaml
AWS_ACCESS_KEY_ID: [你的 AWS Access Key]
AWS_SECRET_ACCESS_KEY: [你的 AWS Secret Key]
AWS_REGION: [如：us-west-2]
S3_BUCKET: [如：capybara-releases]
```

**不需要 S3？** 跳过 AWS 相关的 Secrets，构建仍然会成功，只是不会上传到 S3。

---

### 5️⃣ 启用签名工作流（1分钟）

编辑 `.github/workflows/build-dmg.yml`：

```yaml
on:
  push:
    branches:
      - dev-sam  # 改成你要的分支
```

提交并推送：

```bash
git add .github/workflows/build-dmg.yml
git commit -m "Enable signed build workflow"
git push origin dev-sam
```

---

## ✅ 完成！

前往 GitHub Actions 查看构建：
```
https://github.com/trickleai/capybara/actions
```

**预计时间：** 30-35 分钟（包括公证）

---

## 🎯 验证成功

构建完成后，下载 DMG 并测试：

1. **双击 DMG** → 直接打开（无警告）
2. **拖到 Applications** → 无需批准
3. **打开应用** → 直接启动（无 Gatekeeper 警告）

**看到这些就说明签名和公证成功了！** 🎉

---

## 📋 检查清单

配置前确认：

- [ ] 已收到 `.p12` 文件
- [ ] 知道证书密码（XU MING 告诉你的）
- [ ] 有 Weixi Ltd. Apple ID 的访问权限
- [ ] 有 GitHub 仓库的 Admin 权限

配置后确认：

- [ ] `security find-identity` 能看到证书
- [ ] 已运行 `prepare-certificate.sh` 并复制输出
- [ ] 已创建 App-Specific Password
- [ ] 已在 GitHub 配置 10 个 Secrets（或 6 个，如不用 S3）
- [ ] 已启用签名工作流
- [ ] 已推送代码触发构建

---

## ⚠️ 重要提示

1. **立即删除本地 .p12 文件**
   ```bash
   rm ~/Downloads/weixi-cert.p12
   ```

2. **两个不同的密码**
   - XU MING 的密码：解锁 .p12（只用一次）
   - 你的新密码：GitHub Secrets（长期使用）

3. **App-Specific Password ≠ Apple ID 密码**
   - 必须生成专用密码
   - 格式：`xxxx-xxxx-xxxx-xxxx`

4. **证书有效期**
   - Developer ID 证书通常有效 5 年
   - 到期前需要重新创建

---

## 🆚 对比：签名 vs 未签名

| | 未签名 | 签名+公证 |
|---|---|---|
| 用户体验 | ⚠️ 需手动批准 | ✅ 直接打开 |
| 构建时间 | ~25分钟 | ~35分钟 |
| 需要证书 | ❌ | ✅ |
| 适用场景 | 内部测试 | 公开分发 |

---

## 🔗 相关文档

- 详细步骤：[INSTALL-P12-CERT.md](./INSTALL-P12-CERT.md)
- 完整配置：[CI-CD-SETUP.md](./CI-CD-SETUP.md)
- 故障排除：[CI-CD-SETUP.md#故障排除](./CI-CD-SETUP.md#故障排除)

---

**需要帮助？** 查看详细文档或在 Issues 中提问。
