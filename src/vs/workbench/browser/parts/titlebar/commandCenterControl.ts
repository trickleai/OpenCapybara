/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Capybara: Simplified Command Center - shows folder name with dropdown menu

import { reset } from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { WindowTitle } from './windowTitle.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export class CommandCenterControl {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChangeVisibility = this._disposables.add(new Emitter<void>());
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	readonly element: HTMLElement = document.createElement('div');

	private _isMenuOpen = false;

	constructor(
		windowTitle: WindowTitle,
		hoverDelegate: IHoverDelegate,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ICommandService private readonly _commandService: ICommandService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		this.element.classList.add('command-center');

		// Capybara: Create a simple clickable element that shows folder name
		const container = document.createElement('div');
		container.className = 'command-center-center';
		container.style.cursor = 'pointer';
		container.style.display = 'flex';
		container.style.alignItems = 'center';
		container.style.gap = '6px';
		container.style.padding = '0 12px';
		container.style.height = '100%';

		// Folder icon
		const folderIcon = renderIcon(Codicon.folderOpened);
		folderIcon.style.opacity = '0.8';

		// Label element
		const labelElement = document.createElement('span');
		labelElement.className = 'search-label';
		labelElement.style.opacity = '0.9';

		const updateLabel = () => {
			const workspaceName = windowTitle.workspaceName;
			labelElement.textContent = workspaceName || localize('openFolder', "Open Folder");
		};

		updateLabel();
		reset(container, folderIcon, labelElement);

		// Update when window title changes
		this._disposables.add(windowTitle.onDidChange(() => {
			updateLabel();
		}));

		// Hover tooltip
		const _hoverDelegate = hoverDelegate ?? getDefaultHoverDelegate('mouse');
		this._disposables.add(this._hoverService.setupManagedHover(_hoverDelegate, container, localize('clickForOptions', "Click for folder options")));

		// Click handler - show dropdown menu with options
		// Use mouseup instead of click for more reliable behavior
		let mouseDownTime = 0;
		container.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			mouseDownTime = Date.now();
		});
		container.addEventListener('mouseup', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Only trigger if mousedown was recent (within 500ms) to avoid accidental triggers
			if (Date.now() - mouseDownTime < 500 && !this._isMenuOpen) {
				// Small delay to ensure UI is ready
				setTimeout(() => this._showFolderMenu(), 100);
			}
		});

		this.element.appendChild(container);
	}

	private _showFolderMenu(): void {
		if (this._isMenuOpen) {
			return;
		}

		this._isMenuOpen = true;
		const workspace = this._workspaceContextService.getWorkspace();
		const hasWorkspace = workspace.folders.length > 0;

		interface FolderMenuItem extends IQuickPickItem {
			action: string;
		}

		const items: FolderMenuItem[] = [
			{
				label: `$(file-submodule) ${localize('showExplorer', "Show Explorer")}`,
				description: localize('showExplorerDesc', "Open sidebar file explorer"),
				action: 'showExplorer'
			},
			{
				label: `$(folder-opened) ${localize('openInFinder', "Open in Finder")}`,
				description: hasWorkspace ? localize('openInFinderDesc', "Reveal folder in Finder") : localize('noFolder', "No folder open"),
				action: 'openInFinder'
			},
			{
				label: `$(folder) ${localize('switchFolder', "Switch Folder...")}`,
				description: localize('switchFolderDesc', "Open a different folder"),
				action: 'switchFolder'
			}
		];

		this._quickInputService.pick(items, {
			placeHolder: localize('folderActions', "Folder Actions"),
		}).then(selected => {
			this._isMenuOpen = false;

			if (!selected) {
				return;
			}

			// Use setTimeout to ensure menu is fully closed before executing action
			setTimeout(() => {
				switch (selected.action) {
					case 'showExplorer':
						this._commandService.executeCommand('workbench.view.explorer');
						break;
					case 'openInFinder':
						if (hasWorkspace) {
							// Use capybara.openInFinder command from capybara-defaults extension
							this._commandService.executeCommand('capybara.openInFinder');
						}
						break;
					case 'switchFolder':
						this._commandService.executeCommand('workbench.action.files.openFolder');
						break;
				}
			}, 50);
		}, () => {
			this._isMenuOpen = false;
		});
	}

	dispose(): void {
		this._disposables.dispose();
	}
}
