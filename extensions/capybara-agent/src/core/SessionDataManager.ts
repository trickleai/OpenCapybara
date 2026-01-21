/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TodoItem {
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
	activeForm: string;
	timestamp: string;
}

export interface ToolExecution {
	id: string;
	name: string;
	startTime: string;
	endTime?: string;
	status: 'running' | 'completed' | 'failed' | 'interrupted';
	parameters: any;
	result?: any;
	error?: any;
}

export interface SessionData {
	id: string;
	startedAt: string;
	lastActivity: string;
	todos: TodoItem[];
	tools: ToolExecution[];
	currentTool?: ToolExecution;
	status: 'active' | 'idle' | 'completed' | 'interrupted';
	firstPrompt?: {
		content: string;
		timestamp: string;
	};
	lastMessage?: {
		content: string;
		timestamp: string;
	};
}

export interface SessionDataStore {
	sessions: Record<string, SessionData>;
	lastUpdated?: string;
}

/**
 * SessionDataManager - Manages session data from Claude Code hooks
 */
export class SessionDataManager implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private sessionDataFile: string | null = null;
	private fileWatcher: fs.FSWatcher | null = null;

	private _onSessionDataChanged = new vscode.EventEmitter<SessionDataStore>();
	public readonly onSessionDataChanged = this._onSessionDataChanged.event;

	constructor() {
		this.initializeDataFile();
		this.startWatching();
	}

	private initializeDataFile(): void {
		// Priority 1: Check CapyWorkspace directory (fixed location for Capybara)
		const userHome = os.homedir();
		const capyWorkspaceDir = path.join(userHome, 'CapyWorkspace');
		const capyWorkspaceHooksDir = path.join(capyWorkspaceDir, '.claude', 'hooks');
		const capyWorkspaceDataFile = path.join(capyWorkspaceHooksDir, 'session-data.json');

		if (fs.existsSync(capyWorkspaceHooksDir)) {
			this.sessionDataFile = capyWorkspaceDataFile;
			console.log('SessionDataManager: Found CapyWorkspace hooks directory at', capyWorkspaceHooksDir);

			// Ensure session-data.json exists
			if (!fs.existsSync(capyWorkspaceDataFile)) {
				console.log('SessionDataManager: session-data.json missing, creating initial file');
				this.createInitialDataFile(capyWorkspaceDataFile);
			} else {
				// Validate existing file
				try {
					const content = fs.readFileSync(capyWorkspaceDataFile, 'utf8');
					JSON.parse(content);
					console.log('SessionDataManager: Using existing CapyWorkspace session data file at', capyWorkspaceDataFile);
				} catch (error) {
					console.error('SessionDataManager: Existing session data file is corrupted, recreating:', error);
					this.createInitialDataFile(capyWorkspaceDataFile);
				}
			}
			return;
		} else {
			console.log('SessionDataManager: CapyWorkspace hooks directory not found at', capyWorkspaceHooksDir);
			console.log('SessionDataManager: .claude directory may not be initialized yet - running in fallback mode');

			// Fallback: Try to create the hooks directory if CapyWorkspace exists
			if (fs.existsSync(capyWorkspaceDir)) {
				console.log('SessionDataManager: CapyWorkspace exists, but .claude directory missing');
				console.log('SessionDataManager: This may indicate the initialization system needs to run');

				// Don't attempt to create directories here - let the initialization system handle it
				// Just log that we're in degraded mode
				this.sessionDataFile = null;
			}
		}
	}

	private createInitialDataFile(filePath: string): void {
		const initialData: SessionDataStore = {
			sessions: {},
			lastUpdated: new Date().toISOString()
		};

		try {
			fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), 'utf8');
			console.log('SessionDataManager: Created initial session data file at', filePath);
		} catch (error) {
			console.error('SessionDataManager: Failed to create initial data file', error);
		}
	}

	private startWatching(): void {
		if (!this.sessionDataFile) {
			return;
		}

		try {
			// Watch for changes to the session data file
			const watchDir = path.dirname(this.sessionDataFile);

			this.fileWatcher = fs.watch(watchDir, (eventType, filename) => {
				if (filename === 'session-data.json') {
					console.log('SessionDataManager: Session data file changed');
					this.notifyDataChanged();
				}
			});

			console.log('SessionDataManager: Started watching for session data changes');
		} catch (error) {
			console.error('SessionDataManager: Failed to start file watcher', error);
		}
	}

	private notifyDataChanged(): void {
		const data = this.readSessionData();
		this._onSessionDataChanged.fire(data);
	}

	public readSessionData(): SessionDataStore {
		if (!this.sessionDataFile || !fs.existsSync(this.sessionDataFile)) {
			console.log('SessionDataManager: No session data file found at', this.sessionDataFile);
			return { sessions: {} };
		}

		try {
			const content = fs.readFileSync(this.sessionDataFile, 'utf8');
			const data = JSON.parse(content) as SessionDataStore;
			console.log('SessionDataManager: Successfully read session data', {
				sessionCount: Object.keys(data.sessions || {}).length,
				sessionIds: Object.keys(data.sessions || {}),
				lastUpdated: data.lastUpdated
			});
			return data || { sessions: {} };
		} catch (error) {
			console.error('SessionDataManager: Failed to read session data', error);
			return { sessions: {} };
		}
	}

	public getSessionData(sessionId: string): SessionData | undefined {
		const store = this.readSessionData();
		return store.sessions[sessionId];
	}

	public getAllSessionData(): SessionData[] {
		const store = this.readSessionData();
		const sessions = Object.values(store.sessions);

		// Helper function to parse timestamp safely
		const parseTimestamp = (timestamp: string): number => {
			// Fix malformed timestamp format (.3NZ -> .300Z)
			const fixedTimestamp = timestamp.replace(/\.(\d)NZ$/, '.$100Z');
			return new Date(fixedTimestamp).getTime();
		};

		// Sort by lastActivity (most recent activity at top)
		sessions.sort((a, b) => {
			const timeA = parseTimestamp(a.lastActivity);
			const timeB = parseTimestamp(b.lastActivity);
			return timeB - timeA; // Most recent first (b > a means b comes first)
		});

		return sessions;
	}

	public getActiveTodos(): TodoItem[] {
		const sessions = this.getAllSessionData();
		const allTodos: TodoItem[] = [];

		sessions.forEach(session => {
			if (session.todos && session.todos.length > 0) {
				allTodos.push(...session.todos);
			}
		});

		// Sort by timestamp, most recent first
		return allTodos.sort((a, b) =>
			new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);
	}

	public getRunningTools(): ToolExecution[] {
		const sessions = this.getAllSessionData();
		const runningTools: ToolExecution[] = [];

		sessions.forEach(session => {
			if (session.currentTool && session.currentTool.status === 'running') {
				runningTools.push(session.currentTool);
			}
		});

		return runningTools;
	}

	public getSessionSummary() {
		const sessions = this.getAllSessionData();
		const todos = this.getActiveTodos();
		const runningTools = this.getRunningTools();

		const todoStatusCount = {
			pending: todos.filter(t => t.status === 'pending').length,
			in_progress: todos.filter(t => t.status === 'in_progress').length,
			completed: todos.filter(t => t.status === 'completed').length
		};

		return {
			totalSessions: sessions.length,
			activeSessions: sessions.filter(s => s.status === 'active').length,
			totalTodos: todos.length,
			todoStatusCount,
			runningTools: runningTools.length,
			lastUpdated: this.readSessionData().lastUpdated
		};
	}

	// Hook-based session management methods

	/**
	 * Hook trigger: Create new session when Claude Code webview is opened
	 */
	public createSession(sessionId: string, initialData?: Partial<SessionData>): void {
		if (!this.sessionDataFile) {
			console.warn('SessionDataManager: Cannot create session - no data file configured');
			return;
		}

		const store = this.readSessionData();
		const now = new Date().toISOString();

		// Create new session if it doesn't exist
		if (!store.sessions[sessionId]) {
			store.sessions[sessionId] = {
				id: sessionId,
				startedAt: now,
				lastActivity: now,
				todos: [],
				tools: [],
				status: 'active',
				...initialData
			};

			this.writeSessionData(store);
			console.log('SessionDataManager: Created new session', sessionId);
		}
	}

	/**
	 * Hook trigger: Update todos when TodoWrite tool is used
	 */
	public updateSessionTodos(sessionId: string, todos: TodoItem[]): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();

		// Ensure session exists
		if (!store.sessions[sessionId]) {
			this.createSession(sessionId);
		}

		if (store.sessions[sessionId]) {
			store.sessions[sessionId].todos = todos;
			store.sessions[sessionId].lastActivity = new Date().toISOString();
			this.writeSessionData(store);
			console.log('SessionDataManager: Updated todos for session', sessionId, todos.length);
		}
	}

	/**
	 * Hook trigger: Track tool execution start
	 */
	public startToolExecution(sessionId: string, toolExecution: ToolExecution): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();

		// Ensure session exists
		if (!store.sessions[sessionId]) {
			this.createSession(sessionId);
		}

		if (store.sessions[sessionId]) {
			// Add to tools array
			store.sessions[sessionId].tools.push(toolExecution);
			// Set as current tool
			store.sessions[sessionId].currentTool = toolExecution;
			store.sessions[sessionId].lastActivity = new Date().toISOString();

			this.writeSessionData(store);
			console.log('SessionDataManager: Started tool execution for session', sessionId, toolExecution.name);
		}
	}

	/**
	 * Hook trigger: Update tool execution status/result
	 */
	public completeToolExecution(sessionId: string, toolId: string, result: any, error?: any): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();
		const session = store.sessions[sessionId];

		if (session) {
			// Update tool in tools array
			const tool = session.tools.find(t => t.id === toolId);
			if (tool) {
				tool.endTime = new Date().toISOString();
				tool.status = error ? 'failed' : 'completed';
				tool.result = result;
				tool.error = error;
			}

			// Clear current tool if it's the completed one
			if (session.currentTool && session.currentTool.id === toolId) {
				session.currentTool = undefined;
			}

			session.lastActivity = new Date().toISOString();
			this.writeSessionData(store);
			console.log('SessionDataManager: Completed tool execution for session', sessionId, toolId);
		}
	}

	/**
	 * Hook trigger: Update session status (active/idle/completed)
	 */
	public updateSessionStatus(sessionId: string, status: SessionData['status']): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();
		const session = store.sessions[sessionId];

		if (session && session.status !== status) {
			session.status = status;
			session.lastActivity = new Date().toISOString();
			this.writeSessionData(store);
			console.log('SessionDataManager: Updated session status', sessionId, status);
		}
	}

	/**
	 * Hook trigger: Record Claude's last message for the session
	 */
	public updateLastMessage(sessionId: string, content: string): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();

		// Ensure session exists
		if (!store.sessions[sessionId]) {
			this.createSession(sessionId);
		}

		if (store.sessions[sessionId]) {
			store.sessions[sessionId].lastMessage = {
				content,
				timestamp: new Date().toISOString()
			};
			store.sessions[sessionId].lastActivity = new Date().toISOString();
			this.writeSessionData(store);
		}
	}

	/**
	 * Atomic write operation to prevent data corruption
	 */
	private writeSessionData(data: SessionDataStore): void {
		if (!this.sessionDataFile) {
			return;
		}

		try {
			data.lastUpdated = new Date().toISOString();
			const tempFile = this.sessionDataFile + '.tmp';

			// Write to temp file first
			fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');

			// Atomic rename
			fs.renameSync(tempFile, this.sessionDataFile);
		} catch (error) {
			console.error('SessionDataManager: Failed to write session data', error);
		}
	}

	/**
	 * Hook trigger: Record first user prompt for the session (used as session title)
	 */
	public updateFirstPrompt(sessionId: string, content: string): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();

		// Ensure session exists
		if (!store.sessions[sessionId]) {
			this.createSession(sessionId);
		}

		if (store.sessions[sessionId] && !store.sessions[sessionId].firstPrompt) {
			store.sessions[sessionId].firstPrompt = {
				content,
				timestamp: new Date().toISOString()
			};
			store.sessions[sessionId].lastActivity = new Date().toISOString();
			this.writeSessionData(store);
			console.log('SessionDataManager: Recorded first prompt for session', sessionId);
		}
	}

	/**
	 * Remove a specific session and all its data
	 */
	public async removeSession(sessionId: string): Promise<void> {
		if (!this.sessionDataFile) {
			throw new Error('No session data file available');
		}

		const store = this.readSessionData();

		// Check if session exists
		if (!store.sessions[sessionId]) {
			console.warn('SessionDataManager: Session not found for removal:', sessionId);
			return;
		}

		// Remove session from store
		delete store.sessions[sessionId];
		this.writeSessionData(store);

		// Remove associated todos from global todos file
		try {
			await this.removeSessionTodos(sessionId);
		} catch (error) {
			console.error('SessionDataManager: Failed to remove session todos:', error);
			// Don't throw here - session removal should continue even if todo cleanup fails
		}

		console.log('SessionDataManager: Successfully removed session:', sessionId);
	}

	/**
	 * Remove all todos for a specific session from global todos file
	 */
	private async removeSessionTodos(sessionId: string): Promise<void> {
		const userHome = os.homedir();
		const globalTodosFile = path.join(userHome, 'CapyWorkspace', '.claude', 'hooks', 'global-todos.json');

		if (!fs.existsSync(globalTodosFile)) {
			console.log('SessionDataManager: No global todos file found, skipping todo cleanup');
			return;
		}

		try {
			const content = fs.readFileSync(globalTodosFile, 'utf8');
			const data = JSON.parse(content);

			// Filter out todos for the removed session
			const originalCount = data.globalTodos?.length || 0;
			data.globalTodos = data.globalTodos?.filter((todo: any) => todo.sessionId !== sessionId) || [];
			const newCount = data.globalTodos.length;

			// Update timestamp
			data.lastUpdated = new Date().toISOString();

			// Write back atomically
			const tempFile = globalTodosFile + '.tmp';
			fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
			fs.renameSync(tempFile, globalTodosFile);

			console.log('SessionDataManager: Removed', originalCount - newCount, 'todos for session', sessionId);
		} catch (error) {
			console.error('SessionDataManager: Failed to remove session todos from global file:', error);
			throw error;
		}
	}

	/**
	 * Clean up old completed sessions (hook can be called periodically)
	 */
	public cleanupOldSessions(maxAgeHours: number = 24): void {
		if (!this.sessionDataFile) {
			return;
		}

		const store = this.readSessionData();
		const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
		let cleaned = 0;

		for (const [sessionId, session] of Object.entries(store.sessions)) {
			if (session.status === 'completed' && new Date(session.lastActivity) < cutoffTime) {
				delete store.sessions[sessionId];
				cleaned++;
			}
		}

		if (cleaned > 0) {
			this.writeSessionData(store);
			console.log('SessionDataManager: Cleaned up', cleaned, 'old sessions');
		}
	}

	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		if (this.fileWatcher) {
			this.fileWatcher.close();
		}
		this._onSessionDataChanged.dispose();
	}
}
