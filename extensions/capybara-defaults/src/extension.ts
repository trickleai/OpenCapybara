/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { CapyWorkspaceInitializer } from './core/CapyWorkspaceInitializer';

// Version the key so we can reset on upgrades if needed
const WORKSPACE_SETUP_KEY = 'capybara.hasSetupWorkspace.v2';

export function activate(context: vscode.ExtensionContext) {
	console.log('=== CAPYBARA DEFAULTS EXTENSION ACTIVATED ===');

	// Register command to close the sidebar
	context.subscriptions.push(
		vscode.commands.registerCommand('capybara.closeSidebar', () => {
			vscode.commands.executeCommand('workbench.action.closeSidebar');
		}),
	);

	// Register command to open current folder in Finder
	context.subscriptions.push(
		vscode.commands.registerCommand('capybara.openInFinder', () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				const folderPath = workspaceFolders[0].uri.fsPath;
				exec(`open '${folderPath}'`, (error) => {
					if (error) {
						console.error('Failed to open in Finder:', error);
						vscode.window.showErrorMessage(
							`Failed to open in Finder: ${error.message}`,
						);
					}
				});
			} else {
				vscode.window.showInformationMessage('No workspace folder open');
			}
		}),
	);

	// Debug command to reset workspace setup (for testing)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'capybara.resetWorkspaceSetup',
			async () => {
				await context.globalState.update(WORKSPACE_SETUP_KEY, false);
				vscode.window.showInformationMessage(
					'Workspace setup reset. Reload window to test.',
				);
			},
		),
	);

	// Debug command to repair .claude directory
	context.subscriptions.push(
		vscode.commands.registerCommand('capybara.repairClaudeDirectory', async () => {
			try {
				vscode.window.showInformationMessage('Repairing .claude directory...');
				const initializer = new CapyWorkspaceInitializer(context.extensionPath);
				const initResult = await initializer.initialize();

				if (initResult.success) {
					vscode.window.showInformationMessage(`Repair completed: ${initResult.message}`);
				} else {
					vscode.window.showErrorMessage(`Repair failed: ${initResult.message}`);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Repair failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		})
	);

	// Check workspace state and decide what to do
	handleWorkspaceSetup(context);
}

/**
 * Handle workspace setup logic
 */
async function handleWorkspaceSetup(context: vscode.ExtensionContext) {
	const hasSetupWorkspace = context.globalState.get<boolean>(
		WORKSPACE_SETUP_KEY,
		false,
	);
	const hasWorkspaceOpen =
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0;
	const workspaceDir = path.join(os.homedir(), 'CapyWorkspace');
	const workspaceExists = fs.existsSync(workspaceDir);

	console.log('Capybara: hasSetupWorkspace =', hasSetupWorkspace);
	console.log('Capybara: hasWorkspaceOpen =', hasWorkspaceOpen);
	console.log('Capybara: workspaceDir =', workspaceDir);
	console.log('Capybara: workspaceExists =', workspaceExists);


	// Case 1: Workspace is already open - initialize UI and ensure .claude directory
	if (hasWorkspaceOpen) {
		console.log('Capybara: Workspace already open, initializing UI');
		await createDefaultSettings(workspaceDir);

		initializeForReturningUser(context);

		// Ensure .claude directory is properly initialized even for existing workspaces
		ensureClaudeDirectoryInitialized(context);
		return;
	}

	// Case 2: No workspace open, but CapyWorkspace folder exists - open it
	if (workspaceExists) {
		console.log('Capybara: CapyWorkspace exists, opening it');
		await createDefaultSettings(workspaceDir);

		await context.globalState.update(WORKSPACE_SETUP_KEY, true);
		const workspaceUri = vscode.Uri.file(workspaceDir);
		await vscode.commands.executeCommand(
			'vscode.openFolder',
			workspaceUri,
			false,
		);
		return;
	}

	// Case 3: First time - create and open CapyWorkspace
	console.log('Capybara: First launch detected, creating workspace');
	await setupWorkspaceAutomatic(context);
}

/**
 * Create default .vscode/settings.json in workspace
 */
async function createDefaultSettings(workspaceDir: string) {
	try {
		const vscodeDir = path.join(workspaceDir, '.vscode');
		const settingsFile = path.join(vscodeDir, 'settings.json');

		// Create .vscode directory
		if (!fs.existsSync(vscodeDir)) {
			fs.mkdirSync(vscodeDir, { recursive: true });
			console.log('Capybara: Created .vscode directory');
		}

		// Check if settings.json already exists
		if (fs.existsSync(settingsFile) && fs.readFileSync(settingsFile, 'utf8').includes('capybara.settings')) {
			console.log('Capybara: settings.json already exists, skipping');
			return;
		}

		// Default Claude Code settings - AWS credentials moved to dashboard settings
		const settings = {
			'claudeCode.selectedModel': '',
			'claudeCode.environmentVariables': [
				{
					'name': 'AWS_BEARER_TOKEN_BEDROCK',
					'value': ''
				},
				{
					'name': 'AWS_REGION',
					'value': 'us-east-1'
				},
				{
					'name': 'BEDROCK_MODEL_ID',
					'value': ''
				},
				{
					'name': 'CLAUDE_CODE_USE_BEDROCK',
					'value': '1'
				}
			],
			'capybara.settings': {}
		};

		// Write settings file
		fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 4), 'utf-8');
		console.log('Capybara: Created default settings.json');
	} catch (error) {
		console.error('Capybara: Failed to create settings.json:', error);
		// Don't throw - let workspace creation continue
	}
}

/**
 * Automatically create and open a workspace folder for first-time users
 */
