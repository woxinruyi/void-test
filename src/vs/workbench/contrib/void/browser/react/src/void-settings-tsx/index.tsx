/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react'
import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { Settings } from './Settings.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'

// Wrap at the root so a render-time throw shows the error instead of a blank tab.
const SettingsRoot = (props: any) => (
	<ErrorBoundary>
		<Settings {...props} />
	</ErrorBoundary>
)

export const mountVoidSettings = mountFnGenerator(SettingsRoot)


