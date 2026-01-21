# 🧪 ViewsContainers 位置测试指南

本指南帮助你直观体验 VS Code 扩展中三种不同的 `viewsContainers` 位置。

---

## 📦 已添加的测试视图

我已经在 `kled-agent` 插件中添加了三个测试视图，分别展示在不同的位置：

### 1. **Activity Bar（主侧边栏）** 🎯
- **图标**：🧪 烧杯图标
- **标题**：Kled Test (Activity Bar)
- **位置**：VS Code 左侧的主活动栏
- **颜色**：蓝色主题

### 2. **Secondary Sidebar（辅助侧边栏）** 📊
- **图标**：📈 脉搏图标
- **标题**：Kled Test (Secondary)
- **位置**：VS Code 右侧的辅助侧边栏
- **颜色**：橙色主题

### 3. **Panel（底部面板）** 📋
- **图标**：📤 输出图标
- **标题**：Kled Test (Panel)
- **位置**：VS Code 底部的面板区域
- **颜色**：绿色主题

---

## 🚀 如何测试

### 步骤 1：编译扩展

```bash
cd extensions/kled-agent
npm run compile
```

### 步骤 2：重新加载 VS Code

按 `F5` 或使用命令面板：
- `Developer: Reload Window`

### 步骤 3：查看各个位置的测试视图

#### 🎯 测试 Activity Bar（主侧边栏）

1. 查看 VS Code **左侧**的活动栏
2. 找到 **🧪 烧杯图标**（Kled Test）
3. 点击图标，会在左侧打开测试视图
4. 查看蓝色主题的测试页面

**观察要点：**
- ✅ 图标显示在左侧活动栏（与文件浏览器、搜索等并列）
- ✅ 点击后在左侧打开视图
- ✅ 可以看到详细的位置特点说明
- ✅ 点击"测试消息通信"按钮会弹出通知

#### 📊 测试 Secondary Sidebar（辅助侧边栏）

1. 首先需要**开启辅助侧边栏**：
   - 菜单：`View` → `Appearance` → `Secondary Side Bar`
   - 或使用快捷键：`Cmd+Option+B`（Mac）/ `Ctrl+Alt+B`（Windows）

2. 查看 VS Code **右侧**的辅助侧边栏
3. 找到 **📈 脉搏图标**（Kled Test）
4. 点击图标，会在右侧打开测试视图
5. 查看橙色主题的测试页面

**观察要点：**
- ✅ 图标显示在右侧（如果开启了辅助侧边栏）
- ✅ 可以与左侧的主侧边栏同时显示
- ✅ 适合监控和辅助工具
- ✅ 原有的 Sessions 视图也在这里

#### 📋 测试 Panel（底部面板）

1. 查看 VS Code **底部**的面板区域
2. 找到 **📤 输出图标**（Kled Test）标签页
3. 点击标签页，会在底部显示测试视图
4. 查看绿色主题的测试页面

**观察要点：**
- ✅ 标签页显示在底部（与终端、问题、输出等并列）
- ✅ 横向空间大，适合宽内容
- ✅ 垂直空间有限
- ✅ 适合日志和输出展示

---

## 🎨 每个测试视图包含的内容

每个测试视图都会显示：

1. **位置标识**
   - 彩色徽章标识当前位置
   - 位置名称和描述

2. **位置特点**
   - 可见性
   - 空间特点
   - 访问频率
   - 其他特性

3. **使用场景**
   - 列出该位置适合的实际应用场景
   - 参考现有扩展的使用方式

4. **配置代码**
   - 显示该位置的 `package.json` 配置示例

5. **交互测试**
   - "测试消息通信"按钮
   - 点击后会触发 VS Code 通知，验证 Webview 通信

---

## 📊 三个位置对比