async function setupWorkspaceAutomatic(context: vscode.ExtensionContext) {
	try {
		const workspaceDir = path.join(os.homedir(), 'CapyWorkspace');
		const workspaceUri = vscode.Uri.file(workspaceDir);

		console.log('Capybara: Creating workspace at:', workspaceDir);

		// Create the workspace directory (mkdirp semantics - won't fail if exists)
		await vscode.workspace.fs.createDirectory(workspaceUri);
		console.log('Capybara: Workspace directory created successfully');

		// Create .vscode directory and settings.json
		await createDefaultSettings(workspaceDir);

		// Initialize .claude directory structure and hooks system
		console.log('Capybara: Initializing .claude directory...');
		const initializer = new CapyWorkspaceInitializer(context.extensionPath);
		const initResult = await initializer.initialize();

		if (!initResult.success) {
			console.error('Capybara: .claude initialization failed:', initResult.message);
			vscode.window.showWarningMessage(`Workspace created but .claude setup incomplete: ${initResult.message}`);
		} else {
			console.log('Capybara: .claude initialization completed:', initResult.message);
		}

		// Mark setup as complete
		await context.globalState.update(WORKSPACE_SETUP_KEY, true);

		// Open the workspace folder
		console.log('Capybara: Opening workspace folder...');
		await vscode.commands.executeCommand(
			'vscode.openFolder',
			workspaceUri,
			false,
		);
	} catch (error) {
		console.error('Capybara: Workspace setup failed:', error);
		vscode.window.showErrorMessage(
			'Failed to create workspace folder. Please open a folder manually.',
		);
	}
}

/**
 * Ensure .claude directory is initialized for existing workspaces (runs in background)
 */
async function ensureClaudeDirectoryInitialized(context: vscode.ExtensionContext) {
	try {
		console.log('Capybara: Ensuring .claude directory is initialized...');
		const initializer = new CapyWorkspaceInitializer(context.extensionPath);
		const initResult = await initializer.initialize();

		if (!initResult.success) {
			console.error('Capybara: .claude initialization failed:', initResult.message);
			// Don't show error message to user for background initialization
		} else {
			console.log('Capybara: .claude directory verified/initialized:', initResult.message);
		}
	} catch (error) {
		console.error('Capybara: Background .claude initialization failed:', error);
		// Silent failure for background initialization
	}
}

/**
 * Initialize UI for users who have already set up workspace
 */
function initializeForReturningUser(context: vscode.ExtensionContext) {
	const showDeveloperFeatures = vscode.workspace
		.getConfiguration('capybara')
		.get<boolean>('showDeveloperFeatures', false);

	if (!showDeveloperFeatures) {
		// Initialize Capybara UI immediately since onStartupFinished means UI is ready
		initializeCapybaraUI(context);

		// Also run after a delay as backup
		setTimeout(() => initializeCapybaraUI(context), 1500);
	}

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(
			(e: vscode.ConfigurationChangeEvent) => {
				if (e.affectsConfiguration('capybara.showDeveloperFeatures')) {
					const newValue = vscode.workspace
						.getConfiguration('capybara')
						.get<boolean>('showDeveloperFeatures', false);
					if (!newValue) {
						initializeCapybaraUI(context);
					}
				}
			},
		),
		vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			if (e.affectsConfiguration('capybara.showDeveloperFeatures')) {
				const newValue = vscode.workspace.getConfiguration('capybara').get<boolean>('showDeveloperFeatures', false);
				if (!newValue) {
					initializeCapybaraUI(context);
				}
			}
		})
	);
}

async function initializeCapybaraUI(_context: vscode.ExtensionContext) {
	// Close bottom panel
	await vscode.commands.executeCommand('workbench.action.closePanel').then(() => { }, () => { });

	// Hide developer Activity Bar views
	const viewsToHide = [
		'workbench.view.scm.removeFromSidebar',
		'workbench.view.extensions.removeFromSidebar',
		'workbench.view.debug.removeFromSidebar',
		'workbench.view.testing.removeFromSidebar',
		'outline.removeFromSidebar',
		'timeline.removeFromSidebar',
	];

	for (const cmd of viewsToHide) {
		try {
			await vscode.commands.executeCommand(cmd);
		} catch (e) {
			/* ignore */
		}
	}

	// Hide the left sidebar (Primary Side Bar)
	await vscode.commands.executeCommand('workbench.action.closeSidebar').then(() => { }, () => { });

	// Open Claude Code and close Welcome editors
	await openChatEditor();

	// Focus on the Agent Dashboard in auxiliary bar (right side)
	try {
		await vscode.commands.executeCommand('capybara.agentDashboard.focus');
	} catch (e) {
		// Agent extension might not be loaded yet
	}
}

async function openChatEditor() {
	try {
		// Close any Welcome page editors first
		const tabGroups = vscode.window.tabGroups;
		let hasRestoredTabs = false;

		for (const group of tabGroups.all) {
			for (const tab of group.tabs) {
				// Check if this is a Welcome tab (gettingStarted editor)
				if (tab.label === 'Welcome' || tab.label === 'Get Started') {
					await vscode.window.tabGroups.close(tab);
				} else {
					// There are other tabs (restored from previous session)
					hasRestoredTabs = true;
				}
			}
		}

		// Only open Claude Code if there are no restored tabs
		if (!hasRestoredTabs) {
			// Use Claude Code as the default chat interface
			await vscode.commands.executeCommand('claude-vscode.editor.open');
		}
	} catch (e) {
		console.log('Could not open Claude Code editor:', e);
	}
}

export function deactivate() {
	console.log('Capybara Defaults extension deactivated');
}
