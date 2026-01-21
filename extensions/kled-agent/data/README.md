# Kled Agent 插件概述

## 📦 插件简介

**Kled Agent** 是一个用于追踪和管理 Claude Code 会话的 VS Code 扩展。它提供了一个可视化的仪表板，让用户可以查看所有活跃的 Claude 对话会话，并快速在它们之间切换。

---

## 🏗️ VS Code 扩展开发基础

### 1. **扩展的入口文件：`package.json`**

这是扩展的"身份证"，定义了扩展的所有元数据和功能：

```json
{
  "name": "kled-agent",              // 扩展唯一标识
  "displayName": "Kled Session Dashboard",  // 显示名称
  "main": "./out/extension.js",      // 入口文件
  "activationEvents": [              // 何时激活扩展
    "onStartupFinished"              // VS Code 启动完成后激活
  ],
  "contributes": {                   // 扩展贡献的功能
    "commands": [...],               // 注册命令
    "views": [...],                  // 注册视图
    "keybindings": [...]             // 注册快捷键
  }
}
```

**关键概念：**
- **`activationEvents`**: 定义扩展何时被激活（加载）
  - `onStartupFinished`: VS Code 启动后激活
  - `onCommand:xxx`: 执行某命令时激活
  - `onLanguage:python`: 打开 Python 文件时激活

- **`contributes`**: 扩展向 VS Code 贡献的功能
  - **commands**: 可执行的命令（如 "New Claude Chat"）
  - **views**: 自定义视图面板
  - **keybindings**: 快捷键绑定
  - **viewsContainers**: 侧边栏容器

---

### 2. **扩展的生命周期：`extension.ts`**

这是扩展的主入口文件，包含两个核心函数：

```typescript
// 扩展激活时调用
export function activate(context: vscode.ExtensionContext) {
    // 1. 初始化核心服务
    const sessionTracker = new ClaudeSessionTracker();

    // 2. 注册视图提供者
    const dashboardProvider = new SessionDashboardProvider(...);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'kled.agentDashboard',
            dashboardProvider
        )
    );

    // 3. 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('kled.agent.newTask', () => {
            // 命令逻辑
        })
    );
}

// 扩展停用时调用
export function deactivate() {
    // 清理资源
}
```

**关键概念：**
- **`context.subscriptions`**: 所有需要在扩展停用时清理的资源都要添加到这里
- **`vscode.commands.registerCommand`**: 注册命令处理器
- **`vscode.window.registerWebviewViewProvider`**: 注册 Webview 视图

---

## 🔍 Kled Agent 的核心架构

### **架构图：**
```
extension.ts (入口)
    ├── ClaudeSessionTracker (核心逻辑层)
    │   └── 追踪所有 Claude Code 会话
    │       - 监听 Tab 变化
    │       - 检测会话状态 (idle/pending/done)
    │       - 触发事件通知
    │
    └── SessionDashboardProvider (UI 层)
        └── Webview 视图
            - 显示会话列表
            - 处理用户交互
            - 响应会话变化
```

---

### **核心类详解**

#### **1. ClaudeSessionTracker（会话追踪器）**

**职责：** 追踪所有 Claude Code 会话的状态

**核心机制：**
```typescript
export class ClaudeSessionTracker implements vscode.Disposable {
    private sessions: Map<string, ClaudeSession> = new Map();
    private _onSessionsChanged = new vscode.EventEmitter<ClaudeSession[]>();

    constructor() {
        // 监听 Tab 变化
        vscode.window.tabGroups.onDidChangeTabs(() => {
            this.updateSessions();
        });

        // 定期刷新（每 2 秒）
        setInterval(() => this.updateSessions(), 2000);
    }

    private updateSessions(): void {
        // 1. 获取所有 Tab
        const tabs = this.getAllTabs();

        // 2. 过滤出 Claude Code 的 Webview Tab
        for (const tab of tabs) {
            if (tab.input instanceof vscode.TabInputWebview) {
                // 3. 检测状态（通过图标判断）
                const status = this.getTabStatus(tab);

                // 4. 更新或创建会话
                this.sessions.set(id, { ... });
            }
        }

        // 5. 触发变化事件
        this._onSessionsChanged.fire(this.getAllSessions());
    }
}
```

