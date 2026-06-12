/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

export type FileOpKind = 'edit' | 'create' | 'delete' | 'command'

export interface FileOp {
	kind: FileOpKind
	uri?: string           // file URI string (absent for command)
	beforeHash?: string    // content hash before (for edit/delete)
	afterHash?: string     // content hash after (for edit/create)
	command?: string       // command string (for command kind)
	cwd?: string           // working directory (for command kind)
	revertable?: boolean   // false for commands
}

export interface TurnManifest {
	turnId: string
	threadId: string
	name: string           // first line of user message
	createdAt: string      // ISO timestamp
	committedAt?: string   // ISO timestamp
	status: 'pending' | 'committed' | 'aborted'
	userMessage: string
	fileOps: FileOp[]
}

export interface TurnSummary {
	turnId: string
	threadId: string
	name: string
	createdAt: string
	status: TurnManifest['status']
	fileOpCount: number
	hasUnrevertableOps: boolean
}

export interface RevertResult {
	revertedTurns: string[]
	filesRestored: number
	filesDeleted: number
	unrevertableCommands: string[]
	conflicts: { uri: string, reason: string }[]
}
