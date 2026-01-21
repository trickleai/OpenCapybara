# Capybara CI/CD 配置检查清单

使用此清单确保所有必要的配置都已完成。

## 📋 配置前检查

### Apple Developer 账号
- [ ] 已加入 Apple Developer Program ($99/年)
- [ ] 账号状态正常（没有过期或被暂停）
- [ ] 可以访问 [developer.apple.com](https://developer.apple.com)

### 证书检查
- [ ] 已在 Keychain 中安装 Developer ID Application 证书
- [ ] 证书未过期（检查有效期）
- [ ] 证书可用于代码签名

运行以下命令验证：
```bash
security find-identity -v -p codesigning
```

应该看到类似：
```
1) ABC123... "Developer ID Application: Your Name (TEAM_ID)"
```

### AWS 账号
- [ ] 有有效的 AWS 账号
- [ ] 已创建 S3 bucket（或有权限创建）
- [ ] 已创建 IAM 用户（或有权限创建）

### GitHub 权限
- [ ] 对仓库有 Admin 或 Maintainer 权限
- [ ] 可以访问 Repository Settings

## 🔧 执行配置步骤

### Step 1: 导出证书
- [ ] 运行 `bash scripts/prepare-certificate.sh`
- [ ] 选择正确的 Developer ID Application 证书
- [ ] 设置证书密码并记录
- [ ] 复制输出的 Base64 编码证书
- [ ] 复制输出的 Team ID
- [ ] 删除桌面上的 certificate.p12 文件

### Step 2: Apple ID 配置
- [ ] 访问 https://appleid.apple.com/account/manage
- [ ] 生成 App-Specific Password
- [ ] 命名为 "GitHub Actions Capybara"
- [ ] 复制生成的密码（格式：xxxx-xxxx-xxxx-xxxx）
- [ ] 保存密码到安全的地方

### Step 3: AWS 配置
- [ ] 创建或选择 S3 bucket
- [ ] 记录 bucket 名称
- [ ] 记录 bucket 所在 region
- [ ] 创建 IAM 用户（名称建议：github-actions-capybara）
- [ ] 为 IAM 用户添加 S3 权限策略
- [ ] 创建 Access Key
- [ ] 保存 Access Key ID 和 Secret Access Key

### Step 4: GitHub Secrets 配置
- [ ] 进入 Repository → Settings → Secrets and variables → Actions
- [ ] 添加 `APPLE_CERTIFICATE_BASE64`
- [ ] 添加 `APPLE_CERTIFICATE_PASSWORD`
- [ ] 添加 `KEYCHAIN_PASSWORD`（生成随机密码）
- [ ] 添加 `APPLE_ID`
- [ ] 添加 `APPLE_ID_PASSWORD`
- [ ] 添加 `APPLE_TEAM_ID`
- [ ] 添加 `AWS_ACCESS_KEY_ID`
- [ ] 添加 `AWS_SECRET_ACCESS_KEY`
- [ ] 添加 `AWS_REGION`
- [ ] 添加 `S3_BUCKET`

验证 Secrets 数量：
```
应该有 10 个 Secrets ✓
```

## 🧪 测试配置

### Step 5: 触发构建
- [ ] 创建测试分支
- [ ] 做一个小改动（如更新 README）
- [ ] Commit 并 push 到 main 或创建 PR

```bash
git checkout -b test-ci
echo "# Test CI" >> test.txt
git add test.txt
git commit -m "Test CI/CD pipeline"
git push origin test-ci
```

### Step 6: 监控构建
- [ ] 进入 GitHub → Actions 标签页
- [ ] 找到最新的 workflow run
- [ ] 点击进入查看详细日志
- [ ] 确认所有步骤都成功（绿色 ✓）

预期构建时间：**20-30 分钟**

### Step 7: 验证产物
- [ ] 构建成功后，在 Actions Summary 中看到下载链接
- [ ] 在 S3 bucket 中验证文件存在
- [ ] 下载并测试 DMG 文件
- [ ] DMG 可以正常打开，无 Gatekeeper 警告

验证 S3 文件：
```bash
aws s3 ls s3://your-bucket/releases/ --recursive
```

应该看到：
```
releases/x.x.x/Capybara-x.x.x-xxxxxxx-darwin-arm64.dmg
releases/latest/Capybara-latest-darwin-arm64.dmg
```

## ✅ 验证成功标志

全部完成后，你应该看到：

1. **GitHub Actions**
   - ✅ Workflow run 显示绿色勾号
   - ✅ Summary 中有下载链接
   - ✅ 构建时间在 20-30 分钟
   - ✅ 所有步骤都成功

2. **AWS S3**
   - ✅ 在 `releases/{version}/` 中有版本化 DMG
   - ✅ 在 `releases/latest/` 中有最新版 DMG
   - ✅ 文件大小约 140-150 MB

3. **DMG 测试**
   - ✅ DMG 可以下载
   - ✅ DMG 可以打开
   - ✅ 应用可以拖到 Applications
   - ✅ 应用可以直接打开（无需"仍要打开"）
   - ✅ 应用显示正确的 Capybara 界面

## 🔍 故障排除

如果某个步骤失败，参考：

| 失败步骤 | 检查项 | 文档 |
|---------|--------|------|
| Setup Certificate | 证书密码、Base64 编码 | [CI-CD-SETUP.md](./CI-CD-SETUP.md#证书相关问题) |
| Sign application | 证书类型、权限 | [CI-CD-SETUP.md](./CI-CD-SETUP.md#证书相关问题) |
| Notarize DMG | Apple ID Password、Team ID | [CI-CD-SETUP.md](./CI-CD-SETUP.md#公证相关问题) |
| Upload to S3 | AWS 权限、bucket 名称 | [CI-CD-SETUP.md](./CI-CD-SETUP.md#s3-上传问题) |

## 📝 完成后

- [ ] 删除本地的 certificate.p12 文件
- [ ] 在安全的地方记录所有密码
- [ ] 设置日历提醒：90 天后轮换 AWS keys
- [ ] 设置日历提醒：证书到期前 30 天更新
- [ ] 通知团队成员 CI/CD 已配置完成

## 🎉 恭喜！

你的 Capybara 项目现在拥有完整的自动化构建和分发流程！

每次推送到 `main` 或合并 PR 时，都会：
1. 自动构建 macOS 应用
2. 签名和公证
3. 上传到 S3
4. 生成下载链接

---

有问题？查看 [CI-CD-SETUP.md](./CI-CD-SETUP.md) 获取详细帮助。