**状态检测机制：**
Claude Code 通过不同的图标表示状态：
- `claude-logo.svg` → `idle`（空闲）
- `claude-logo-pending.svg` → `pending`（等待用户批准）
- `claude-logo-done.svg` → `done`（完成，有未查看结果）

**事件驱动模式：**
```typescript
// 发布事件
private _onSessionsChanged = new vscode.EventEmitter<ClaudeSession[]>();
public readonly onSessionsChanged = this._onSessionsChanged.event;

// 订阅事件
sessionTracker.onSessionsChanged(() => {
    this.refresh();  // 刷新 UI
});
```

---

#### **2. SessionDashboardProvider（仪表板提供者）**

**职责：** 提供 Webview 视图，显示会话列表

**Webview 通信机制：**
```typescript
export class SessionDashboardProvider implements vscode.WebviewViewProvider {
    public resolveWebviewView(webviewView: vscode.WebviewView) {
        // 1. 设置 Webview 选项
        webviewView.webview.options = {
            enableScripts: true,  // 允许运行 JavaScript
        };

        // 2. 设置 HTML 内容
        webviewView.webview.html = this.getHtmlContent();

        // 3. 接收来自 Webview 的消息
        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
                case 'newSession':
                    vscode.commands.executeCommand('claude-vscode.editor.open');
                    break;
                case 'focusSession':
                    this.sessionTracker.focusSession(data.sessionId);
                    break;
            }
        });
    }

    // 4. 向 Webview 发送消息
    public refresh(): void {
        this._view.webview.postMessage({
            type: 'update',
            sessions: [...],
            summary: { total, pending, done }
        });
    }
}
```

**Webview 双向通信：**
```
Extension (TypeScript)  ←→  Webview (HTML/JS)
        ↓                           ↓
postMessage({...})          window.addEventListener('message')
        ↑                           ↑
onDidReceiveMessage()       vscode.postMessage({...})
```

**`extensionUri` 参数说明：**
```typescript
constructor(
    private readonly extensionUri: vscode.Uri,  // 扩展根目录的 URI
    sessionTracker: ClaudeSessionTracker
) {
    // extensionUri 用于：
    // 1. 加载本地资源（图片、CSS、JS 文件）
    // 2. 设置 Webview 的 localResourceRoots
    // 3. 生成安全的资源 URI
}

// 使用示例：
webviewView.webview.options = {
    localResourceRoots: [this.extensionUri]  // 限制 Webview 只能访问扩展目录下的资源
};

// 加载本地图片：
const iconUri = webviewView.webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png')
);
```

---

## 🎯 关键 VS Code API

### **1. Tab Groups API**
```typescript
// 获取所有 Tab 组
vscode.window.tabGroups.all

// 监听 Tab 变化
vscode.window.tabGroups.onDidChangeTabs(() => {
    // Tab 打开、关闭、切换时触发
});

// Tab 类型判断
if (tab.input instanceof vscode.TabInputWebview) {
    // 这是一个 Webview Tab
}
```

### **2. Commands API**
```typescript
// 注册命令
vscode.commands.registerCommand('kled.agent.newTask', () => {
    // 命令逻辑
});

// 执行命令
vscode.commands.executeCommand('claude-vscode.editor.open');
```

### **3. Webview API**
```typescript
// 注册 Webview 视图提供者
vscode.window.registerWebviewViewProvider(
    'kled.agentDashboard',  // 视图 ID（在 package.json 中定义）
    provider                 // 提供者实例
);
```

