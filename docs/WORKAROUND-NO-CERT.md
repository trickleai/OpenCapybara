# 临时方案：没有证书私钥时的配置

## 你的情况

从截图看到：
- **团队**: Weixi Ltd.
- **Team ID**: 85UKH2MY8J
- **证书**: 由 XU MING 创建
- **问题**: 你下载的证书没有私钥，无法用于代码签名

## 为什么下载证书后还是不能用？

从 Apple Developer 网站下载的 `.cer` 文件**只包含公钥**，不包含私钥。

**只有创建证书的人（XU MING）的 Mac 上有私钥。**

## 三个解决方案

### 方案 1: 使用未签名构建（推荐，立即可用）

我已经创建了一个不需要证书的工作流：`.github/workflows/build-dmg-unsigned.yml`

**优点：**
- ✅ 不需要任何证书
- ✅ 立即可以使用
- ✅ 仍然会上传到 S3
- ✅ 可以用于内部测试

**缺点：**
- ⚠️ 用户需要右键点击"打开"，或在系统设置中手动批准
- ⚠️ 未通过 Apple 公证

**使用方法：**

只需要配置 AWS Secrets（可选）：
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`

推送代码即可触发构建！

---

### 方案 2: 获取 XU MING 的私钥（需要协调）

联系 XU MING，请他：

1. **在他的 Mac 上运行：**
   ```bash
   security find-identity -v -p codesigning
   ```
   找到证书名称

2. **导出证书（包含私钥）：**
   ```bash
   # 方法 A: 使用命令行
   security export -k login.keychain \
     -t identities \
     -f pkcs12 \
     -P "设置一个密码" \
     -o ~/Desktop/weixi-cert.p12

   # 方法 B: 使用 Keychain Access 应用
   # 打开"钥匙串访问" → 找到证书 → 右键 → 导出 → 选择 .p12 格式
   ```

3. **安全地发送给你：**
   - 通过加密的方式发送 `.p12` 文件
   - 告诉你设置的密码

4. **你安装证书：**
   ```bash
   # 双击 .p12 文件，输入密码
   # 或使用命令行
   security import ~/Desktop/weixi-cert.p12 -k ~/Library/Keychains/login.keychain-db
   ```

5. **验证安装：**
   ```bash
   security find-identity -v -p codesigning
   ```

6. **运行准备脚本：**
   ```bash
   bash scripts/prepare-certificate.sh
   ```

---

### 方案 3: 创建你自己的证书（需要管理员权限）

如果你能联系上 Weixi Ltd. 的账号管理员：

1. **请管理员给你添加权限：**
   - 在 Apple Developer 网站
   - People → 找到你 → 设置为 Admin 角色

2. **创建你自己的证书：**
   - 按照 [GET-CERTIFICATE.md](./GET-CERTIFICATE.md) 的步骤
   - 创建时会在**你的 Mac**上生成私钥
   - 证书名称会是：`Developer ID Application: Weixi Ltd. (85UKH2MY8J)`

3. **完成配置：**
   - 运行 `bash scripts/prepare-certificate.sh`

---

## 快速开始（方案 1 - 无需证书）

### 1. 删除需要证书的工作流

```bash
cd /Users/samdychen/Documents/repos/kled
rm .github/workflows/build-dmg.yml
```

### 2. 重命名未签名工作流

```bash
mv .github/workflows/build-dmg-unsigned.yml .github/workflows/build-dmg.yml
```

### 3. 配置 AWS Secrets（可选）

如果要上传到 S3，在 GitHub 配置 4 个 Secrets：
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`

### 4. 推送代码

```bash
git add .
git commit -m "Use unsigned build workflow"
git push origin main
```

完成！GitHub Actions 会自动构建并生成未签名的 DMG。

---

## 两种工作流对比

| 特性 | 签名版本 | 未签名版本 |
|------|---------|-----------|
| 需要证书私钥 | ✅ 是 | ❌ 否 |
| Apple 公证 | ✅ 是 | ❌ 否 |
| 用户体验 | 直接打开 | 需手动批准 |
| 构建时间 | ~30 分钟 | ~25 分钟 |
| 适用场景 | 公开分发 | 内部测试 |

---

## 手动配置证书信息（如果你有信息）

如果你知道完整的证书名称，可以手动配置 GitHub Secrets：

**基于你的截图，证书名称可能是：**
```
Developer ID Application: Weixi Ltd. (85UKH2MY8J)
```

但是！**没有私钥，这些信息也无法用于签名。**

---

## 总结

**立即可用的方案：** 使用方案 1（未签名构建）

**长期方案：**
1. 联系 XU MING 获取私钥（方案 2）
2. 或申请管理员权限创建自己的证书（方案 3）

**我的建议：**
- 先用方案 1 让 CI/CD 跑起来
- 同时联系 XU MING 或管理员获取证书访问权限
- 等有了私钥后，切换到签名版本的工作流

---

## 需要帮助？

如果选择方案 1（未签名构建），我可以帮你：
1. 配置 AWS S3
2. 测试工作流
3. 验证构建产物

如果选择方案 2 或 3，参考：
- [GET-CERTIFICATE.md](./GET-CERTIFICATE.md)
- [CI-CD-SETUP.md](./CI-CD-SETUP.md)
