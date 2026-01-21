# Capybara CI/CD 快速开始

> 5 分钟配置自动构建和分发

## 准备工作清单

- [ ] Apple Developer 账号（$99/年）
- [ ] Developer ID Application 证书 → [如何获取？](./GET-CERTIFICATE.md)
- [ ] AWS 账号和 S3 bucket
- [ ] GitHub 仓库管理员权限

> **没有证书？** 查看 [证书获取指南](./GET-CERTIFICATE.md) 了解如何创建。

## 快速配置（3 步）

### 1️⃣ 导出证书（在你的 Mac 上）

```bash
cd /path/to/capybara
bash scripts/prepare-certificate.sh
```

按照脚本提示操作，复制所有输出的值。

### 2️⃣ 创建 Apple App-Specific Password

1. 访问：https://appleid.apple.com/account/manage
2. 生成 App 专用密码
3. 命名为：`GitHub Actions Capybara`
4. 复制生成的密码（格式：`xxxx-xxxx-xxxx-xxxx`）

### 3️⃣ 配置 GitHub Secrets

进入：**GitHub Repository → Settings → Secrets and variables → Actions**

添加以下 10 个 secrets：

#### Apple 相关（6个）
```
APPLE_CERTIFICATE_BASE64     # 从脚本输出复制
APPLE_CERTIFICATE_PASSWORD   # 脚本中设置的密码
KEYCHAIN_PASSWORD           # 任意强密码
APPLE_ID                    # 你的 Apple ID 邮箱
APPLE_ID_PASSWORD          # Step 2 创建的专用密码
APPLE_TEAM_ID              # 从脚本输出复制
```

#### AWS 相关（4个）
```
AWS_ACCESS_KEY_ID          # AWS IAM Access Key ID
AWS_SECRET_ACCESS_KEY      # AWS IAM Secret Key
AWS_REGION                 # 如：us-west-2
S3_BUCKET                  # 如：capybara-releases
```

## 测试

推送代码到 main 分支：

```bash
git add .
git commit -m "Setup CI/CD"
git push origin main
```

查看构建：**GitHub → Actions 标签页**

## 成功标志

✅ 工作流完成后，你会看到：
- Actions 页面显示绿色 ✓
- Summary 中有下载链接
- S3 bucket 中有 DMG 文件

## 需要帮助？

查看完整文档：[CI-CD-SETUP.md](./CI-CD-SETUP.md)

## 常见问题

**Q: 证书找不到？**
A: 确保选择 "Developer ID Application" 证书（不是 "Apple Development"）

**Q: 公证失败？**
A: 确认使用 App-Specific Password，不是 Apple ID 密码

**Q: S3 上传失败？**
A: 检查 IAM 权限，确保有 `s3:PutObject` 权限

**Q: 构建时间太长？**
A: 正常！首次构建约 20-30 分钟，后续有缓存会更快

---

**配置完成后**，每次推送到 main 或合并 PR，都会自动构建并上传到 S3！🎉