### **4. Event Emitter（事件发射器）**
```typescript
// 创建事件发射器
private _onSessionsChanged = new vscode.EventEmitter<ClaudeSession[]>();

// 暴露事件
public readonly onSessionsChanged = this._onSessionsChanged.event;

// 触发事件
this._onSessionsChanged.fire(sessions);

// 订阅事件
tracker.onSessionsChanged((sessions) => {
    console.log('Sessions changed:', sessions);
});
```

---

## 🔄 完整工作流程

### **1. 启动阶段：**
```
VS Code 启动
→ 激活 kled-agent 扩展
→ 调用 activate()
→ 创建 ClaudeSessionTracker
→ 注册 SessionDashboardProvider
→ 显示仪表板视图
```

### **2. 运行时监控：**
```
用户打开 Claude Code Tab
→ tabGroups.onDidChangeTabs 触发
→ ClaudeSessionTracker.updateSessions()
→ 检测新 Tab，创建 ClaudeSession
→ 触发 onSessionsChanged 事件
→ SessionDashboardProvider.refresh()
→ 向 Webview 发送更新消息
→ Webview 更新 UI
```

### **3. 用户交互：**
```
用户点击 "New Chat" 按钮
→ Webview 发送消息 { type: 'newSession' }
→ onDidReceiveMessage 接收
→ 执行命令 'claude-vscode.editor.open'
→ Claude Code 打开新 Tab
→ 触发 Tab 变化监听
→ 循环回到步骤 2
```

---

## 📝 关键设计模式

### **1. Disposable 模式**
所有需要清理的资源都实现 `vscode.Disposable` 接口：
```typescript
export class ClaudeSessionTracker implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(...)
        );
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
```

### **2. Observer 模式（事件驱动）**
使用 `EventEmitter` 实现观察者模式：
```typescript
// 发布者
class ClaudeSessionTracker {
    private _onSessionsChanged = new vscode.EventEmitter<ClaudeSession[]>();
    public readonly onSessionsChanged = this._onSessionsChanged.event;
}

// 订阅者
sessionTracker.onSessionsChanged(() => this.refresh());
```

### **3. Provider 模式**
实现 `WebviewViewProvider` 接口提供视图：
```typescript
class SessionDashboardProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView) {
        // 提供视图内容
    }
}
```

---

## 🎨 UI 实现（Webview）

Webview 是一个嵌入式的 HTML/CSS/JS 环境：

```html
<!-- 在 TypeScript 中生成 HTML -->
<div class="session-card" onclick="focusSession('${session.id}')">
    <div class="session-title">
        ${session.label}
        <span class="session-badge ${session.status}">${session.status}</span>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();

    function focusSession(sessionId) {
        // 向扩展发送消息
        vscode.postMessage({
            type: 'focusSession',
            sessionId: sessionId
        });
    }

    // 接收扩展消息
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'update') {
            updateUI(message.sessions);
        }
    });
</script>
```

---

## 🚀 总结

### **Kled Agent 的核心价值：**
- 实时追踪所有 Claude Code 会话
- 可视化会话状态（idle/pending/done）
- 快速切换和管理多个对话

### **VS Code 扩展开发的核心概念：**
1. **生命周期**：`activate()` / `deactivate()`
2. **贡献点**：commands, views, keybindings
3. **事件驱动**：EventEmitter, onDidChange...
4. **资源管理**：Disposable 模式
5. **UI 扩展**：Webview 双向通信

### **学习要点：**
- 如何监听 VS Code 内部状态（Tab Groups）
- 如何与其他扩展交互（Claude Code）
- 如何创建自定义 UI（Webview）
- 如何实现事件驱动架构

---

## 📂 项目结构

```
kled-agent/
├── package.json           # 扩展配置
├── tsconfig.json         # TypeScript 配置
├── src/
│   ├── extension.ts      # 入口文件
│   ├── core/
│   │   └── ClaudeSessionTracker.ts  # 会话追踪器
│   └── ui/
│       └── SessionDashboardProvider.ts  # 仪表板视图
└── data/                 # 文档和数据（不提交到 Git）
    └── README.md         # 本文档
```
