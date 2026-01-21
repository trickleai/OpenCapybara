/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface InitializationResult {
	success: boolean;
	message: string;
	details?: {
		directoryCreated: boolean;
		hooksInstalled: boolean;
		dataFilesInitialized: boolean;
		settingsConfigured: boolean;
	};
}

export interface ValidationResult {
	isValid: boolean;
	missingComponents: string[];
	corruptedFiles: string[];
	permissionIssues: string[];
}

export class CapyWorkspaceInitializer {
	private readonly workspaceDir: string;
	private readonly claudeDir: string;
	private readonly extensionPath: string;

	constructor(extensionPath: string) {
		this.extensionPath = extensionPath;
		this.workspaceDir = path.join(os.homedir(), 'CapyWorkspace');
		this.claudeDir = path.join(this.workspaceDir, '.claude');
	}

	/**
	 * Main initialization method - coordinates all setup tasks
	 */
	async initialize(): Promise<InitializationResult> {
		try {
			console.log('CapyWorkspaceInitializer: Starting initialization...');

			// First validate if we need full initialization
			const validation = await this.validateInstallation();

			if (validation.isValid) {
				console.log('CapyWorkspaceInitializer: Installation already valid, skipping initialization');
				return {
					success: true,
					message: 'CapyWorkspace .claude directory already properly initialized'
				};
			}

			// Create directory structure
			console.log('CapyWorkspaceInitializer: Creating directory structure...');
			await this.ensureDirectoryStructure();

			// Install hooks system
			console.log('CapyWorkspaceInitializer: Installing hooks system...');
			await this.installHooksSystem();

			// Initialize data files
			console.log('CapyWorkspaceInitializer: Initializing data files...');
			await this.initializeDataFiles();

			// Configure settings
			console.log('CapyWorkspaceInitializer: Configuring settings...');
			await this.configureSettings();

			// Final validation
			const finalValidation = await this.validateInstallation();

			if (!finalValidation.isValid) {
				throw new Error(`Initialization completed but validation failed: ${finalValidation.missingComponents.join(', ')}`);
			}

			console.log('CapyWorkspaceInitializer: Initialization completed successfully');
			return {
				success: true,
				message: 'CapyWorkspace .claude directory initialized successfully',
				details: {
					directoryCreated: true,
					hooksInstalled: true,
					dataFilesInitialized: true,
					settingsConfigured: true
				}
			};

		} catch (error) {
			console.error('CapyWorkspaceInitializer: Initialization failed:', error);

			// Attempt repair if possible
			try {
				await this.repairPartialInstallation();
				return {
					success: true,
					message: 'CapyWorkspace .claude directory repaired successfully'
				};
			} catch (repairError) {
				console.error('CapyWorkspaceInitializer: Repair also failed:', repairError);
				return {
					success: false,
					message: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		}
	}

	/**
	 * Ensure the complete directory structure exists
	 */
	async ensureDirectoryStructure(): Promise<void> {
		const directories = [
			this.claudeDir,
			path.join(this.claudeDir, 'hooks'),
			path.join(this.claudeDir, 'hooks', 'scripts')
		];

		for (const dir of directories) {
			try {
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
				console.log(`CapyWorkspaceInitializer: Created directory: ${dir}`);
			} catch (error) {
				// Directory might already exist, that's OK
				if (!fs.existsSync(dir)) {
					throw new Error(`Failed to create directory ${dir}: ${error}`);
				}
			}
		}
	}

	/**
	 * Install hooks system by copying templates to target location
	 */
	async installHooksSystem(): Promise<void> {
		const templateDir = path.join(this.extensionPath, 'resources', 'claude-templates');
		const sessionTrackerSource = path.join(templateDir, 'hooks', 'scripts', 'session-tracker.sh');
		const sessionTrackerTarget = path.join(this.claudeDir, 'hooks', 'scripts', 'session-tracker.sh');

		try {
			// Copy session-tracker.sh
			if (!fs.existsSync(sessionTrackerSource)) {
				throw new Error(`Template not found: ${sessionTrackerSource}`);
			}

			await vscode.workspace.fs.copy(
				vscode.Uri.file(sessionTrackerSource),
				vscode.Uri.file(sessionTrackerTarget),
				{ overwrite: true }
			);

			// Set executable permissions on Unix systems
			if (process.platform !== 'win32') {
				fs.chmodSync(sessionTrackerTarget, 0o755);
			}

			console.log('CapyWorkspaceInitializer: Hooks system installed successfully');

		} catch (error) {
			throw new Error(`Failed to install hooks system: ${error}`);
		}
	}

	/**
	 * Initialize JSON data files from templates
	 */
	async initializeDataFiles(): Promise<void> {
		const templateDir = path.join(this.extensionPath, 'resources', 'claude-templates');

		const dataFiles = [
			{
				templatePath: path.join(templateDir, 'hooks', 'session-data.json.template'),
				targetPath: path.join(this.claudeDir, 'hooks', 'session-data.json'),
				defaultContent: { sessions: {}, lastUpdated: null }
			},
			{
				templatePath: path.join(templateDir, 'hooks', 'global-todos.json.template'),
				targetPath: path.join(this.claudeDir, 'hooks', 'global-todos.json'),
				defaultContent: { globalTodos: [], lastUpdated: null }
			}
		];

		for (const file of dataFiles) {
			try {
				// Only create if file doesn't exist (preserve existing data)
				if (!fs.existsSync(file.targetPath)) {
					let content: string;

					if (fs.existsSync(file.templatePath)) {
						// Use template if available
						content = fs.readFileSync(file.templatePath, 'utf8');
					} else {
						// Fallback to default content
						content = JSON.stringify(file.defaultContent, null, 2);
					}

					await vscode.workspace.fs.writeFile(
						vscode.Uri.file(file.targetPath),
						Buffer.from(content, 'utf8')
					);

					console.log(`CapyWorkspaceInitializer: Created data file: ${file.targetPath}`);
				} else {
					console.log(`CapyWorkspaceInitializer: Data file already exists: ${file.targetPath}`);
				}
			} catch (error) {
				throw new Error(`Failed to initialize data file ${file.targetPath}: ${error}`);
			}
		}
	}

	/**
	 * Configure settings from template
	 */
	async configureSettings(): Promise<void> {
		const templateDir = path.join(this.extensionPath, 'resources', 'claude-templates');
		const settingsTemplatePath = path.join(templateDir, 'settings.json.template');
		const settingsTargetPath = path.join(this.claudeDir, 'settings.json');

		try {
			// Only create if file doesn't exist (preserve existing settings)
			if (!fs.existsSync(settingsTargetPath)) {
				let content: string;

				if (fs.existsSync(settingsTemplatePath)) {
					content = fs.readFileSync(settingsTemplatePath, 'utf8');
				} else {
					// Fallback to minimal default settings
					const defaultSettings = {
						hooks: {
							UserPromptSubmit: [{ hooks: [{ type: 'command', command: '.claude/hooks/scripts/session-tracker.sh' }] }],
							PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: '.claude/hooks/scripts/session-tracker.sh' }] }],
							PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: '.claude/hooks/scripts/session-tracker.sh' }] }],
							Stop: [{ hooks: [{ type: 'command', command: '.claude/hooks/scripts/session-tracker.sh' }] }]
						}
					};
					content = JSON.stringify(defaultSettings, null, 4);
				}

				await vscode.workspace.fs.writeFile(
					vscode.Uri.file(settingsTargetPath),
					Buffer.from(content, 'utf8')
				);

				console.log('CapyWorkspaceInitializer: Settings configured successfully');
			} else {
				console.log('CapyWorkspaceInitializer: Settings file already exists');
			}
		} catch (error) {
			throw new Error(`Failed to configure settings: ${error}`);
		}
	}

	/**
	 * Validate the current installation
	 */
	async validateInstallation(): Promise<ValidationResult> {
		const result: ValidationResult = {
			isValid: true,
			missingComponents: [],
			corruptedFiles: [],
			permissionIssues: []
		};

		// Check required directories
		const requiredDirectories = [
			this.claudeDir,
			path.join(this.claudeDir, 'hooks'),
			path.join(this.claudeDir, 'hooks', 'scripts')
		];

		for (const dir of requiredDirectories) {
			if (!fs.existsSync(dir)) {
				result.missingComponents.push(`Directory: ${dir}`);
				result.isValid = false;
			}
		}

		// Check required files
		const requiredFiles = [
			path.join(this.claudeDir, 'hooks', 'scripts', 'session-tracker.sh'),
			path.join(this.claudeDir, 'hooks', 'session-data.json'),
			path.join(this.claudeDir, 'hooks', 'global-todos.json'),
			path.join(this.claudeDir, 'settings.json')
		];

		for (const file of requiredFiles) {
			if (!fs.existsSync(file)) {
				result.missingComponents.push(`File: ${file}`);
				result.isValid = false;
			} else {
				// Check if JSON files are valid
				if (file.endsWith('.json')) {
					try {
						const content = fs.readFileSync(file, 'utf8');
						JSON.parse(content);
					} catch (error) {
						result.corruptedFiles.push(`Invalid JSON: ${file}`);
						result.isValid = false;
					}
				}
			}
		}

		// Check permissions (Unix systems)
		if (process.platform !== 'win32') {
			const sessionTrackerPath = path.join(this.claudeDir, 'hooks', 'scripts', 'session-tracker.sh');
			if (fs.existsSync(sessionTrackerPath)) {
				try {
					const stats = fs.statSync(sessionTrackerPath);
					const isExecutable = (stats.mode & parseInt('111', 8)) > 0;
					if (!isExecutable) {
						result.permissionIssues.push(`Not executable: ${sessionTrackerPath}`);
						result.isValid = false;
					}
				} catch (error) {
					result.permissionIssues.push(`Cannot check permissions: ${sessionTrackerPath}`);
				}
			}
		}

		return result;
	}

	/**
	 * Repair partial or corrupted installations
	 */
	async repairPartialInstallation(): Promise<void> {
		console.log('CapyWorkspaceInitializer: Attempting repair...');

		const validation = await this.validateInstallation();

		// Recreate missing directories
		if (validation.missingComponents.some(c => c.startsWith('Directory:'))) {
			await this.ensureDirectoryStructure();
		}

		// Reinstall missing or corrupted files
		if (validation.missingComponents.some(c => c.includes('session-tracker.sh')) ||
			validation.permissionIssues.some(p => p.includes('session-tracker.sh'))) {
			await this.installHooksSystem();
		}

		// Reinitialize missing or corrupted data files
		if (validation.missingComponents.some(c => c.includes('.json')) ||
			validation.corruptedFiles.length > 0) {
			await this.initializeDataFiles();
		}

		// Reconfigure settings if needed
		if (validation.missingComponents.some(c => c.includes('settings.json'))) {
			await this.configureSettings();
		}

		// Final validation after repair
		const finalValidation = await this.validateInstallation();
		if (!finalValidation.isValid) {
			throw new Error(`Repair failed. Remaining issues: ${finalValidation.missingComponents.join(', ')}`);
		}

		console.log('CapyWorkspaceInitializer: Repair completed successfully');
	}
}
