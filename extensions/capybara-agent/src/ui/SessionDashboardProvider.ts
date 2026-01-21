/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeSessionTracker } from '../core/ClaudeSessionTracker';
import { GlobalTodoManager } from '../core/GlobalTodoManager';

export class SessionDashboardProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'capybara.agentDashboard';

	private _view?: vscode.WebviewView;
	private readonly sessionTracker: ClaudeSessionTracker;
	private readonly globalTodoManager: GlobalTodoManager;
	private _showSettings = false;
	private _settingsFileWatcher?: vscode.FileSystemWatcher;

	constructor(
		private readonly extensionUri: vscode.Uri,
		sessionTracker: ClaudeSessionTracker,
		globalTodoManager: GlobalTodoManager
	) {
		this.sessionTracker = sessionTracker;
		this.globalTodoManager = globalTodoManager;

		// Listen for session changes and global todos changes
		this.sessionTracker.onSessionsChanged(() => this.refresh());
		this.globalTodoManager.onGlobalTodosChanged(() => this.refresh());

		// Setup settings file watcher
		this.setupSettingsFileWatcher();
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtmlContent();

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'newSession':
				case 'openChat':
					vscode.commands.executeCommand('claude-vscode.editor.open');
					break;
				case 'openFolder':
					vscode.commands.executeCommand('workbench.action.files.openFolder');
					break;
				case 'focusSession':
					// For virtual sessions, just log the attempt
					console.log('SessionDashboard: Focus session requested for', data.sessionId);
					this.sessionTracker.focusSession(data.sessionId);
					break;
				case 'refresh':
					this.refresh();
					break;
				case 'showSettings':
					this._showSettings = true;
					this.refreshWithSettings();
					break;
				case 'hideSettings':
					this._showSettings = false;
					this.refresh();
					break;
				case 'getSettings':
					this.sendCurrentSettings();
					break;
				case 'updateSetting':
					await this.updateSetting(data.key, data.value);
					break;
				case 'updateAWSSetting':
					await this.updateAWSSetting(data.key, data.value);
					break;
				case 'removeSession':
					await this.removeSession(data.sessionId);
					break;
			}
		});

		// Initial refresh
		setTimeout(() => this.refresh(), 100);
	}

	private async sendCurrentSettings(): Promise<void> {
		if (!this._view) {
			return;
		}

		const claudeConfig = vscode.workspace.getConfiguration('claudeCode');
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspacePath = workspaceFolders && workspaceFolders.length > 0
			? workspaceFolders[0].uri.fsPath
			: 'No folder open';

		// Read AWS settings from workspace settings.json
		const awsSettings = await this.getAWSSettings();

		this._view.webview.postMessage({
			type: 'settings',
			settings: {
				workspacePath,
				selectedModel: claudeConfig.get('selectedModel', 'default'),
				initialPermissionMode: claudeConfig.get('initialPermissionMode', 'default'),
				useCtrlEnterToSend: claudeConfig.get('useCtrlEnterToSend', false),
				allowDangerouslySkipPermissions: claudeConfig.get('allowDangerouslySkipPermissions', false),
				awsBearerToken: awsSettings.AWS_BEARER_TOKEN_BEDROCK || '',
				awsRegion: awsSettings.AWS_REGION || '',
				bedrockModelId: awsSettings.BEDROCK_MODEL_ID || ''
			}
		});
	}

	private async updateSetting(key: string, value: any): Promise<void> {
		const claudeConfig = vscode.workspace.getConfiguration('claudeCode');
		await claudeConfig.update(key, value, vscode.ConfigurationTarget.Global);
		// Send updated settings back
		this.sendCurrentSettings();
	}

	private async getAWSSettings(): Promise<{AWS_BEARER_TOKEN_BEDROCK?: string, AWS_REGION?: string, BEDROCK_MODEL_ID?: string}> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return {};
			}

			const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
			if (!fs.existsSync(settingsPath)) {
				return {};
			}

			const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
			const settings = JSON.parse(settingsContent);
			const envVars = settings['claudeCode.environmentVariables'] || [];

			const awsSettings: {AWS_BEARER_TOKEN_BEDROCK?: string, AWS_REGION?: string, BEDROCK_MODEL_ID?: string} = {};
			envVars.forEach((envVar: {name: string, value: string}) => {
				if (envVar.name === 'AWS_BEARER_TOKEN_BEDROCK') {
					awsSettings.AWS_BEARER_TOKEN_BEDROCK = envVar.value;
				} else if (envVar.name === 'AWS_REGION') {
					awsSettings.AWS_REGION = envVar.value;
				} else if (envVar.name === 'BEDROCK_MODEL_ID') {
					awsSettings.BEDROCK_MODEL_ID = envVar.value;
				}
			});

			// Special handling: If BEDROCK_MODEL_ID is not set in env vars but claudeCode.selectedModel exists, use it
			if (!awsSettings.BEDROCK_MODEL_ID && settings['claudeCode.selectedModel']) {
				awsSettings.BEDROCK_MODEL_ID = settings['claudeCode.selectedModel'];
				console.log(`Synced claudeCode.selectedModel to BEDROCK_MODEL_ID: ${settings['claudeCode.selectedModel']}`);
			}

			return awsSettings;
		} catch (error) {
			console.error('Failed to read AWS settings:', error);
			return {};
		}
	}

	private async updateAWSSetting(key: string, value: string): Promise<void> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				throw new Error('No workspace folder open');
			}

			const vscodeDir = path.join(workspaceFolders[0].uri.fsPath, '.vscode');
			const settingsPath = path.join(vscodeDir, 'settings.json');

			// Ensure .vscode directory exists
			if (!fs.existsSync(vscodeDir)) {
				fs.mkdirSync(vscodeDir, { recursive: true });
			}

			let settings: any = {};
			if (fs.existsSync(settingsPath)) {
				const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
				settings = JSON.parse(settingsContent);
			}

			// Initialize environmentVariables if it doesn't exist
			if (!settings['claudeCode.environmentVariables']) {
				settings['claudeCode.environmentVariables'] = [];
			}

			const envVars = settings['claudeCode.environmentVariables'];

			// Find existing variable or add new one
			let found = false;
			for (let i = 0; i < envVars.length; i++) {
				if (envVars[i].name === key) {
					envVars[i].value = value;
					found = true;
					break;
				}
			}

			if (!found && value) {
				envVars.push({ name: key, value });
			} else if (!value) {
				// Remove variable if value is empty
				settings['claudeCode.environmentVariables'] = envVars.filter((envVar: {name: string, value: string}) => envVar.name !== key);
			}

			// Special handling: Sync BEDROCK_MODEL_ID to claudeCode.selectedModel
			if (key === 'BEDROCK_MODEL_ID') {
				settings['claudeCode.selectedModel'] = value || '';
				console.log(`Synced BEDROCK_MODEL_ID to claudeCode.selectedModel: ${value}`);
			}

			// Ensure CLAUDE_CODE_USE_BEDROCK is set if any AWS settings are configured
			const hasAnyAwsSetting = envVars.some((envVar: {name: string, value: string}) =>
				envVar.name === 'AWS_BEARER_TOKEN_BEDROCK' ||
				envVar.name === 'AWS_REGION' ||
				envVar.name === 'BEDROCK_MODEL_ID'
			);

			// Add CLAUDE_CODE_USE_BEDROCK if AWS settings exist
			if (hasAnyAwsSetting) {
				let bedrockEnabled = envVars.find((envVar: {name: string, value: string}) =>
					envVar.name === 'CLAUDE_CODE_USE_BEDROCK'
				);
				if (!bedrockEnabled) {
					envVars.push({ name: 'CLAUDE_CODE_USE_BEDROCK', value: '1' });
				}
			} else {
				// Remove CLAUDE_CODE_USE_BEDROCK if no AWS settings
				settings['claudeCode.environmentVariables'] = envVars.filter((envVar: {name: string, value: string}) =>
					envVar.name !== 'CLAUDE_CODE_USE_BEDROCK'
				);
			}

			// Write back to file
			fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf-8');

			// Send updated settings back
			this.sendCurrentSettings();
		} catch (error) {
			console.error('Failed to update AWS setting:', error);
			vscode.window.showErrorMessage(`Failed to update AWS setting: ${error}`);
		}
	}

	private async removeSession(sessionId: string): Promise<void> {
		try {
			console.log('SessionDashboard: Removing session', sessionId);

			// Remove session data and associated todos
			await this.sessionTracker.removeSession(sessionId);

			// Refresh the dashboard to reflect changes
			this.refresh();

			console.log('SessionDashboard: Successfully removed session', sessionId);
		} catch (error) {
			console.error('SessionDashboard: Failed to remove session', sessionId, error);
			vscode.window.showErrorMessage(`Failed to remove session: ${error}`);
		}
	}

	public refresh(): void {
		if (this._view) {
			if (this._showSettings) {
				this.refreshWithSettings();
				return;
			}

			const sessions = this.sessionTracker.getAllSessions();
			const summary = this.sessionTracker.getSessionDataSummary();
			const globalTodos = this.globalTodoManager.getGlobalTodos();
			const globalSummary = this.globalTodoManager.getGlobalTodosSummary();


			// Count sessions by status (adapted for new SessionData status values)
			const pendingCount = 0; // No 'pending' status in new structure
			const idleCount = sessions.filter(s => s.status === 'idle' || s.status === 'completed').length;

			this._view.webview.postMessage({
				type: 'update',
				sessions: sessions.map(s => ({
					id: s.id,
					label: s.firstPrompt?.content || `Session ${s.id.substring(0, 8)}...`, // Use first prompt as title
					startedAt: s.startedAt,
					isSelected: s.status === 'active', // Active sessions are "selected"
					status: s.status === 'active' ? 'active' :
						(s.status === 'idle' || s.status === 'completed' ? 'idle' :
							(s.status === 'interrupted' ? 'interrupted' : 'idle')),
					todos: s.todos || [],
					currentTool: s.currentTool || null,
					// Tool statistics
					tools: s.tools || [],
					toolCount: s.tools ? s.tools.length : 0,
					runningToolCount: s.tools ? s.tools.filter(t => t.status === 'running').length : 0,
					completedToolCount: s.tools ? s.tools.filter(t => t.status === 'completed').length : 0,
					failedToolCount: s.tools ? s.tools.filter(t => t.status === 'failed').length : 0,
					interruptedToolCount: s.tools ? s.tools.filter(t => t.status === 'interrupted').length : 0,
					// Todo statistics
					todoCount: s.todos ? s.todos.length : 0,
					activeTodoCount: s.todos ? s.todos.filter(t => t.status === 'in_progress').length : 0,
					completedTodoCount: s.todos ? s.todos.filter(t => t.status === 'completed').length : 0,
					pendingTodoCount: s.todos ? s.todos.filter(t => t.status === 'pending').length : 0
				})),
				summary: {
					total: sessions.length,
					pending: pendingCount,
					idle: idleCount,
					// Session-based summary (no longer global aggregation)
					totalTodos: summary.totalTodos,
					todoStatusCount: summary.todoStatusCount,
					runningTools: summary.runningTools,
					activeSessions: summary.activeSessions
				},
				// Global todos data
				globalTodos: globalTodos,
				globalSummary: globalSummary
				// Removed selectedSession data
			});
		}
	}

	private refreshWithSettings(): void {
		if (this._view) {
			this._view.webview.postMessage({ type: 'showSettingsView' });
			this.sendCurrentSettings();
		}
	}

	private getHtmlContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Sessions</title>
	<style>
		:root {
			--bg-color: var(--vscode-editor-background);
			--text-color: var(--vscode-editor-foreground);
			--text-muted: var(--vscode-descriptionForeground);
			--border-color: var(--vscode-panel-border);
			--card-bg: var(--vscode-editorWidget-background);
			--accent-color: var(--vscode-textLink-foreground);
			--claude-orange: #D97757;
			--claude-orange-hover: #C66A4A;
			--success-color: #4caf50;
			--danger-color: #f44336;
		}

		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: 13px;
			color: var(--text-color);
			background: var(--bg-color);
			padding: 0;
			line-height: 1.5;
			display: flex;
			flex-direction: column;
			height: 100vh;
		}

		/* Tab Navigation */
		.tab-navigation {
			display: flex;
			background: var(--bg-color);
			border-bottom: 1px solid var(--border-color);
			flex-shrink: 0;
		}

		.tab-btn {
			flex: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			padding: 12px 8px;
			border: none;
			background: transparent;
			color: var(--text-muted);
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			transition: all 0.2s ease;
			position: relative;
		}

		.tab-btn:hover {
			background: rgba(var(--text-color), 0.05);
			color: var(--text-color);
		}

		.tab-btn.active {
			color: var(--claude-orange);
			background: linear-gradient(135deg, rgba(217, 119, 87, 0.08) 0%, rgba(217, 119, 87, 0.02) 100%);
		}

		.tab-btn.active::after {
			content: '';
			position: absolute;
			bottom: 0;
			left: 0;
			right: 0;
			height: 2px;
			background: var(--claude-orange);
		}

		.tab-icon {
			font-size: 14px;
		}

		.tab-label {
			font-weight: 600;
		}

		.tab-badge {
			background: var(--claude-orange);
			color: white;
			padding: 2px 6px;
			border-radius: 10px;
			font-size: 9px;
			font-weight: 700;
			min-width: 16px;
			text-align: center;
		}

		/* Content Views */
		.content-view {
			flex: 1;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.content-view .section {
			flex: 1;
			overflow-y: auto;
			padding: 16px;
		}

		/* Header with status */
		.header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 16px;
			border-bottom: 1px solid var(--border-color);
			flex-shrink: 0;
		}

		.status-indicator {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.status-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: var(--success-color);
		}

		.status-dot.working {
			animation: pulse 1.5s infinite;
		}

		.status-dot.ready {
			opacity: 0.5;
		}

		@keyframes pulse {
			0%, 100% { opacity: 1; transform: scale(1); }
			50% { opacity: 0.6; transform: scale(0.9); }
		}

		.status-text {
			font-size: 14px;
			font-weight: 500;
		}

		.status-sub {
			font-size: 11px;
			color: var(--text-muted);
		}

		/* Action button - Claude orange theme */
		.action-btn {
			padding: 6px 12px;
			border: none;
			background: var(--claude-orange);
			color: white;
			border-radius: 6px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			transition: background 0.2s ease;
		}

		.action-btn:hover {
			background: var(--claude-orange-hover);
		}

		.header-actions {
			display: flex;
			gap: 8px;
			align-items: center;
		}

		/* Section */
		.section {
			margin-bottom: 24px;
			padding: 0 4px;
		}

		/* Session card - Clean design with subtle separation */
		.session-card {
			background: var(--card-bg);
			border: 1px solid rgba(1, 1, 1, 0.1);
			border-radius: 12px;
			padding: 18px;
			margin-bottom: 12px;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
			position: relative;
		}

		.session-card:hover {
			transform: translateY(-2px);
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
			background: linear-gradient(135deg, var(--card-bg) 0%, rgba(217, 119, 87, 0.01) 100%);
		}

		.session-card.selected {
			background: linear-gradient(135deg, rgba(217, 119, 87, 0.03) 0%, var(--card-bg) 50%, rgba(217, 119, 87, 0.01) 100%);
			box-shadow: 0 4px 16px rgba(217, 119, 87, 0.15);
		}

		.session-card.selected .session-title {
			color: var(--claude-orange);
		}

		.session-title {
			font-weight: 600;
			font-size: 13px;
			margin-bottom: 8px;
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 10px;
			line-height: 1.4;
		}

		.session-title-content {
			display: flex;
			align-items: flex-start;
			gap: 10px;
			flex: 1;
			min-width: 0;
		}

		.session-title-text {
			flex: 1;
			min-width: 0;
			word-wrap: break-word;
			overflow: hidden;
			display: -webkit-box;
			-webkit-line-clamp: 4;
			-webkit-box-orient: vertical;
			line-height: 1.4;
		}

		.session-title .claude-icon {
			margin-top: 2px;
			flex-shrink: 0;
		}

		.session-title-actions {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.session-remove-btn {
			background: none;
			border: none;
			cursor: pointer;
			padding: 6px;
			border-radius: 6px;
			opacity: 0;
			transition: all 0.2s ease;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 24px;
		}

		.session-card:hover .session-remove-btn {
			opacity: 0.7;
		}

		.session-remove-btn:hover {
			background-color: rgba(244, 67, 54, 0.15);
			opacity: 1;
			transform: scale(1.1);
		}

		.remove-icon {
			font-size: 16px;
			color: var(--text-muted);
			line-height: 1;
			filter: grayscale(100%) opacity(0.6);
			transition: all 0.2s ease;
		}

		.session-remove-btn:hover .remove-icon {
			filter: grayscale(0%) opacity(1);
		}

		.session-metadata {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-top: 12px;
			font-size: 11px;
			color: var(--text-muted);
			border-top: 1px solid rgba(var(--border-color), 0.3);
			padding-top: 8px;
		}

		.session-stats {
			display: flex;
			gap: 16px;
		}

		.stat-item {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			color: var(--text-muted);
		}

		.stat-icon {
			font-size: 12px;
			opacity: 0.7;
		}

		.stat-icon.running {
			color: var(--claude-orange);
			opacity: 1;
			animation: pulse 2s infinite;
		}

		.current-tool-stat {
			color: var(--claude-orange);
			font-weight: 600;
		}


		/* Session todos */
		.session-todos {
			margin-top: 12px;
			max-height: 160px;
			overflow-y: auto;
			padding-right: 4px;
		}

		.session-todos::-webkit-scrollbar {
			width: 3px;
		}

		.session-todos::-webkit-scrollbar-track {
			background: transparent;
		}

		.session-todos::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 2px;
		}

		.session-todo {
			background: rgba(var(--text-color), 0.02);
			border-radius: 8px;
			padding: 10px 12px;
			margin: 8px 0;
			font-size: 11px;
			transition: all 0.2s ease;
			position: relative;
			display: flex;
			align-items: flex-start;
			gap: 10px;
		}

		.session-todo::before {
			content: '';
			width: 6px;
			height: 6px;
			border-radius: 50%;
			margin-top: 6px;
			flex-shrink: 0;
		}

		.session-todo:hover {
			transform: translateX(3px);
			background: rgba(var(--text-color), 0.04);
		}

		.session-todo.pending {
			background: rgba(156, 163, 175, 0.06);
		}

		.session-todo.pending::before {
			background: #9ca3af;
		}

		.session-todo.in_progress {
			background: rgba(251, 191, 36, 0.08);
		}

		.session-todo.in_progress::before {
			background: #f59e0b;
			animation: pulse 2s infinite;
		}

		.session-todo.completed {
			background: rgba(34, 197, 94, 0.06);
		}

		.session-todo.completed::before {
			background: #22c55e;
		}

		.session-todo-content {
			color: var(--text-color);
			line-height: 1.4;
			font-weight: 500;
			flex: 1;
		}

		/* Global todos section */
		.global-todos {
			max-height: 240px;
			overflow-y: auto;
			padding-right: 4px;
		}

		/* Full-screen global todos in Tasks view */
		.global-todos-full {
			height: 100%;
			overflow-y: auto;
			padding-right: 4px;
		}

		.global-todos::-webkit-scrollbar,
		.global-todos-full::-webkit-scrollbar {
			width: 3px;
		}

		.global-todos::-webkit-scrollbar-track,
		.global-todos-full::-webkit-scrollbar-track {
			background: transparent;
		}

		.global-todos::-webkit-scrollbar-thumb,
		.global-todos-full::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 2px;
		}

		.global-todo-item {
			background: var(--card-bg);
			border: 1px solid rgba(var(--border-color), 0.1);
			border-radius: 12px;
			padding: 16px;
			margin-bottom: 10px;
			font-size: 13px;
			position: relative;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
			display: flex;
			align-items: flex-start;
			gap: 12px;
		}

		.global-todo-item::before {
			content: '';
			width: 8px;
			height: 8px;
			border-radius: 50%;
			margin-top: 4px;
			flex-shrink: 0;
			background: #9ca3af;
			transition: all 0.2s ease;
		}

		.global-todo-item:hover {
			transform: translateY(-2px);
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
		}

		.global-todo-item.pending {
			background: linear-gradient(135deg, rgba(156, 163, 175, 0.04) 0%, var(--card-bg) 70%);
		}

		.global-todo-item.pending::before {
			background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
		}

		.global-todo-item.in_progress {
			background: linear-gradient(135deg, rgba(251, 191, 36, 0.06) 0%, var(--card-bg) 70%);
		}

		.global-todo-item.in_progress::before {
			background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
			animation: pulse 2s infinite;
		}

		.global-todo-item.completed {
			background: linear-gradient(135deg, rgba(16, 185, 129, 0.04) 0%, var(--card-bg) 70%);
		}

		.global-todo-item.completed::before {
			background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		}

		.global-todo-item .todo-content {
			flex: 1;
			min-width: 0;
		}

		.global-todo-item .todo-text {
			color: var(--text-color);
			line-height: 1.4;
			margin-bottom: 10px;
			font-weight: 500;
			overflow: hidden;
			display: -webkit-box;
			-webkit-line-clamp: 4;
			-webkit-box-orient: vertical;
			word-wrap: break-word;
		}

		.global-todo-item .todo-meta {
			display: flex;
			flex-direction: column;
			font-size: 12px;
			color: var(--text-muted);
			margin-top: 8px;
			gap: 6px;
		}

		.global-todo-item .todo-meta-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.global-todo-item .todo-meta-row:first-child {
			justify-content: flex-start;
		}

		.global-todo-item .session-ref {
			background: linear-gradient(135deg, rgba(217, 119, 87, 0.12) 0%, rgba(217, 119, 87, 0.06) 100%);
			color: var(--claude-orange);
			padding: 4px 8px;
			border-radius: 6px;
			font-weight: 600;
			font-size: 11px;
			box-shadow: 0 1px 3px rgba(217, 119, 87, 0.1);
			flex: 1;
			min-width: 0;
			overflow: hidden;
			display: -webkit-box;
			-webkit-line-clamp: 4;
			-webkit-box-orient: vertical;
			line-height: 1.4;
			word-wrap: break-word;
		}

		.global-todo-item .todo-timestamp {
			font-size: 11px;
			color: var(--text-muted);
			font-weight: 500;
			white-space: nowrap;
		}

		.global-todo-item .todo-status {
			padding: 3px 8px;
			border-radius: 12px;
			font-size: 11px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.3px;
		}

		.global-todo-item .todo-status.pending {
			background: linear-gradient(135deg, rgba(156, 163, 175, 0.18) 0%, rgba(156, 163, 175, 0.10) 100%);
			color: #6b7280;
			box-shadow: 0 1px 3px rgba(156, 163, 175, 0.1);
		}

		.global-todo-item .todo-status.in_progress {
			background: linear-gradient(135deg, rgba(251, 191, 36, 0.18) 0%, rgba(251, 191, 36, 0.10) 100%);
			color: #d97706;
			box-shadow: 0 1px 3px rgba(251, 191, 36, 0.15);
		}

		.global-todo-item .todo-status.completed {
			background: linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(16, 185, 129, 0.10) 100%);
			color: #059669;
			box-shadow: 0 1px 3px rgba(16, 185, 129, 0.15);
		}

		/* Session details section */
		.session-details-section {
			margin-bottom: 16px;
		}

		.section-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 16px;
			padding-bottom: 12px;
			border-bottom: 2px solid transparent;
			background: linear-gradient(90deg, var(--border-color) 0%, transparent 50%);
			background-size: 100% 1px;
			background-position: bottom;
			background-repeat: no-repeat;
		}

		.section-title {
			font-size: 11px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.8px;
			color: var(--text-color);
			opacity: 0.8;
		}

		.section-badge {
			background: linear-gradient(135deg, rgba(var(--text-color), 0.06) 0%, rgba(var(--text-color), 0.03) 100%);
			color: var(--text-muted);
			padding: 4px 10px;
			border-radius: 12px;
			font-size: 9px;
			font-weight: 600;
			box-shadow: 0 1px 3px rgba(var(--text-color), 0.05);
			transition: all 0.2s ease;
		}

		.section-badge.active {
			background: linear-gradient(135deg, var(--claude-orange) 0%, #c2610a 100%);
			color: white;
			border-color: var(--claude-orange);
			box-shadow: 0 2px 8px rgba(217, 119, 87, 0.3);
		}

		.todo-item {
			background: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: 6px;
			padding: 8px;
			margin-bottom: 6px;
			font-size: 11px;
		}

		.todo-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 4px;
		}

		.todo-status {
			padding: 2px 6px;
			border-radius: 3px;
			font-size: 9px;
			font-weight: 600;
			text-transform: uppercase;
		}

		.todo-status.pending {
			background: rgba(156, 163, 175, 0.2);
			color: #9ca3af;
		}

		.todo-status.in_progress {
			background: rgba(255, 193, 7, 0.2);
			color: #ffc107;
		}

		.todo-status.completed {
			background: rgba(76, 175, 80, 0.2);
			color: #4caf50;
		}

		.todo-content {
			color: var(--text-color);
			line-height: 1.4;
		}

		.session-badge {
			font-size: 9px;
			padding: 4px 8px;
			border-radius: 12px;
			text-transform: uppercase;
			font-weight: 700;
			letter-spacing: 0.3px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}

		.session-badge.pending {
			background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.08) 100%);
			color: #d97706;
			box-shadow: 0 1px 3px rgba(251, 191, 36, 0.2);
		}

		.session-badge.idle {
			background: linear-gradient(135deg, rgba(217, 119, 87, 0.15) 0%, rgba(217, 119, 87, 0.08) 100%);
			color: #c2410c;
			box-shadow: 0 1px 3px rgba(217, 119, 87, 0.2);
		}

		.session-badge.active {
			background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.08) 100%);
			color: #059669;
			box-shadow: 0 1px 3px rgba(34, 197, 94, 0.2);
			position: relative;
		}

		.session-badge.interrupted {
			background: linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(249, 115, 22, 0.08) 100%);
			color: #ea580c;
			box-shadow: 0 1px 3px rgba(249, 115, 22, 0.2);
		}

		.session-time {
			font-size: 11px;
			color: var(--text-muted);
		}

		/* Claude icon */
		.claude-icon {
			width: 16px;
			height: 16px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			color: var(--claude-orange);
			font-weight: bold;
		}

		/* Empty state */
		.empty-state {
			text-align: center;
			padding: 32px 16px;
			color: var(--text-muted);
		}

		.empty-icon {
			font-size: 32px;
			margin-bottom: 12px;
			opacity: 0.5;
		}

		.empty-title {
			font-size: 14px;
			font-weight: 500;
			margin-bottom: 4px;
			color: var(--text-color);
		}

		.empty-description {
			font-size: 12px;
			margin-bottom: 16px;
		}

		/* Footer area */
		.footer-area {
			padding: 12px 16px;
			background: var(--bg-color);
			border-top: 1px solid var(--border-color);
			display: flex;
			justify-content: space-between;
			align-items: center;
			flex-shrink: 0;
		}

		.footer-hint {
			font-size: 11px;
			color: var(--text-muted);
		}

		.kbd {
			display: inline-block;
			padding: 2px 6px;
			font-size: 10px;
			font-family: monospace;
			background: var(--border-color);
			border-radius: 3px;
			margin-right: 4px;
		}

		.footer-settings-btn {
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 6px 12px;
			border: 1px solid var(--border-color);
			background: transparent;
			color: var(--text-muted);
			border-radius: 6px;
			cursor: pointer;
			font-size: 12px;
			transition: all 0.2s ease;
		}

		.footer-settings-btn:hover {
			background: var(--border-color);
			color: var(--text-color);
		}

		.settings-icon {
			font-size: 14px;
		}

		/* Tasks Filter */
		.tasks-filter {
			padding: 12px 16px;
			background: var(--bg-color);
			border-bottom: 1px solid var(--border-color);
			flex-shrink: 0;
		}

		.filter-buttons {
			display: flex;
			gap: 8px;
		}

		.filter-btn {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 8px 12px;
			border: 1px solid var(--border-color);
			background: transparent;
			color: var(--text-muted);
			border-radius: 6px;
			cursor: pointer;
			font-size: 13px;
			font-weight: 500;
			transition: all 0.2s ease;
			min-width: 0;
		}

		.filter-btn:hover {
			background: rgba(var(--text-color), 0.05);
			color: var(--text-color);
			border-color: rgba(var(--border-color), 0.8);
		}

		.filter-btn.active {
			background: var(--claude-orange);
			color: white;
			border-color: var(--claude-orange);
		}

		.filter-label {
			font-weight: 600;
		}

		.filter-count {
			background: rgba(255, 255, 255, 0.2);
			color: inherit;
			padding: 2px 6px;
			border-radius: 10px;
			font-size: 11px;
			font-weight: 700;
			min-width: 16px;
			text-align: center;
		}

		.filter-btn.active .filter-count {
			background: rgba(255, 255, 255, 0.25);
		}

		.filter-btn:not(.active) .filter-count {
			background: rgba(var(--text-color), 0.1);
		}

		/* Settings View */
		.settings-view {
			display: none;
			padding: 16px;
		}

		.settings-view.active {
			display: block;
		}

		.sessions-view.hidden {
			display: none;
		}

		.settings-header {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 20px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--border-color);
		}

		.back-btn {
			padding: 4px 8px;
			border: none;
			background: transparent;
			color: var(--text-muted);
			cursor: pointer;
			font-size: 16px;
			border-radius: 4px;
		}

		.back-btn:hover {
			background: var(--border-color);
			color: var(--text-color);
		}

		.settings-title {
			font-size: 14px;
			font-weight: 600;
		}

		.setting-group {
			margin-bottom: 20px;
		}

		.setting-group-title {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--text-muted);
			margin-bottom: 12px;
		}

		.setting-item {
			background: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: 8px;
			padding: 12px;
			margin-bottom: 8px;
		}

		.setting-item.danger {
			border-color: var(--danger-color);
			background: rgba(244, 67, 54, 0.05);
		}

		.setting-label {
			font-weight: 500;
			margin-bottom: 4px;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}

		.setting-description {
			font-size: 11px;
			color: var(--text-muted);
			margin-bottom: 8px;
		}

		.setting-value {
			font-size: 12px;
			color: var(--text-muted);
			word-break: break-all;
			padding: 6px 8px;
			background: var(--bg-color);
			border-radius: 4px;
		}

		/* Form controls */
		select {
			width: 100%;
			padding: 8px;
			border: 1px solid var(--border-color);
			border-radius: 4px;
			background: var(--bg-color);
			color: var(--text-color);
			font-size: 12px;
		}

		select:focus {
			outline: none;
			border-color: var(--claude-orange);
		}

		input[type="text"], input[type="password"] {
			width: 100%;
			padding: 8px;
			border: 1px solid var(--border-color);
			border-radius: 4px;
			background: var(--bg-color);
			color: var(--text-color);
			font-size: 12px;
		}

		input[type="text"]:focus, input[type="password"]:focus {
			outline: none;
			border-color: var(--claude-orange);
		}

		input[type="text"]::placeholder, input[type="password"]::placeholder {
			color: var(--text-muted);
		}

		/* Toggle switch */
		.toggle-switch {
			position: relative;
			width: 40px;
			height: 20px;
			background: var(--border-color);
			border-radius: 10px;
			cursor: pointer;
			transition: background 0.2s ease;
		}

		.toggle-switch.active {
			background: var(--claude-orange);
		}

		.toggle-switch.danger.active {
			background: var(--danger-color);
		}

		.toggle-switch::after {
			content: '';
			position: absolute;
			top: 2px;
			left: 2px;
			width: 16px;
			height: 16px;
			background: white;
			border-radius: 50%;
			transition: transform 0.2s ease;
		}

		.toggle-switch.active::after {
			transform: translateX(20px);
		}

		.danger-warning {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			color: var(--danger-color);
			margin-top: 8px;
		}

		/* Confirmation Modal */
		.modal-backdrop {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0, 0, 0, 0.5);
			backdrop-filter: blur(2px);
			z-index: 1000;
			display: flex;
			align-items: center;
			justify-content: center;
			animation: fadeIn 0.15s ease-out;
		}

		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}

		.modal-content {
			background: var(--card-bg);
			border-radius: 12px;
			padding: 0;
			min-width: 320px;
			max-width: 400px;
			box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
			border: 1px solid rgba(var(--border-color), 0.2);
			animation: slideIn 0.2s ease-out;
		}

		@keyframes slideIn {
			from {
				opacity: 0;
				transform: translateY(-10px) scale(0.95);
			}
			to {
				opacity: 1;
				transform: translateY(0) scale(1);
			}
		}

		.modal-header {
			padding: 20px 20px 16px;
			border-bottom: 1px solid rgba(var(--border-color), 0.1);
		}

		.modal-header h3 {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			color: var(--text-color);
		}

		.modal-body {
			padding: 20px;
		}

		.modal-body p {
			margin: 0 0 12px 0;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-color);
		}

		.modal-warning {
			color: var(--text-muted);
			font-size: 12px !important;
		}

		.modal-actions {
			padding: 16px 20px 20px;
			display: flex;
			gap: 12px;
			justify-content: flex-end;
		}

		.modal-btn {
			border: none;
			border-radius: 6px;
			padding: 8px 16px;
			font-size: 13px;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.modal-btn-cancel {
			background: var(--card-bg);
			color: var(--text-muted);
			border: 1px solid rgba(var(--border-color), 0.3);
		}

		.modal-btn-cancel:hover {
			background: rgba(var(--text-color), 0.05);
			color: var(--text-color);
		}

		.modal-btn-danger {
			background: #f44336;
			color: white;
		}

		.modal-btn-danger:hover {
			background: #d32f2f;
			transform: translateY(-1px);
		}
	</style>
</head>
<body>
	<!-- Tab Navigation -->
	<div class="tab-navigation">
		<button class="tab-btn active" id="sessions-tab" onclick="showSessionsView()">
			<span class="tab-label">Sessions</span>
		</button>
		<button class="tab-btn" id="tasks-tab" onclick="showTasksView()">
			<span class="tab-label">Tasks</span>
			<span class="tab-badge" id="tasks-tab-badge">0</span>
		</button>
	</div>

	<!-- Sessions View -->
	<div class="content-view sessions-view" id="sessions-view">
		<!-- Header with Status -->
		<div class="header">
			<div class="status-indicator">
				<span class="status-dot" id="status-dot"></span>
				<div>
					<div class="status-text" id="status-text">Ready</div>
					<div class="status-sub" id="status-sub">No active sessions</div>
				</div>
			</div>
			<div class="header-actions">
				<button class="action-btn" onclick="newSession()">+ New Chat</button>
			</div>
		</div>

		<!-- Sessions List -->
		<div class="section" id="sessions-section">
			<div id="sessions-list"></div>
		</div>

		<!-- Footer with Settings -->
		<div class="footer-area">
			<div class="footer-hint">
				<span class="kbd">&#8984;K</span> new conversation
			</div>
			<button class="footer-settings-btn" onclick="showSettings()">
				<span class="settings-icon">&#9881;</span> Settings
			</button>
		</div>
	</div>

	<!-- Global Tasks View -->
	<div class="content-view tasks-view" id="tasks-view" style="display: none;">
		<!-- Tasks Header -->
		<div class="header">
			<div class="status-indicator">
				<span class="status-dot" id="tasks-status-dot"></span>
				<div>
					<div class="status-text" id="tasks-status-text">Global Tasks</div>
					<div class="status-sub" id="tasks-status-sub">All session todos</div>
				</div>
			</div>
		</div>

		<!-- Tasks Filter -->
		<div class="tasks-filter">
			<div class="filter-buttons">
				<button class="filter-btn active" data-filter="all" onclick="filterTodos('all')">
					<span class="filter-label">All</span>
					<span class="filter-count" id="filter-count-all">0</span>
				</button>
				<button class="filter-btn" data-filter="pending" onclick="filterTodos('pending')">
					<span class="filter-label">Pending</span>
					<span class="filter-count" id="filter-count-pending">0</span>
				</button>
				<button class="filter-btn" data-filter="in_progress" onclick="filterTodos('in_progress')">
					<span class="filter-label">Active</span>
					<span class="filter-count" id="filter-count-active">0</span>
				</button>
				<button class="filter-btn" data-filter="completed" onclick="filterTodos('completed')">
					<span class="filter-label">Done</span>
					<span class="filter-count" id="filter-count-completed">0</span>
				</button>
			</div>
		</div>

		<!-- Global Tasks Content -->
		<div class="section">
			<div id="global-todos-container" class="global-todos-full">
				<!-- Global todos will be rendered here -->
			</div>
		</div>

		<!-- Tasks Footer -->
		<div class="footer-area">
			<div class="footer-hint">
				<span class="kbd">&#8984;K</span> new conversation
			</div>
			<button class="footer-settings-btn" onclick="showSettings()">
				<span class="settings-icon">&#9881;</span> Settings
			</button>
		</div>
	</div>

	<!-- Settings View -->
	<div class="settings-view" id="settings-view">
		<div class="settings-header">
			<button class="back-btn" onclick="hideSettings()">←</button>
			<span class="settings-title">Settings</span>
		</div>

		<!-- Project Info -->
		<div class="setting-group">
			<div class="setting-group-title">Current Project</div>
			<div class="setting-item">
				<div class="setting-value" id="workspace-path">Loading...</div>
			</div>
		</div>

		<!-- Model Settings -->
		<div class="setting-group">
			<div class="setting-group-title">AI Model</div>
			<div class="setting-item">
				<div class="setting-label">Selected Model</div>
				<div class="setting-description">Choose the AI model for Claude Code</div>
				<select id="setting-model" onchange="updateSetting('selectedModel', this.value)">
					<option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
					<option value="claude-opus-4-20250514">Claude Opus 4</option>
				</select>
			</div>
		</div>

		<!-- AWS Settings -->
		<div class="setting-group">
			<div class="setting-group-title">AWS Configuration</div>
			<div class="setting-item">
				<div class="setting-label">Bearer Token</div>
				<div class="setting-description">AWS Bearer Token for Bedrock access</div>
				<input type="password" id="setting-aws-bearer-token" placeholder="Enter your AWS Bearer Token" onchange="updateAWSSetting('AWS_BEARER_TOKEN_BEDROCK', this.value)">
			</div>
			<div class="setting-item">
				<div class="setting-label">AWS Region</div>
				<div class="setting-description">AWS region for Bedrock service (e.g., us-west-2)</div>
				<input type="text" id="setting-aws-region" placeholder="us-west-2" onchange="updateAWSSetting('AWS_REGION', this.value)">
			</div>
			<div class="setting-item">
				<div class="setting-label">Bedrock Model ID</div>
				<div class="setting-description">Bedrock model identifier</div>
				<input type="text" id="setting-bedrock-model-id" placeholder="anthropic.claude-v2" onchange="updateAWSSetting('BEDROCK_MODEL_ID', this.value)">
			</div>
		</div>

		<!-- Permission Settings -->
		<div class="setting-group">
			<div class="setting-group-title">Permissions</div>
			<div class="setting-item">
				<div class="setting-label">Initial Permission Mode</div>
				<div class="setting-description">Default permission level for new conversations</div>
				<select id="setting-permission" onchange="updateSetting('initialPermissionMode', this.value)">
					<option value="default">Default (Confirm all)</option>
					<option value="acceptEdits">Accept Edits (Auto-accept file changes)</option>
					<option value="plan">Plan Only (No auto-execution)</option>
					<option value="bypassPermissions" id="bypass-option" style="display: none;">Bypass All (Auto-execute everything)</option>
				</select>
			</div>
		</div>

		<!-- Input Settings -->
		<div class="setting-group">
			<div class="setting-group-title">Input</div>
			<div class="setting-item">
				<div class="setting-label">
					<span>Ctrl+Enter to Send</span>
					<div class="toggle-switch" id="toggle-ctrlenter" onclick="toggleSetting('useCtrlEnterToSend')"></div>
				</div>
				<div class="setting-description">Use Ctrl/Cmd+Enter to send messages (Enter creates new line)</div>
			</div>
		</div>

		<!-- Dangerous Settings -->
		<div class="setting-group">
			<div class="setting-group-title">Advanced</div>
			<div class="setting-item danger">
				<div class="setting-label">
					<span>Allow Bypass Permissions</span>
					<div class="toggle-switch danger" id="toggle-bypass" onclick="toggleSetting('allowDangerouslySkipPermissions')"></div>
				</div>
				<div class="setting-description">Allow Claude to execute all operations without confirmation</div>
				<div class="danger-warning">
					<span>⚠</span>
					<span>Only enable in sandboxed environments without internet access</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Confirmation Modal -->
	<div class="modal-backdrop" id="confirmation-modal" style="display: none;">
		<div class="modal-content">
			<div class="modal-header">
				<h3>Remove Session</h3>
			</div>
			<div class="modal-body">
				<p>Are you sure you want to remove this session?</p>
				<p class="modal-warning">This will permanently delete all session data including todos and cannot be undone.</p>
			</div>
			<div class="modal-actions">
				<button class="modal-btn modal-btn-cancel" onclick="hideRemoveConfirmation()">Cancel</button>
				<button class="modal-btn modal-btn-danger" onclick="confirmRemoveSession()">Remove Session</button>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		let currentSettings = {};

		function getStatusBadge(status) {
			switch (status) {
				case 'active':
					return '<span class="session-badge active">Active</span>';
				case 'interrupted':
					return '<span class="session-badge interrupted">Stopped</span>';
				case 'pending':
					return '<span class="session-badge pending">Waiting</span>';
				case 'idle':
				default:
					return '<span class="session-badge idle">Idle</span>';
			}
		}

		function renderSession(session) {
			// Show todos for this session
			const todosHtml = session.todos && session.todos.length > 0 ?
				\`<div class="session-todos">
					\${session.todos.map(todo => \`
						<div class="session-todo \${todo.status}">
							<div class="session-todo-content">\${escapeHtml(todo.content)}</div>
						</div>
					\`).join('')}
				</div>\` : '';

			return \`
				<div class="session-card \${session.isSelected ? 'selected' : ''}" onclick="focusSession('\${session.id}')">
					<div class="session-title">
						<div class="session-title-content">
							<span class="session-title-text">\${escapeHtml(cleanSessionTitle(session.label))}</span>
						</div>
						<div class="session-title-actions">
							\${getStatusBadge(session.status)}
							<button class="session-remove-btn" onclick="event.stopPropagation(); showRemoveConfirmation('\${session.id}')" title="Remove session">
								<span class="remove-icon">×</span>
							</button>
						</div>
					</div>
					<div class="session-time">Started \${formatTimeAgo(session.startedAt)}</div>
					\${todosHtml}
					<div class="session-metadata">
						<div class="session-stats">
							\${session.toolCount > 0 ? \`<div class="stat-item"><span class="stat-icon">⚙</span><span>\${session.toolCount} tool\${session.toolCount > 1 ? 's' : ''}</span></div>\` : ''}
							\${session.activeTodoCount > 0 ? \`<div class="stat-item"><span class="stat-icon">◉</span><span>\${session.activeTodoCount} active</span></div>\` : ''}
							\${session.completedTodoCount > 0 ? \`<div class="stat-item"><span class="stat-icon">✓</span><span>\${session.completedTodoCount} done</span></div>\` : ''}
							\${session.currentTool ? \`<div class="stat-item current-tool-stat"><span class="stat-icon running">▶</span><span>\${escapeHtml(session.currentTool.name)} running</span></div>\` : ''}
						</div>
					</div>
				</div>
			\`;
		}

		// Removed renderSelectedSessionDetails function

		function update(data) {
			const { sessions, summary, globalTodos = [], globalSummary = {} } = data;

			// Update status indicator
			const statusDot = document.getElementById('status-dot');
			const statusText = document.getElementById('status-text');
			const statusSub = document.getElementById('status-sub');

			// Count different session statuses
			const activeSessions = sessions.filter(s => s.status === 'active').length;
			const idleSessions = sessions.filter(s => s.status === 'idle').length;
			const interruptedSessions = sessions.filter(s => s.status === 'interrupted').length;

			// Simplified status display - only show session counts and states
			if (activeSessions > 0) {
				statusDot.className = 'status-dot working';
				statusText.textContent = activeSessions + ' Active';
				statusSub.textContent = 'Session' + (activeSessions > 1 ? 's' : '') + ' running';
			} else if (interruptedSessions > 0) {
				statusDot.className = 'status-dot';
				statusDot.style.background = '#ff9800';
				statusText.textContent = interruptedSessions + ' Stopped';
				statusSub.textContent = 'Session' + (interruptedSessions > 1 ? 's' : '') + ' interrupted';
			} else if (idleSessions > 0) {
				statusDot.className = 'status-dot';
				statusDot.style.background = 'var(--claude-orange)';
				statusText.textContent = idleSessions + ' Idle';
				statusSub.textContent = 'Session' + (idleSessions > 1 ? 's' : '') + ' waiting';
			} else if (summary.idle > 0) {
				statusDot.className = 'status-dot';
				statusDot.style.background = 'var(--claude-orange)';
				statusText.textContent = summary.idle + ' Idle';
				statusSub.textContent = 'Session' + (summary.idle > 1 ? 's' : '') + ' idle';
			} else if (summary.total > 0) {
				statusDot.className = 'status-dot';
				statusDot.style.background = '#4caf50';
				statusText.textContent = summary.total + ' Session' + (summary.total > 1 ? 's' : '');
				statusSub.textContent = 'All completed';
			} else {
				statusDot.className = 'status-dot ready';
				statusDot.style.background = '';
				statusText.textContent = 'Ready';
				statusSub.textContent = 'No sessions';
			}

			// Removed selected session details handling

			// Render sessions
			const container = document.getElementById('sessions-list');
			if (sessions.length > 0) {
				container.innerHTML = sessions.map(renderSession).join('');
			} else {
				container.innerHTML = \`
					<div class="empty-state">
						<div class="empty-icon">&#128172;</div>
						<div class="empty-title">No Claude sessions</div>
						<div class="empty-description">Start a conversation with Claude to begin</div>
						<button class="action-btn" onclick="newSession()">+ New Chat</button>
					</div>
				\`;
			}

			// Render global todos
			updateGlobalTodos(globalTodos, globalSummary);
		}

		function updateGlobalTodos(globalTodos, globalSummary) {
			// Store global todos for tasks status updates
			currentGlobalTodos = globalTodos || [];

			const container = document.getElementById('global-todos-container');
			const badge = document.getElementById('global-badge');
			const tasksTabBadge = document.getElementById('tasks-tab-badge');

			// Update badge and tab
			const todoCount = globalTodos.length;
			if (badge) {
				badge.textContent = \`\${todoCount} task\${todoCount !== 1 ? 's' : ''}\`;
			}
			if (tasksTabBadge) {
				tasksTabBadge.textContent = todoCount.toString();
			}

			// Update badge class based on activity
			if (badge) {
				badge.className = 'section-badge';
				if (globalTodos.some(t => t.status === 'in_progress')) {
					badge.className += ' active';
				}
			}

			// Update tasks status if Tasks view is active
			if (document.getElementById('tasks-view').style.display === 'flex') {
				updateTasksStatus();
				// Update filter counts and apply current filter
				updateFilterCounts();
				filterTodos(currentFilter);
			}

			// For sessions view, render todos normally
			if (!container || container.classList.contains('global-todos-full')) {
				return; // Skip rendering here for tasks view, handled by filterTodos
			}

			// Make sure container exists (for sessions view)
			if (!container) {
				console.error('Global todos container not found');
				return;
			}

			// Render todos (for sessions view)
			if (todoCount === 0) {
				container.innerHTML = '<div class="empty-state" style="padding: 16px; text-align: center; color: var(--text-muted);">No global tasks</div>';
				return;
			}

			const todosHTML = globalTodos.map(todo => \`
				<div class="global-todo-item \${todo.status}">
					<div class="todo-content">
						<div class="todo-text">\${escapeHtml(todo.content)}</div>
						<div class="todo-meta">
							<div class="todo-meta-row">
								<span class="session-ref">\${escapeHtml(cleanSessionTitle(todo.sessionTitle || todo.sessionId.substring(0, 8)))}</span>
							</div>
							<div class="todo-meta-row">
								<span class="todo-timestamp">\${formatTimeAgo(todo.timestamp)}</span>
								<span class="todo-status \${todo.status}">\${todo.status}</span>
							</div>
						</div>
					</div>
				</div>
			\`).join('');

			container.innerHTML = todosHTML;
		}

		function updateSettingsUI(settings) {
			currentSettings = settings;

			// Update workspace path
			document.getElementById('workspace-path').textContent = settings.workspacePath;

			// Update model select - default to Sonnet 4 if 'default' or empty
			const modelSelect = document.getElementById('setting-model');
			const modelValue = settings.selectedModel;
			if (modelValue && modelValue !== 'default') {
				modelSelect.value = modelValue;
			} else {
				modelSelect.value = 'claude-sonnet-4-20250514'; // Default is Sonnet 4
			}

			// Show/hide bypass option based on allowDangerouslySkipPermissions
			const bypassOption = document.getElementById('bypass-option');
			if (settings.allowDangerouslySkipPermissions) {
				bypassOption.style.display = 'block';
			} else {
				bypassOption.style.display = 'none';
				// If bypass was selected but now disabled, reset to default
				if (settings.initialPermissionMode === 'bypassPermissions') {
					settings.initialPermissionMode = 'default';
				}
			}

			// Update permission select
			const permissionSelect = document.getElementById('setting-permission');
			permissionSelect.value = settings.initialPermissionMode || 'default';

			// Update toggles
			const ctrlEnterToggle = document.getElementById('toggle-ctrlenter');
			ctrlEnterToggle.className = 'toggle-switch' + (settings.useCtrlEnterToSend ? ' active' : '');

			const bypassToggle = document.getElementById('toggle-bypass');
			bypassToggle.className = 'toggle-switch danger' + (settings.allowDangerouslySkipPermissions ? ' active' : '');

			// Update AWS settings
			document.getElementById('setting-aws-bearer-token').value = settings.awsBearerToken || '';
			document.getElementById('setting-aws-region').value = settings.awsRegion || '';
			document.getElementById('setting-bedrock-model-id').value = settings.bedrockModelId || '';
		}

		function formatTimeAgo(timestamp) {
			if (!timestamp) return 'unknown';

			// Fix malformed timestamp (e.g., "2026-01-08T09:35:41.3NZ" -> "2026-01-08T09:35:41.300Z")
			let cleanTimestamp = timestamp;
			if (timestamp.includes('.') && timestamp.endsWith('NZ')) {
				const parts = timestamp.split('.');
				const millisPart = parts[1].replace('NZ', '');
				// Pad milliseconds to 3 digits
				const paddedMillis = millisPart.padEnd(3, '0');
				cleanTimestamp = parts[0] + '.' + paddedMillis + 'Z';
			}

			const date = new Date(cleanTimestamp);
			if (isNaN(date.getTime())) {
				console.warn('Invalid timestamp:', timestamp);
				return 'invalid date';
			}

			const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
			if (seconds < 60) return 'just now';
			if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
			if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
			return Math.floor(seconds / 86400) + 'd ago';
		}

		function escapeHtml(text) {
			if (!text) return '';
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function cleanSessionTitle(text) {
			if (!text) return '';

			// Remove XML-like tags and their content
			let cleaned = text
				// Remove IDE opened file tags and their content
				.replace(/<ide_opened_file>.*?<\\/ide_opened_file>/gi, '')
				// Remove other common XML-like tags
				.replace(/<[^>]+>/g, '')
				// Clean up multiple whitespace
				.replace(/\\s+/g, ' ')
				// Trim whitespace
				.trim();

			// If the cleaned text is empty or too short, return a fallback
			if (!cleaned || cleaned.length < 3) {
				return text.replace(/<[^>]+>/g, '').trim() || 'Claude Code Session';
			}

			return cleaned;
		}

		function newSession() {
			vscode.postMessage({ type: 'newSession' });
		}

		function openFolder() {
			vscode.postMessage({ type: 'openFolder' });
		}

		function focusSession(sessionId) {
			vscode.postMessage({ type: 'focusSession', sessionId });
		}

		// Session removal functionality
		let sessionToRemove = null;

		function showRemoveConfirmation(sessionId) {
			sessionToRemove = sessionId;
			document.getElementById('confirmation-modal').style.display = 'flex';
		}

		function hideRemoveConfirmation() {
			sessionToRemove = null;
			document.getElementById('confirmation-modal').style.display = 'none';
		}

		function confirmRemoveSession() {
			if (sessionToRemove) {
				vscode.postMessage({ type: 'removeSession', sessionId: sessionToRemove });
				hideRemoveConfirmation();
			}
		}

		// Close modal when clicking backdrop
		document.addEventListener('click', function(e) {
			if (e.target.id === 'confirmation-modal') {
				hideRemoveConfirmation();
			}
		});

		// Close modal with Escape key
		document.addEventListener('keydown', function(e) {
			if (e.key === 'Escape' && sessionToRemove) {
				hideRemoveConfirmation();
			}
		});

		function showSettings() {
			// Hide all content views
			document.getElementById('sessions-view').style.display = 'none';
			document.getElementById('tasks-view').style.display = 'none';
			document.getElementById('settings-view').classList.add('active');
			vscode.postMessage({ type: 'getSettings' });
		}

		function hideSettings() {
			// Show the currently active tab view
			document.getElementById('settings-view').classList.remove('active');

			// Restore the active tab view
			if (document.getElementById('sessions-tab').classList.contains('active')) {
				showSessionsView();
			} else {
				showTasksView();
			}

			vscode.postMessage({ type: 'hideSettings' });
		}

		function updateSetting(key, value) {
			vscode.postMessage({ type: 'updateSetting', key, value });
		}

		function updateAWSSetting(key, value) {
			vscode.postMessage({ type: 'updateAWSSetting', key, value });
		}

		function toggleSetting(key) {
			const newValue = !currentSettings[key];
			vscode.postMessage({ type: 'updateSetting', key, value: newValue });
		}

		// Tab switching functions
		function showSessionsView() {
			// Update tab states
			document.getElementById('sessions-tab').classList.add('active');
			document.getElementById('tasks-tab').classList.remove('active');

			// Update views
			document.getElementById('sessions-view').style.display = 'flex';
			document.getElementById('tasks-view').style.display = 'none';
			document.getElementById('settings-view').classList.remove('active');
		}

		function showTasksView() {
			// Update tab states
			document.getElementById('sessions-tab').classList.remove('active');
			document.getElementById('tasks-tab').classList.add('active');

			// Update views
			document.getElementById('sessions-view').style.display = 'none';
			document.getElementById('tasks-view').style.display = 'flex';
			document.getElementById('settings-view').classList.remove('active');

			// Update tasks status and filters
			updateTasksStatus();
			updateFilterCounts();
			filterTodos(currentFilter);
		}

		// Store global todos data for tasks status
		let currentGlobalTodos = [];

		function updateTasksStatus() {
			const tasksStatusDot = document.getElementById('tasks-status-dot');
			const tasksStatusText = document.getElementById('tasks-status-text');
			const tasksStatusSub = document.getElementById('tasks-status-sub');

			const todoCount = currentGlobalTodos.length;

			if (todoCount > 0) {
				const inProgressCount = currentGlobalTodos.filter(t => t.status === 'in_progress').length;
				tasksStatusDot.className = inProgressCount > 0 ? 'status-dot working' : 'status-dot';
				tasksStatusText.textContent = todoCount + ' Task' + (todoCount > 1 ? 's' : '');
				tasksStatusSub.textContent = 'Across all sessions';
			} else {
				tasksStatusDot.className = 'status-dot ready';
				tasksStatusText.textContent = 'No Tasks';
				tasksStatusSub.textContent = 'All caught up!';
			}
		}

		// Filter functionality
		let currentFilter = 'all';

		function updateFilterCounts() {
			const pendingCount = currentGlobalTodos.filter(t => t.status === 'pending').length;
			const inProgressCount = currentGlobalTodos.filter(t => t.status === 'in_progress').length;
			const completedCount = currentGlobalTodos.filter(t => t.status === 'completed').length;
			const totalCount = currentGlobalTodos.length;

			document.getElementById('filter-count-all').textContent = totalCount;
			document.getElementById('filter-count-pending').textContent = pendingCount;
			document.getElementById('filter-count-active').textContent = inProgressCount;
			document.getElementById('filter-count-completed').textContent = completedCount;
		}

		function filterTodos(filterType) {
			currentFilter = filterType;

			// Update filter button states
			document.querySelectorAll('.filter-btn').forEach(btn => {
				btn.classList.remove('active');
			});
			document.querySelector(\`[data-filter="\${filterType}"]\`).classList.add('active');

			// Filter and render todos
			const container = document.getElementById('global-todos-container');
			if (!container || !currentGlobalTodos) return;

			let filteredTodos = currentGlobalTodos;
			if (filterType !== 'all') {
				filteredTodos = currentGlobalTodos.filter(todo => todo.status === filterType);
			}

			if (filteredTodos.length === 0) {
				const filterLabel = filterType === 'all' ? 'tasks' :
					filterType === 'in_progress' ? 'active tasks' :
					filterType + ' tasks';
				container.innerHTML = \`<div class="empty-state" style="padding: 16px; text-align: center; color: var(--text-muted);">No \${filterLabel}</div>\`;
				return;
			}

			const todosHTML = filteredTodos.map(todo => \`
				<div class="global-todo-item \${todo.status}">
					<div class="todo-content">
						<div class="todo-text">\${escapeHtml(todo.content)}</div>
						<div class="todo-meta">
							<div class="todo-meta-row">
								<span class="session-ref">\${escapeHtml(cleanSessionTitle(todo.sessionTitle || todo.sessionId.substring(0, 8)))}</span>
							</div>
							<div class="todo-meta-row">
								<span class="todo-timestamp">\${formatTimeAgo(todo.timestamp)}</span>
								<span class="todo-status \${todo.status}">\${todo.status}</span>
							</div>
						</div>
					</div>
				</div>
			\`).join('');

			container.innerHTML = todosHTML;
		}

		// Listen for updates
		window.addEventListener('message', event => {
			const data = event.data;
			switch (data.type) {
				case 'update':
					update(data);
					break;
				case 'showSettingsView':
					showSettings();
					break;
				case 'settings':
					updateSettingsUI(data.settings);
					break;
			}
		});

		// Initial render
		update({
			sessions: [],
			summary: { total: 0, hasSelected: false },
			globalTodos: [],
			globalSummary: { totalTodos: 0 }
		});
	</script>
</body>
</html>`;
	}

	private setupSettingsFileWatcher(): void {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
		const settingsPattern = new vscode.RelativePattern(path.dirname(settingsPath), 'settings.json');

		this._settingsFileWatcher = vscode.workspace.createFileSystemWatcher(settingsPattern);

		this._settingsFileWatcher.onDidChange(() => {
			console.log('Settings file changed, refreshing settings UI');
			if (this._showSettings && this._view) {
				this.sendCurrentSettings();
			}
		});

		this._settingsFileWatcher.onDidCreate(() => {
			console.log('Settings file created, refreshing settings UI');
			if (this._showSettings && this._view) {
				this.sendCurrentSettings();
			}
		});

		this._settingsFileWatcher.onDidDelete(() => {
			console.log('Settings file deleted, refreshing settings UI');
			if (this._showSettings && this._view) {
				this.sendCurrentSettings();
			}
		});
	}

	public dispose(): void {
		if (this._settingsFileWatcher) {
			this._settingsFileWatcher.dispose();
			this._settingsFileWatcher = undefined;
		}
	}
}
