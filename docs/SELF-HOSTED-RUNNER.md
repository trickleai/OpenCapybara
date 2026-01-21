# Self-hosted GitHub Actions Runner 设置指南

> 使用自托管 Runner 可以大幅降低 macOS 构建成本

## 成本对比

| 方案 | 成本 | 说明 |
|------|------|------|
| GitHub-hosted macOS | $0.16/分钟 | 约 $6/次构建 (40分钟) |
| AWS EC2 mac2.metal | $1.10/小时 | $26.4/天 (24小时最低承诺) |
| 本地 Mac Mini | 一次性硬件成本 | 适合长期使用 |

**结论**: 如果每天构建 >5 次，使用 self-hosted runner 更划算

---

## 选项 1: AWS EC2 Mac 实例

### 前置要求
- AWS 账号
- 熟悉 AWS EC2
- 预算约 $800/月 (24/7 运行)

### 步骤 1: 启动 EC2 Mac 实例

```bash
# 使用 AWS CLI 启动实例
aws ec2 run-instances \
  --image-id ami-0xyz123 \  # macOS Sonoma ARM64 AMI
  --instance-type mac2-m2.metal \
  --key-name your-key-pair \
  --security-group-ids sg-xyz123 \
  --subnet-id subnet-xyz123 \
  --dedicated-host-id h-xyz123  # 需要预先分配 Dedicated Host
```

或在 AWS Console 中手动创建：
1. EC2 → Launch Instance
2. 选择 macOS AMI
3. 实例类型: `mac2-m2.metal` (M2 芯片)
4. 配置网络和存储
5. 启动实例

**注意**: 
- AWS Mac 实例需要 **Dedicated Host**
- 最少租用时间: **24 小时**
- 释放后需等待 24 小时才能释放 Host

### 步骤 2: 连接到实例

```bash
# SSH 连接
ssh -i your-key.pem ec2-user@<instance-public-ip>
```

---

## 选项 2: 本地 Mac Mini

### 硬件推荐
- **Mac Mini M2** (2023+)
  - 16GB RAM 起步
  - 512GB SSD 起步
  - 成本: ~$600-800

- **Mac Studio M2** (如果需要更高性能)
  - 32GB RAM
  - 1TB SSD
  - 成本: ~$2000

### 网络要求
- 稳定的互联网连接
- 公网 IP（可选，用于远程访问）
- 确保 GitHub.com 可访问

---

## 设置 Self-hosted Runner

### 步骤 1: 安装 Xcode Command Line Tools

```bash
xcode-select --install
```

### 步骤 2: 安装 Node.js

```bash
# 使用 Homebrew
brew install node@22

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.zshrc
nvm install 22.21.1
nvm use 22.21.1
```

### 步骤 3: 安装必要工具

```bash
# 安装 Homebrew (如果还没有)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装构建工具
brew install git
brew install create-dmg
brew install jq
```

### 步骤 4: 在 GitHub 注册 Runner

1. 进入你的 GitHub 仓库
2. **Settings** → **Actions** → **Runners**
3. 点击 **New self-hosted runner**
4. 选择 **macOS** 和 **ARM64**
5. 按照页面指令操作

### 步骤 5: 下载并配置 Runner

```bash
# 创建工作目录
mkdir ~/actions-runner && cd ~/actions-runner

# 下载 runner (ARM64 版本)
curl -o actions-runner-osx-arm64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-osx-arm64-2.311.0.tar.gz

# 验证 hash (可选)
echo "e813d9ffb33bd7f999c24c3363aa41976a5b50a68e8e7d9dd019f9c2c24c0a8b  actions-runner-osx-arm64-2.311.0.tar.gz" | shasum -a 256 -c

# 解压
tar xzf ./actions-runner-osx-arm64-2.311.0.tar.gz

# 配置 runner
# 替换 YOUR_TOKEN 为 GitHub 页面提供的 token
./config.sh \
  --url https://github.com/trickleai/capybara \
  --token YOUR_TOKEN \
  --labels self-hosted,macOS,ARM64 \
  --name capybara-builder-1 \
  --work _work
```

### 步骤 6: 安装为服务（自动启动）

