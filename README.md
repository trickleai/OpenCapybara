# Capybara - Claude Code Dashboard

> The best desktop experience for Claude Code

## Vision

Capybara delivers the ultimate desktop experience for Claude Code, with **conversation-driven workflow** at its core, providing a clean and intuitive interface for knowledge workers.

**Core Principles:**
- **Claude Code First** - Claude Code is the primary interaction method
- **Tool Adapts to Workflow** - Knowledge workers shouldn't adapt to tools; tools should adapt to their workflow
- **Conversation as Workspace** - Chat is the workspace

## Architecture

Capybara is built as a fork of [Code-OSS](https://github.com/microsoft/vscode) (MIT licensed), with significant UI modifications to create a streamlined Claude Code experience.

```
┌─────────────────────────────────────────────────────────┐
│                    Capybara App                         │
│              (GUI for Knowledge Workers)                │
├─────────────────────────────────────────────────────────┤
│                   Fork of Code-OSS                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Modified/Replaced:                               │  │
│  │  - Hidden: Activity Bar, Sidebar, Status Bar     │  │
│  │  - Editor Area → Conversation-first workspace    │  │
│  │  - Secondary Sidebar → Session Dashboard         │  │
│  │  - Removed: Terminal, Debug, Git (dev features)  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Retained/Reused:                                 │  │
│  │  - File system, Editor core, Extension host      │  │
│  │  - Claude Code VSCode Extension (built-in)       │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                   Electron Runtime                      │
└─────────────────────────────────────────────────────────┘
```

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    Title Bar (Command Center)               │
├─────────────────────────────────────────┬───────────────────┤
│                                         │                   │
│                                         │ Session Dashboard │
│              Main Workspace             │                   │
│                                         │  ┌─────────────┐  │
│         Claude Code Chat Panel          │  │  Sessions   │  │
│                                         │  │  List       │  │
│    (Conversation is primary interface)  │  ├─────────────┤  │
│                                         │  │  Status     │  │
│                                         │  │  Indicator  │  │
│                                         │  └─────────────┘  │
│                                         │                   │
└─────────────────────────────────────────┴───────────────────┘
```

## Features

- **Auto Workspace Setup** - On first launch, automatically creates `~/CapyWorkspace` folder
- **Minimal UI** - Hidden Activity Bar, Status Bar, and developer features
- **Session Dashboard** - Track Claude Code sessions on the right sidebar
- **Built-in Claude Code** - Pre-installed and ready to use

## Development Status

### Phase 1: Foundation (MVP) ✅ Complete

- [x] Fork Code-OSS and establish build pipeline
- [x] Brand assets (Capybara name, icons)
- [x] Basic configuration: product.json branding
- [x] Built-in Claude Code extension
- [x] Default configuration extension (capybara-defaults)
- [x] Compile and run successfully

### Phase 2: UI Simplification ✅ Complete

- [x] Hide Activity Bar
- [x] Hide Status Bar
- [x] Hide Primary Sidebar (on startup)
- [x] Hide developer features (SCM, Extensions, Debug, Testing)
- [x] Session Dashboard in Secondary Sidebar
- [x] Official app icon

### Phase 3: Distribution ✅ Complete

- [x] Mac DMG packaging
- [x] Code signing
- [x] GitHub Actions CI/CD
- [x] Automated notarization
- [x] AWS S3 distribution
- [ ] Windows Installer packaging
- [ ] Auto-update mechanism

## Tech Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Base | Code-OSS (MIT) | Forked from microsoft/vscode |
| Runtime | Electron 39.2.7 | Bundled with Code-OSS |
| AI Engine | Claude Code Extension v2.0.75 | Official extension, pre-installed |
| Session Tracking | capybara-agent extension | Custom extension |
| Build System | gulp + webpack | Native Code-OSS tooling |
| Node.js | v22.21.1 | Required version |

## Project Structure

```
capybara/
├── extensions/
│   ├── claude-code/            # Claude Code extension (pre-installed)
│   ├── capybara-agent/         # Session tracking extension
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── core/
│   │   │   │   └── ClaudeSessionTracker.ts
│   │   │   └── ui/
│   │   │       └── SessionDashboardProvider.ts
│   │   └── package.json
│   └── capybara-defaults/      # Default configuration extension
│       ├── src/extension.ts    # Auto workspace setup logic
│       └── package.json
├── resources/
│   └── darwin/
│       └── capybara.icns       # App icon
├── scripts/
│   └── create-dmg.sh           # DMG packaging script
├── src/                        # VSCode source code
├── product.json                # Product branding configuration
├── start-capybara.sh           # Development launcher
└── README.md
```

## Development

### Prerequisites

- Node.js v22.21.1 (required)
- Python 3.x
- C++ build tools

### Build & Run

```bash
# Instsall claude code extension
./scripts/download-claude-code.sh

# Use correct Node version
source ~/.nvm/nvm.sh && nvm use 22.21.1

# Compile project
npm run gulp -- compile

# Compile extensions
cd extensions/capybara-defaults && npm run compile
cd extensions/capybara-agent && npm run compile

# Start development version
./start-capybara.sh

# Or use official script
bash scripts/code.sh
```

### Build Distribution Package

```bash
# Build macOS app
npm run gulp -- vscode-darwin-arm64

# Create DMG
bash scripts/create-dmg.sh
```

### CI/CD Setup

Capybara includes automated build and distribution via GitHub Actions.

**Quick Start:** [CI/CD Quick Start Guide](./docs/QUICK-START-CI.md)

**Full Documentation:** [CI/CD Setup Guide](./docs/CI-CD-SETUP.md)

**Features:**
- Automatic builds on push to `main` or PR merge
- Apple code signing and notarization
- AWS S3 distribution
- Pre-signed download URLs

**Setup Requirements:**
- Apple Developer account ($99/year)
- Developer ID Application certificate
- AWS account with S3 access
- 10 GitHub Secrets (see [Quick Start](./docs/QUICK-START-CI.md))

To prepare your certificate:
```bash
bash scripts/prepare-certificate.sh
```

### Brand Configuration

Current settings in `product.json`:

- **Name**: Capybara
- **Full Name**: Capybara - Claude Code Dashboard
- **App Name**: capybara
- **Data Directory**: ~/.capybara
- **Bundle ID**: com.capybara.app
- **URL Protocol**: capybara://

## License

This project is a fork of [Code-OSS](https://github.com/microsoft/vscode) which is licensed under MIT. The modifications and additions made for Capybara follow the same license.

## Acknowledgments

- [Microsoft VS Code](https://github.com/microsoft/vscode) - The foundation of this project
- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) - The AI engine powering Capybara
