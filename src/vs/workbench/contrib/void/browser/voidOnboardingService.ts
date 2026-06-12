/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { mountVoidOnboarding } from './react/out/void-onboarding/index.js'
import { h, getActiveWindow } from '../../../../base/browser/dom.js';

// Onboarding contribution that mounts the component at startup.
// 窗口拖动由 Chromium 原生 `-webkit-app-region: drag` / `no-drag` 机制负责（见
// `src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css` 中的 `.titlebar-drag-region`），
// 本服务不再创建自定义拖动覆盖层，避免遮挡原生 hit-test。
export class OnboardingContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.voidOnboarding';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.initialize();
	}

	private initialize(): void {
		// Get the active window reference for multi-window support
		const targetWindow = getActiveWindow();

		// Find the monaco-workbench element using the proper window reference
		const workbench = targetWindow.document.querySelector('.monaco-workbench');

		if (workbench) {

			const onboardingContainer = h('div.void-onboarding-container').root;
			onboardingContainer.style.position = 'fixed';
			onboardingContainer.style.top = '0';
			onboardingContainer.style.left = '0';
			onboardingContainer.style.right = '0';
			onboardingContainer.style.bottom = '0';
			onboardingContainer.style.zIndex = '99998';
			onboardingContainer.style.pointerEvents = 'none'; // let children control pointer events
			workbench.appendChild(onboardingContainer);

			this.instantiationService.invokeFunction((accessor: ServicesAccessor) => {
				const result = mountVoidOnboarding(onboardingContainer, accessor);
				if (result && typeof result.dispose === 'function') {
					this._register(toDisposable(result.dispose));
				}
			});
			// Register cleanup for the DOM element
			this._register(toDisposable(() => {
				if (onboardingContainer.parentElement) {
					onboardingContainer.parentElement.removeChild(onboardingContainer);
				}
			}));
		}
	}
}

// Register the contribution to be initialized during the AfterRestored phase
registerWorkbenchContribution2(OnboardingContribution.ID, OnboardingContribution, WorkbenchPhase.AfterRestored);
