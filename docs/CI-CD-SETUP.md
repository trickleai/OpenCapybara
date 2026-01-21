# Capybara CI/CD 配置指南

本文档说明如何配置 GitHub Actions 来自动构建和分发 Capybara DMG。

## 概述

当代码推送到 `main` 分支或 PR 合并时，GitHub Actions 会自动：
1. 构建 macOS ARM64 应用
2. 使用你的 Apple Developer 证书签名
3. 通过 Apple 公证 (Notarization)
4. 上传到 AWS S3
5. 生成下载链接

## 前置要求

### 1. Apple Developer 账号

- 已加入 [Apple Developer Program](https://developer.apple.com/programs/) ($99/年)
- 拥有有效的 **Developer ID Application** 证书

### 2. AWS 账号

- 有权限访问 S3 的 AWS 账号
- 已创建用于存储 DMG 的 S3 bucket

## 配置步骤

### Step 1: 导出 Apple Developer 证书

在你的 Mac 上运行准备脚本：

```bash
cd /path/to/capybara
bash scripts/prepare-certificate.sh
```

这个脚本会：
1. 列出你的可用证书
2. 导出选中的证书为 .p12 文件
3. 转换为 Base64 编码
4. 显示所有需要的 GitHub Secrets

**重要提示：**
- 选择名称包含 "Developer ID Application" 的证书
- 记住你设置的证书密码
- 脚本完成后删除桌面上的 certificate.p12 文件

### Step 2: 创建 Apple ID App-Specific Password

公证需要 App-Specific Password（不是你的 Apple ID 密码）。

1. 访问 https://appleid.apple.com/account/manage
2. 登录你的 Apple ID
3. 在 **"登录和安全性"** 部分，找到 **"App 专用密码"**
4. 点击 **"+"** 生成新密码
5. 给密码命名（例如：`GitHub Actions Capybara`）
6. **复制生成的密码**（格式类似 `abcd-efgh-ijkl-mnop`）

### Step 3: 配置 AWS S3

#### 创建 S3 Bucket

```bash
# 创建 bucket（替换 region 和 bucket 名称）
aws s3 mb s3://capybara-releases --region us-west-2

# 配置 bucket（可选，如果需要公开访问）
aws s3api put-bucket-policy --bucket capybara-releases --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::capybara-releases/releases/*"
  }]
}'
```

#### 创建 IAM 用户（推荐）

为 CI/CD 创建专用的 IAM 用户：

1. 登录 AWS Console
2. 进入 IAM → Users → Create user
3. 用户名：`github-actions-capybara`
4. 直接附加策略：
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:PutObjectAcl",
           "s3:GetObject"
         ],
         "Resource": "arn:aws:s3:::capybara-releases/*"
       }
     ]
   }
   ```
5. 创建访问密钥（Access Key），保存 **Access Key ID** 和 **Secret Access Key**

### Step 4: 配置 GitHub Secrets

在 GitHub 仓库中配置以下 Secrets：

**路径：** Repository → Settings → Secrets and variables → Actions → New repository secret

#### Apple 相关 (5个)

| Secret 名称 | 说明 | 如何获取 |
|------------|------|---------|
| `APPLE_CERTIFICATE_BASE64` | Base64 编码的证书 | 运行 `prepare-certificate.sh` 获取 |
| `APPLE_CERTIFICATE_PASSWORD` | 证书导出密码 | 运行脚本时你设置的密码 |
| `KEYCHAIN_PASSWORD` | CI 临时 keychain 密码 | 任意安全随机密码，如 `openssl rand -base64 32` |
| `APPLE_ID` | Apple ID 邮箱 | 你的 Apple Developer 账号邮箱 |
| `APPLE_ID_PASSWORD` | App-Specific Password | Step 2 中创建的专用密码 |
| `APPLE_TEAM_ID` | Team ID | 在 [developer.apple.com](https://developer.apple.com/account) 的 Membership 页面查看，或脚本会自动显示 |

#### AWS 相关 (4个)

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `AWS_ACCESS_KEY_ID` | AWS 访问密钥 ID | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS 访问密钥 | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | S3 bucket 所在区域 | `us-west-2` |
| `S3_BUCKET` | S3 bucket 名称 | `capybara-releases` |

### Step 5: 测试工作流

1. **推送到 main 分支：**
   ```bash
   git add .
   git commit -m "Setup CI/CD"
   git push origin main
   ```

2. **查看构建进度：**
   - 进入 GitHub → Actions 标签页
   - 点击最新的工作流运行
   - 监控各个步骤的执行

3. **验证结果：**
   - 构建成功后，在 Actions 页面的 Summary 中可以看到下载链接
   - 检查 S3 bucket 中是否有上传的文件：
     ```bash
     aws s3 ls s3://capybara-releases/releases/ --recursive
     ```

## 工作流详情

### 触发条件

- `push` 到 `main` 分支
- `pull_request` 合并到 `main` 分支

### 构建步骤

1. **环境准备**
   - Checkout 代码
   - 设置 Node.js 22.21.1
   - 安装依赖

2. **证书配置**
   - 创建临时 keychain
   - 导入 Apple Developer 证书
   - 配置代码签名权限

3. **构建应用**
   - 编译 TypeScript 源码
   - 下载 Electron
   - 打包 macOS ARM64 应用

4. **签名和公证**
   - 使用 Developer ID 签名应用
   - 创建 DMG
   - 提交到 Apple 公证服务
   - 装订公证票据

5. **上传分发**
   - 上传到 S3（两个位置）:
     - `releases/{version}/Capybara-{version}-{commit}-darwin-arm64.dmg`
     - `releases/latest/Capybara-latest-darwin-arm64.dmg`
   - 生成预签名下载链接（7天有效）
   - 保存为 GitHub Artifact（30天）

### 输出产物

构建完成后：

1. **S3 位置：**
   - 版本化：`s3://your-bucket/releases/1.0.0/Capybara-1.0.0-abc1234-darwin-arm64.dmg`
   - 最新版：`s3://your-bucket/releases/latest/Capybara-latest-darwin-arm64.dmg`