| 特性 | Activity Bar | Secondary Sidebar | Panel |
|------|-------------|-------------------|-------|
| **位置** | 左侧 | 右侧 | 底部 |
| **可见性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **垂直空间** | 大 | 大 | 小 |
| **横向空间** | 中 | 中 | 大 |
| **适合场景** | 核心功能 | 辅助工具 | 输出日志 |
| **图标颜色** | 🔵 蓝色 | 🟠 橙色 | 🟢 绿色 |

---

## 💡 实际体验建议

### 同时打开三个视图

1. 点击左侧的 🧪 烧杯图标（Activity Bar）
2. 开启右侧辅助侧边栏，点击 📈 脉搏图标（Secondary Sidebar）
3. 打开底部面板，点击 📤 输出标签（Panel）

现在你可以同时看到三个不同位置的测试视图！

### 对比体验

- **左右对比**：左侧 Activity Bar vs 右侧 Secondary Sidebar
  - 观察两者可以同时显示
  - 比较空间利用和视觉效果

- **上下对比**：侧边栏 vs 底部 Panel
  - 观察垂直空间 vs 横向空间
  - 比较适合的内容类型

### 调整布局

尝试调整各个区域的大小：
- 拖动分隔线改变宽度/高度
- 观察不同位置的响应式表现

---

## 🔧 代码说明

### package.json 配置

```json
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "kled-test-activitybar",
        "title": "Kled Test (Activity Bar)",
        "icon": "$(beaker)"
      }
    ],
    "secondarySidebar": [
      {
        "id": "kled-test-secondary",
        "title": "Kled Test (Secondary)",
        "icon": "$(pulse)"
      }
    ],
    "panel": [
      {
        "id": "kled-test-panel",
        "title": "Kled Test (Panel)",
        "icon": "$(output)"
      }
    ]
  },
  "views": {
    "kled-test-activitybar": [
      {
        "id": "kled.testActivityBar",
        "name": "Activity Bar Demo",
        "type": "webview"
      }
    ],
    "kled-test-secondary": [
      {
        "id": "kled.testSecondary",
        "name": "Secondary Sidebar Demo",
        "type": "webview"
      }
    ],
    "kled-test-panel": [
      {
        "id": "kled.testPanel",
        "name": "Panel Demo",
        "type": "webview"
      }
    ]
  }
}
```

### 注册代码（extension.ts）

```typescript
// Activity Bar
const testActivityBarProvider = new TestViewProvider(context.extensionUri, 'activitybar');
context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('kled.testActivityBar', testActivityBarProvider)
);

// Secondary Sidebar
const testSecondaryProvider = new TestViewProvider(context.extensionUri, 'secondarySidebar');
context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('kled.testSecondary', testSecondaryProvider)
);

// Panel
const testPanelProvider = new TestViewProvider(context.extensionUri, 'panel');
context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('kled.testPanel', testPanelProvider)
);
```

---

## 🎯 测试完成后

### 如果想保留测试视图

测试视图会一直存在，你可以随时查看和对比。

### 如果想移除测试视图

只需要从 `package.json` 中删除相应的配置，并从 `extension.ts` 中移除注册代码即可。

---

## 📝 学习要点

通过这个测试，你应该能够理解：

1. ✅ **三种位置的视觉差异**
   - Activity Bar 在左侧，最显眼
   - Secondary Sidebar 在右侧，可与左侧并存
   - Panel 在底部，横向空间大

2. ✅ **空间特点**
   - 侧边栏：垂直空间大，适合列表
   - 面板：横向空间大，适合宽内容

3. ✅ **使用场景**
   - Activity Bar：核心功能（文件、Git、调试）
   - Secondary Sidebar：辅助工具（监控、参考）
   - Panel：输出日志（终端、问题、输出）

4. ✅ **配置方式**
   - 在 `package.json` 中声明 `viewsContainers` 和 `views`
   - 在 `extension.ts` 中注册 `WebviewViewProvider`

---

## 🚀 下一步

现在你已经了解了三种位置的特点，可以根据你的扩展需求选择合适的位置：

- **核心功能** → Activity Bar
- **辅助工具** → Secondary Sidebar
- **输出日志** → Panel

祝你开发愉快！🎉
