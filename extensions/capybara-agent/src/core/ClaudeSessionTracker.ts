/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SessionDataManager, SessionData, TodoItem, ToolExecution } from './SessionDataManager';

/**
 * ClaudeSessionTracker - Simplified session tracker that only manages hook-based session data
 * No longer tracks webview tabs, purely based on session-data.json from hooks
 */
export class ClaudeSessionTracker implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private sessionDataManager: SessionDataManager;

	private _onSessionsChanged = new vscode.EventEmitter<SessionData[]>();
	public readonly onSessionsChanged = this._onSessionsChanged.event;

	constructor() {
		// Initialize session data manager
		this.sessionDataManager = new SessionDataManager();
		this.disposables.push(this.sessionDataManager);

		// Listen for session data changes from hooks
		this.disposables.push(
			this.sessionDataManager.onSessionDataChanged(() => {
				this.notifySessionsChanged();
			})
		);

		// Initial notification with delay to ensure data is loaded
		setTimeout(() => {
			console.log('ClaudeSessionTracker: Starting initial session data load...');
			this.notifySessionsChanged();
		}, 1000);

		// Periodic refresh to catch any missed updates
		const intervalId = setInterval(() => this.notifySessionsChanged(), 10000);
		this.disposables.push({ dispose: () => clearInterval(intervalId) });
	}

	/**
	 * Notify UI about session data changes
	 */
	private notifySessionsChanged(): void {
		const sessions = this.sessionDataManager.getAllSessionData();
		console.log(`ClaudeSessionTracker: Notifying UI about ${sessions.length} sessions`);
		this._onSessionsChanged.fire(sessions);
	}

	public getAllSessions(): SessionData[] {
		return this.sessionDataManager.getAllSessionData();
	}

	public getSelectedSession(): SessionData | undefined {
		const sessions = this.getAllSessions();
		return sessions.find(s => s.status === 'active') || sessions[0];
	}

	public getSessionCount(): number {
		return this.getAllSessions().length;
	}

	public focusSession(sessionId: string): void {
		console.log('ClaudeSessionTracker: Focus requested for session', sessionId);
	}

	/**
	 * Trigger hook: Update todos for a specific session
	 */
	public updateSessionTodos(sessionId: string, todos: any[]): void {
		const formattedTodos = todos.map(todo => ({
			content: todo.content,
			status: todo.status as 'pending' | 'in_progress' | 'completed',
			activeForm: todo.activeForm,
			timestamp: new Date().toISOString()
		}));
		this.sessionDataManager.updateSessionTodos(sessionId, formattedTodos);
	}

	/**
	 * Trigger hook: Start tool execution for a specific session
	 */
	public startSessionTool(sessionId: string, toolName: string, parameters: any): string {
		const toolId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
		const toolExecution = {
			id: toolId,
			name: toolName,
			startTime: new Date().toISOString(),
			status: 'running' as const,
			parameters
		};
		this.sessionDataManager.startToolExecution(sessionId, toolExecution);
		return toolId;
	}

	/**
	 * Trigger hook: Complete tool execution
	 */
	public completeSessionTool(sessionId: string, toolId: string, result: any, error?: any): void {
		this.sessionDataManager.completeToolExecution(sessionId, toolId, result, error);
	}

	/**
	 * Trigger hook: Record first prompt for session (used as title)
	 */
	public recordFirstPrompt(sessionId: string, content: string): void {
		this.sessionDataManager.updateFirstPrompt(sessionId, content);
	}

	/**
	 * Trigger hook: Create new session
	 */
	public createSession(sessionId: string, initialData?: Partial<SessionData>): void {
		this.sessionDataManager.createSession(sessionId, initialData);
	}

	/**
	 * Trigger hook: Update session status
	 */
	public updateSessionStatus(sessionId: string, status: SessionData['status']): void {
		this.sessionDataManager.updateSessionStatus(sessionId, status);
	}

	/**
	 * Remove session and all associated data including todos
	 */
	public async removeSession(sessionId: string): Promise<void> {
		return this.sessionDataManager.removeSession(sessionId);
	}

	/**
	 * Get summary data for all sessions
	 */
	public getSessionDataSummary() {
		const sessions = this.getAllSessions();
		let totalTodos = 0;
		let activeTodos = 0;
		let runningTools = 0;

		sessions.forEach(session => {
			totalTodos += session.todos?.length || 0;
			activeTodos += session.todos?.filter(t => t.status === 'in_progress').length || 0;
			if (session.currentTool && session.currentTool.status === 'running') {
				runningTools++;
			}
		});

		return {
			totalSessions: sessions.length,
			activeSessions: sessions.filter(s => s.status === 'active' || s.status === 'idle').length,
			totalTodos,
			todoStatusCount: {
				pending: sessions.reduce((sum, s) => sum + (s.todos?.filter(t => t.status === 'pending').length || 0), 0),
				in_progress: activeTodos,
				completed: sessions.reduce((sum, s) => sum + (s.todos?.filter(t => t.status === 'completed').length || 0), 0)
			},
			runningTools,
			lastUpdated: new Date().toISOString()
		};
	}

	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this._onSessionsChanged.dispose();
	}
}