2. **GitHub Artifacts：**
   - 在 Actions 页面下载（30天内有效）

3. **下载链接：**
   - 在工作流 Summary 中查看预签名 URL

## S3 文件组织结构

```
s3://capybara-releases/
└── releases/
    ├── 1.0.0/
    │   └── Capybara-1.0.0-abc1234-darwin-arm64.dmg
    ├── 1.0.1/
    │   └── Capybara-1.0.1-def5678-darwin-arm64.dmg
    └── latest/
        └── Capybara-latest-darwin-arm64.dmg  (始终指向最新版本)
```

## 故障排除

### 证书相关问题

**问题：** `security: SecKeychainItemImport: MAC verification failed`

**解决：**
- 确认 `APPLE_CERTIFICATE_PASSWORD` 正确
- 重新导出证书并更新 Base64 编码

**问题：** `No identity found`

**解决：**
- 确认证书类型为 "Developer ID Application"（不是 "Apple Development"）
- 检查证书是否过期

### 公证相关问题

**问题：** `Error: Unable to notarize app`

**解决：**
- 确认 `APPLE_ID_PASSWORD` 使用的是 App-Specific Password
- 检查 `APPLE_TEAM_ID` 是否正确
- 确认 Apple Developer 账号状态正常

**问题：** `InvalidRequestError: The request is invalid`

**解决：**
- 确认应用已经正确签名（runtime hardened）
- 检查 entitlements.plist 配置

### S3 上传问题

**问题：** `AccessDenied: User is not authorized`

**解决：**
- 检查 IAM 用户权限
- 确认 bucket 名称和 region 正确
- 验证 AWS credentials 没有过期

## 安全最佳实践

1. **定期轮换密钥**
   - 每 90 天更换一次 AWS Access Key
   - 定期更新 Apple ID App-Specific Password

2. **最小权限原则**
   - IAM 用户只授予必要的 S3 权限
   - 不要使用 root AWS 账号的密钥

3. **监控和日志**
   - 启用 S3 访问日志
   - 监控 GitHub Actions 使用情况

4. **证书保护**
   - 证书密码使用强密码
   - 导出后立即删除本地 .p12 文件
   - 不要在代码中硬编码任何密钥

## 参考资源

- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Electron Builder Code Signing](https://www.electron.build/code-signing)

## 获取帮助

如果遇到问题：
1. 查看 GitHub Actions 日志详细信息
2. 检查上述故障排除章节
3. 在项目 Issues 中创建新问题
