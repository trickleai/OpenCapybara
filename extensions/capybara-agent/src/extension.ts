/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDashboardProvider } from './ui/SessionDashboardProvider';
import { ClaudeSessionTracker } from './core/ClaudeSessionTracker';
import { GlobalTodoManager } from './core/GlobalTodoManager';

// TodoWrite injection is now handled directly by hooks via additionalContext mechanism

export function activate(context: vscode.ExtensionContext) {
	console.log('Capybara Session Dashboard is now active');

	// Initialize global todo manager and session tracker
	const hooksDir = path.join(os.homedir(), 'CapyWorkspace', '.claude', 'hooks');
	const globalTodoManager = new GlobalTodoManager(hooksDir);
	const sessionTracker = new ClaudeSessionTracker();

	// TodoWrite injection is now handled directly by hooks via additionalContext

	// Register the dashboard view provider
	const dashboardProvider = new SessionDashboardProvider(context.extensionUri, sessionTracker, globalTodoManager);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SessionDashboardProvider.viewType,
			dashboardProvider
		),
		dashboardProvider // Register dispose method
	);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('capybara.agent.newTask', async () => {
			// Open new Claude Code tab
			vscode.commands.executeCommand('claude-vscode.editor.open');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('capybara.agent.showDashboard', () => {
			vscode.commands.executeCommand('capybara.agentDashboard.focus');
		})
	);

	// Debug command to test session data loading
	context.subscriptions.push(
		vscode.commands.registerCommand('capybara.agent.debugSessions', async () => {
			const sessions = sessionTracker.getAllSessions();
			const summary = sessionTracker.getSessionDataSummary();

			const message = `Session Debug Info:
- Total sessions: ${sessions.length}
- Sessions with todos: ${sessions.filter(s => s.todos && s.todos.length > 0).length}
- Sessions with current tool: ${sessions.filter(s => s.currentTool).length}

Sessions:
${sessions.map(s => `  • ${s.id}: ${s.todos?.length || 0} todos, tool: ${s.currentTool?.name || 'none'}`).join('\n')}

Summary: ${JSON.stringify(summary, null, 2)}`;

			vscode.window.showInformationMessage('Session data logged to console');
			console.log('=== SESSION DEBUG ===');
			console.log(message);
			console.log('=== END DEBUG ===');
		})
	);

	// Start tracking sessions and global todos
	context.subscriptions.push(sessionTracker);
	context.subscriptions.push(globalTodoManager);

	// Focus the dashboard after a delay
	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('capybara.agentDashboard.focus');
		} catch (e) {
			console.log('Dashboard setup error:', e);
		}
	}, 2000);
}

export function deactivate() {
	console.log('Capybara Session Dashboard deactivated');
}