```bash
# 安装服务
sudo ./svc.sh install

# 启动服务
sudo ./svc.sh start

# 检查状态
sudo ./svc.sh status

# 查看日志
tail -f ~/actions-runner/_diag/*.log
```

---

## 配置 Workflow 使用 Self-hosted Runner

修改 `.github/workflows/build-dmg.yml`:

```yaml
jobs:
  build:
    runs-on: [self-hosted, macOS, ARM64]  # 使用标签匹配
```

或使用单独的 workflow 文件（推荐）:
- `build-dmg.yml` - 使用 GitHub-hosted (用于 PR 快速验证)
- `build-dmg-selfhosted.yml` - 使用 self-hosted (用于正式发布)

---

## 维护和监控

### 检查 Runner 状态

```bash
# 查看 runner 进程
ps aux | grep Runner.Listener

# 查看日志
tail -f ~/actions-runner/_diag/*.log
```

### 更新 Runner

```bash
cd ~/actions-runner

# 停止服务
sudo ./svc.sh stop

# 下载新版本
curl -o actions-runner-osx-arm64-2.312.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.312.0/actions-runner-osx-arm64-2.312.0.tar.gz

# 解压覆盖
tar xzf ./actions-runner-osx-arm64-2.312.0.tar.gz

# 重启服务
sudo ./svc.sh start
```

### 清理磁盘空间

Self-hosted runner 会积累构建缓存，定期清理：

```bash
# 清理旧的构建目录
cd ~/actions-runner/_work
find . -type d -name "capybara" -mtime +7 -exec rm -rf {} +

# 清理 npm 缓存
npm cache clean --force

# 清理 Homebrew
brew cleanup
```

---

## 安全建议

1. **限制网络访问**
   - 只允许 GitHub Actions IPs 访问
   - 使用防火墙规则

2. **使用专用用户**
   ```bash
   # 创建专用用户
   sudo dscl . -create /Users/actions-runner
   sudo dscl . -create /Users/actions-runner UserShell /bin/bash
   ```

3. **定期更新系统**
   ```bash
   # 更新 macOS
   softwareupdate -ia
   
   # 更新 Homebrew packages
   brew update && brew upgrade
   ```

4. **监控资源使用**
   - 使用 CloudWatch (如果在 AWS)
   - 设置磁盘空间告警
   - 监控 CPU/内存使用

---

## 故障排除

### Runner 无法启动

```bash
# 检查权限
ls -la ~/actions-runner

# 检查配置
cat ~/actions-runner/.runner

# 重新配置
./config.sh remove
./config.sh --url ... --token ...
```

### 构建失败：找不到工具

```bash
# 确保所有工具都在 PATH 中
echo $PATH

# 添加到 runner 的环境
echo 'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"' >> ~/.zshrc
```

### 磁盘空间不足

```bash
# 检查磁盘使用
df -h

# 清理构建缓存
rm -rf ~/actions-runner/_work/capybara/capybara/.build
rm -rf ~/actions-runner/_work/capybara/capybara/node_modules
```

---

## 成本优化技巧

### 1. 按需启动/停止 (AWS)

创建 Lambda 函数自动管理 EC2 实例：

```python
# Lambda 函数：在工作时间自动启动实例
import boto3

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    
    # 工作日 8:00-20:00 运行
    # 周末关闭
    
    # 启动实例
    ec2.start_instances(InstanceIds=['i-xyz123'])
```

### 2. 使用构建缓存

在 workflow 中添加缓存：

```yaml
- name: Cache dependencies
  uses: actions/cache@v3
  with:
    path: |
      node_modules
      ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

### 3. 并行构建

如果有多个构建任务，使用矩阵策略：

```yaml
strategy:
  matrix:
    config: [debug, release]
runs-on: [self-hosted, macOS, ARM64]
```

---

## 下一步

设置完成后：

1. ✅ 测试 self-hosted workflow
2. ✅ 对比构建时间和成本
3. ✅ 根据需求调整
4. ✅ 设置监控和告警

---

## 参考资源

- [GitHub Actions Self-hosted Runners](https://docs.github.com/en/actions/hosting-your-own-runners)
- [AWS EC2 Mac Instances](https://aws.amazon.com/ec2/instance-types/mac/)
- [MacStadium](https://www.macstadium.com/)
