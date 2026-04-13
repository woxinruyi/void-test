/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

export type SupportedLocale = 'en' | 'zh-cn';

export interface TranslationKeys {
	// Onboarding Page 0
	'onboarding.welcome': string;
	'onboarding.getStarted': string;
	// Onboarding Page 1 — Add Providers
	'onboarding.addProvider': string;
	'onboarding.free': string;
	'onboarding.paid': string;
	'onboarding.local': string;
	'onboarding.cloudOther': string;
	'onboarding.freeDesc': string;
	'onboarding.paidDesc': string;
	'onboarding.localDesc': string;
	'onboarding.cloudOtherDesc': string;
	'onboarding.add': string;
	'onboarding.models': string;
	'onboarding.localModelsAutoDetect': string;
	'onboarding.chatModelRequired': string;
	'onboarding.next': string;
	'onboarding.back': string;
	'onboarding.nextTooltip': string;
	// Onboarding Page 1 — Feature names
	'onboarding.featureChat': string;
	'onboarding.featureQuickEdit': string;
	'onboarding.featureAutocomplete': string;
	'onboarding.featureFastApply': string;
	'onboarding.featureSourceControl': string;
	// Onboarding Page 2 — Settings & Themes
	'onboarding.settingsAndThemes': string;
	'onboarding.transferSettings': string;
	'onboarding.enterTheVoid': string;
	// Shared
	'common.yes': string;
	'common.no': string;
	'common.yesStar': string;
}
