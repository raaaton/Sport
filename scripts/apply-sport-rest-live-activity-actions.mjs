import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(projectRoot, 'node_modules/expo-widgets/package.json');
const appIntentPath = resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/AppIntent.swift');
const storeSourcePath = resolve(projectRoot, 'modules/sport-live-activity/SportRestTimerStore.swift');
const actionSourcePath = resolve(projectRoot, 'modules/sport-live-activity/SportRestTimerActionIntent.swift');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

if (packageJson.version !== '57.0.22') {
  throw new Error(`Expected expo-widgets 57.0.22, found ${packageJson.version}. Recheck the Sport Live Activity action patch.`);
}

let source = readFileSync(appIntentPath, 'utf8');
const storeSource = readFileSync(storeSourcePath, 'utf8');
const actionSource = readFileSync(actionSourcePath, 'utf8');
const markerStart = '// SPORT_REST_LIVE_ACTIVITY_ACTIONS_BEGIN';
const markerEnd = '// SPORT_REST_LIVE_ACTIVITY_ACTIONS_END';

const removeImports = (swiftSource) => swiftSource
  .replace(/^import (?:Foundation|SQLite3|ActivityKit|AppIntents)\s*\n/gm, '')
  .trim();

const nativeActions = `${markerStart}
${removeImports(storeSource)}

${removeImports(actionSource)}
${markerEnd}`;
const existingStart = source.indexOf(markerStart);
const existingEnd = source.indexOf(markerEnd);

if (existingStart !== -1 && existingEnd !== -1) {
  source = source.slice(0, existingStart) + nativeActions + source.slice(existingEnd + markerEnd.length);
} else if (existingStart !== -1 || existingEnd !== -1) {
  throw new Error('Found an incomplete Sport Live Activity action injection in expo-widgets AppIntent.swift.');
} else {
  source = `${source.trimEnd()}\n\n${nativeActions}\n`;
}

const requiredImports = ['import ActivityKit', 'import Foundation', 'import SQLite3'];
for (const requiredImport of requiredImports) {
  if (!source.split('\n').includes(requiredImport)) {
    source = `${requiredImport}\n${source}`;
  }
}

if (!source.includes('import AppIntents') ||
    !source.includes('struct SportRestTimerActionIntent: LiveActivityIntent') ||
    !source.includes('enum SportRestTimerStore') ||
    !source.includes('BEGIN IMMEDIATE') ||
    !source.includes('Activity<LiveActivityAttributes>.activities') ||
    !source.includes('props["restTimerId"] as? String == restTimerID') ||
    !source.includes('SportRestTimerStore.apply(') ||
    source.indexOf('SportRestTimerStore.apply(') > source.indexOf('await activity.update(')) {
  throw new Error('The Sport Live Activity native action patch was not applied completely.');
}

writeFileSync(appIntentPath, source);
