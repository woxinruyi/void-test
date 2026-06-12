/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import * as ReactDOM from 'react-dom/client'
import { _registerServices } from './services.js';


import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';

export const mountFnGenerator = (Component: (params: any) => React.ReactNode) => (rootElement: HTMLElement, accessor: ServicesAccessor, props?: any) => {
	if (typeof document === 'undefined') {
		console.error('index.tsx error: document was undefined')
		return
	}

	// Registering services calls accessor.get(...) on every service eagerly; a single
	// unregistered service throws here. Without this guard the whole pane renders blank
	// with no message, so surface the error instead of failing silently.
	let disposables: IDisposable[] = []
	try {
		disposables = _registerServices(accessor)
	} catch (e) {
		console.error('Void mount error: failed to register services', e)
		rootElement.textContent = `加载失败：${e instanceof Error ? e.message : String(e)}`
		return
	}

	const root = ReactDOM.createRoot(rootElement)

	const rerender = (props?: any) => {
		root.render(<Component {...props} />); // tailwind dark theme indicator
	}
	const dispose = () => {
		root.unmount();
		disposables.forEach(d => d.dispose());
	}

	rerender(props)

	const returnVal = {
		rerender,
		dispose,
	}
	return returnVal
}
