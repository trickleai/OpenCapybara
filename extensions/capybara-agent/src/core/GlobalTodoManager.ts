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

export interface GlobalTodoItem extends TodoItem {
	id: string;
	sessionId: string;
	sessionTitle?: string;
}

export interface GlobalTodoData {
	globalTodos: GlobalTodoItem[];
	lastUpdated: string;
}

/**
 * Manages global todos aggregated from all Claude Code sessions
 */
export class GlobalTodoManager {
	private globalTodosFile: string;
	private _onGlobalTodosChanged = new vscode.EventEmitter<GlobalTodoItem[]>();
	public readonly onGlobalTodosChanged = this._onGlobalTodosChanged.event;
	private fileWatcher: fs.StatWatcher | null = null;

	constructor(hooksDir?: string) {
		const defaultHooksDir = path.join(os.homedir(), 'CapyWorkspace', '.claude', 'hooks');
		this.globalTodosFile = path.join(hooksDir || defaultHooksDir, 'global-todos.json');
		this.initializeGlobalTodosFile();
		this.watchGlobalTodosFile();
	}

	/**
	 * Initialize global todos file if it doesn't exist
	 */
	private initializeGlobalTodosFile(): void {
		try {
			// Ensure directory exists
			const dir = path.dirname(this.globalTodosFile);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Create file if it doesn't exist
			if (!fs.existsSync(this.globalTodosFile)) {
				const initialData: GlobalTodoData = {
					globalTodos: [],
					lastUpdated: new Date().toISOString()
				};
				fs.writeFileSync(this.globalTodosFile, JSON.stringify(initialData, null, 2));
				console.log('Global todos file initialized:', this.globalTodosFile);
			}
		} catch (error) {
			console.error('Error initializing global todos file:', error);
		}
	}

	/**
	 * Get all global todos
	 */
	public getGlobalTodos(): GlobalTodoItem[] {
		try {
			const data = JSON.parse(fs.readFileSync(this.globalTodosFile, 'utf8')) as GlobalTodoData;
			return data.globalTodos || [];
		} catch (error) {
			console.error('Error reading global todos:', error);
			return [];
		}
	}

	/**
	 * Get global todos summary statistics
	 */
	public getGlobalTodosSummary() {
		const todos = this.getGlobalTodos();

		const statusCount = {
			pending: todos.filter(t => t.status === 'pending').length,
			in_progress: todos.filter(t => t.status === 'in_progress').length,
			completed: todos.filter(t => t.status === 'completed').length
		};

		return {
			totalTodos: todos.length,
			statusCount,
			uniqueSessions: new Set(todos.map(t => t.sessionId)).size
		};
	}

	/**
	 * Update global todos for a specific session
	 */
	public updateGlobalTodos(sessionId: string, todos: TodoItem[], sessionTitle?: string): void {
		try {
			const currentData = this.readGlobalTodosData();

			// Remove existing todos for this session
			const filteredTodos = currentData.globalTodos.filter(t => t.sessionId !== sessionId);

			// Add new todos for this session
			const newGlobalTodos: GlobalTodoItem[] = todos.map((todo, index) => ({
				...todo,
				id: `${sessionId}-${Date.now()}-${index}`,
				sessionId,
				sessionTitle: sessionTitle || sessionId.substring(0, 8)
			}));

			const updatedData: GlobalTodoData = {
				globalTodos: [...filteredTodos, ...newGlobalTodos],
				lastUpdated: new Date().toISOString()
			};

			this.writeGlobalTodosData(updatedData);
			console.log(`Updated global todos for session ${sessionId}: ${newGlobalTodos.length} todos`);
		} catch (error) {
			console.error('Error updating global todos:', error);
		}
	}

	/**
	 * Remove all todos for a session
	 */
	public removeSessionTodos(sessionId: string): void {
		try {
			const currentData = this.readGlobalTodosData();
			const filteredTodos = currentData.globalTodos.filter(t => t.sessionId !== sessionId);

			const updatedData: GlobalTodoData = {
				globalTodos: filteredTodos,
				lastUpdated: new Date().toISOString()
			};

			this.writeGlobalTodosData(updatedData);
			console.log(`Removed todos for session ${sessionId}`);
		} catch (error) {
			console.error('Error removing session todos:', error);
		}
	}

	/**
	 * Read global todos data from file
	 */
	private readGlobalTodosData(): GlobalTodoData {
		try {
			const content = fs.readFileSync(this.globalTodosFile, 'utf8');
			return JSON.parse(content) as GlobalTodoData;
		} catch (error) {
			console.warn('Error reading global todos data, using defaults:', error);
			return {
				globalTodos: [],
				lastUpdated: new Date().toISOString()
			};
		}
	}

	/**
	 * Write global todos data to file atomically
	 */
	private writeGlobalTodosData(data: GlobalTodoData): void {
		try {
			const tempFile = `${this.globalTodosFile}.tmp`;
			fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
			fs.renameSync(tempFile, this.globalTodosFile);
		} catch (error) {
			console.error('Error writing global todos data:', error);
		}
	}

	/**
	 * Set up file watcher for real-time updates
	 */
	private watchGlobalTodosFile(): void {
		try {
			fs.watchFile(this.globalTodosFile, (curr, prev) => {
				if (curr.mtime > prev.mtime) {
					const todos = this.getGlobalTodos();
					this._onGlobalTodosChanged.fire(todos);
				}
			});
			console.log('Global todos file watcher established');
		} catch (error) {
			console.error('Error setting up global todos file watcher:', error);
		}
	}

	/**
	 * Cleanup resources
	 */
	public dispose(): void {
		fs.unwatchFile(this.globalTodosFile);
		this._onGlobalTodosChanged.dispose();
	}
}