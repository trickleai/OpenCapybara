# 如何获取 Apple Developer ID Application 证书

## 检查是否已有证书

首先在终端运行：

```bash
security find-identity -v -p codesigning
```

**如果看到：**
```
1) ABC123... "Developer ID Application: Your Name (TEAM_ID)"
```
说明你已经有证书了，可以直接运行 `bash scripts/prepare-certificate.sh`。

**如果看到：**
```
0 valid identities found
```
说明你需要创建新证书，请按照下面的步骤操作。

---

## 步骤 1: 登录 Apple Developer

1. 访问：https://developer.apple.com/account
2. 使用你的 Apple ID 登录
3. 确认你已加入 Apple Developer Program（$99/年）

---

## 步骤 2: 创建证书

### 2.1 进入证书管理页面

1. 登录后，点击左侧菜单 **"Certificates, Identifiers & Profiles"**
2. 点击 **"Certificates"**
3. 点击右上角的 **"+"** 按钮（创建新证书）

### 2.2 选择证书类型

在 "Create a New Certificate" 页面：

1. 选择 **"Software"** 部分下的：
   ```
   ☑ Developer ID Application
   ```

   **重要：** 不要选择其他类型！
   - ❌ Apple Development
   - ❌ Apple Distribution
   - ❌ Mac App Distribution
   - ✅ Developer ID Application （就是这个！）

2. 点击 **"Continue"**

### 2.3 创建 CSR (Certificate Signing Request)

**在你的 Mac 上操作：**

1. 打开 **"钥匙串访问"** 应用（Keychain Access）
   - 路径：应用程序 → 实用工具 → 钥匙串访问

2. 在菜单栏选择：
   ```
   钥匙串访问 → 证书助理 → 从证书颁发机构请求证书...
   ```

3. 填写信息：
   - **用户电子邮件地址**：你的 Apple ID 邮箱
   - **常用名称**：你的名字（例如：Sam Chen）
   - **CA 电子邮件地址**：留空
   - 选择：**"存储到磁盘"**
   - 勾选：**"让我指定密钥对信息"**（可选，推荐默认）

4. 点击 **"继续"**，保存 CSR 文件到桌面
   - 文件名通常是：`CertificateSigningRequest.certSigningRequest`

### 2.4 上传 CSR 并下载证书

**返回浏览器（Apple Developer 网站）：**

1. 上传刚才保存的 CSR 文件
2. 点击 **"Continue"**
3. 点击 **"Download"** 下载证书
   - 文件名类似：`developerID_application.cer`

---

## 步骤 3: 安装证书

1. 双击下载的 `.cer` 文件
2. 证书会自动安装到 **"钥匙串访问"** 应用的 **"登录"** 钥匙串中

3. 验证安装：
   ```bash
   security find-identity -v -p codesigning
   ```

   应该看到：
   ```
   1) ABC123DEF456... "Developer ID Application: Your Name (TEAM_ID)"
        1 valid identities found
   ```

---

## 步骤 4: 运行准备脚本

现在证书已安装，可以运行：

```bash
cd /Users/samdychen/Documents/repos/kled
bash scripts/prepare-certificate.sh
```

**当脚本询问证书名称时：**

复制粘贴你在上一步看到的完整证书名称，例如：
```
Developer ID Application: Sam Chen (ABC123XYZ)
```

---

## 常见问题

### Q1: 我已经有 Apple Developer 账号，但找不到创建证书的选项？

**A:** 检查：
1. 你的账号已经完成支付（$99/年）
2. 账号类型是 "Individual" 或 "Organization"（不是 "Company" pending）
3. 你是账号持有者（不是受邀成员）

### Q2: 我看到多个证书类型，选哪个？

**A:** 必须选择 **"Developer ID Application"**，位置在：
```
Software
  └── Developer ID Application  ← 选这个
```

不是：
- Apple Development（用于开发测试）
- Apple Distribution（用于 App Store）
- Mac App Distribution（用于 Mac App Store）

### Q3: 证书安装后，运行命令仍然显示 "0 valid identities found"？

**A:** 可能的原因：
1. 证书安装到了错误的 keychain（应该在 "login" keychain）
2. 私钥缺失（创建 CSR 时选错了 Mac）

**解决方法：**
```bash
# 检查所有 keychain 中的证书
security find-identity -v -p codesigning -a

# 如果找到证书但在其他 keychain，导入到 login keychain
```

### Q4: 我能使用已有的证书吗？

**A:** 可以！如果你之前已经为其他项目创建过 Developer ID Application 证书，可以重复使用同一个证书。

### Q5: 证书有效期多长？

**A:** Developer ID 证书有效期通常为 **5 年**。到期前需要创建新证书并更新 GitHub Secrets。

### Q6: 我是团队成员，不是账号持有者，能创建证书吗？

**A:** 需要账号持有者：
1. 在 Apple Developer 网站创建证书
2. 导出证书（包含私钥）为 .p12 文件
3. 安全地分享给你
4. 你双击安装 .p12 文件

---

## 验证清单

完成所有步骤后，验证：

- [ ] 运行 `security find-identity -v -p codesigning` 能看到证书
- [ ] 证书名称包含 "Developer ID Application"
- [ ] 证书名称后面有你的 Team ID（括号内）
- [ ] 证书有效期未过期（通常 5 年）

如果以上都正确，你可以继续运行 `bash scripts/prepare-certificate.sh`！

---

## 相关资源

- [Apple Developer Account](https://developer.apple.com/account)
- [Creating Certificates](https://developer.apple.com/help/account/create-certificates/create-developer-id-certificates)
- [Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)

---

## 需要帮助？

如果按照上述步骤仍然遇到问题：
1. 截图当前的错误信息
2. 运行 `security find-identity -v -p codesigning` 并复制输出
3. 在项目 Issues 中创建问题
