import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(projectRoot, 'node_modules/expo-widgets/package.json');
const podspecPath = resolve(projectRoot, 'node_modules/expo-widgets/ios/ExpoWidgets.podspec');
const appIntentPath = resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/AppIntent.swift');
const liveActivityPath = resolve(projectRoot, 'node_modules/expo-widgets/ios/LiveActivity.swift');
const liveActivityFactoryPath = resolve(projectRoot, 'node_modules/expo-widgets/ios/LiveActivityFactory.swift');
const storeSourcePath = resolve(projectRoot, 'modules/sport-live-activity/SportRestTimerStore.swift');
const schedulerSourcePath = resolve(projectRoot, 'modules/sport-live-activity/SportRestActivityScheduler.swift');
const actionSourcePath = resolve(projectRoot, 'modules/sport-live-activity/SportRestTimerActionIntent.swift');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

if (packageJson.version !== '57.0.22') {
  throw new Error(`Expected expo-widgets 57.0.22, found ${packageJson.version}. Recheck the Sport Live Activity action patch.`);
}

let podspec = readFileSync(podspecPath, 'utf8');
const oldPlatform = ":ios => '16.4'";
const newPlatform = ":ios => '26.0'";
if (podspec.includes(oldPlatform)) {
  podspec = podspec.replace(oldPlatform, newPlatform);
}
if (!podspec.includes(newPlatform)) {
  throw new Error('Could not set the ExpoWidgets pod minimum to iOS 26 for the scheduled ActivityKit API.');
}

let source = readFileSync(appIntentPath, 'utf8');
const storeSource = readFileSync(storeSourcePath, 'utf8');
const schedulerSource = readFileSync(schedulerSourcePath, 'utf8');
const actionSource = readFileSync(actionSourcePath, 'utf8');
const markerStart = '// SPORT_REST_LIVE_ACTIVITY_ACTIONS_BEGIN';
const markerEnd = '// SPORT_REST_LIVE_ACTIVITY_ACTIONS_END';

const removeImports = (swiftSource) => swiftSource
  .replace(/^import (?:Foundation|SQLite3|ActivityKit|AppIntents)\s*\n/gm, '')
  .trim();

const nativeActions = `${markerStart}
${removeImports(storeSource)}

${removeImports(schedulerSource)}

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
    !source.includes('enum SportRestActivityScheduler') ||
    !source.includes('enum SportRestTimerStore') ||
    !source.includes('BEGIN IMMEDIATE') ||
    !source.includes('Activity<LiveActivityAttributes>.activities') ||
    !source.includes('props["restTimerId"] as? String == restTimerID') ||
    !source.includes('SportRestTimerStore.apply(') ||
    source.indexOf('SportRestTimerStore.apply(') > source.indexOf('await activity.update(')) {
  throw new Error('The Sport Live Activity native action patch was not applied completely.');
}

let factorySource = readFileSync(liveActivityFactoryPath, 'utf8');
const factoryMarker = '// SPORT_REST_EXPIRY_SCHEDULER_FACTORY';
const factoryBefore = '      let instance = LiveActivity(id: activity.id, name: name)';
const factoryAfter = `      if name == "SportRestActivity" {
        do {
          try SportRestActivityScheduler.schedule(activityName: name, propsJSON: props, url: url?.absoluteString, staleDate: staleDate)
        } catch {
          SportRestActivityScheduler.reportScheduleFailure(error)
        }
      }
${factoryBefore}`;
if (!factorySource.includes(factoryMarker)) {
  if (!factorySource.includes(factoryBefore)) {
    throw new Error('Could not locate the Expo LiveActivityFactory start result.');
  }
  factorySource = factorySource.replace(factoryBefore, `${factoryMarker}\n${factoryAfter}`);
}
if (!factorySource.includes('SportRestActivityScheduler.schedule(activityName: name, propsJSON: props, url: url?.absoluteString, staleDate: staleDate)')) {
  throw new Error('The Sport scheduled expiry start hook was not applied.');
}

let liveActivitySource = readFileSync(liveActivityPath, 'utf8');
const updateMarker = '// SPORT_REST_EXPIRY_SCHEDULER_UPDATE';
const updateBefore = '    await activity.update(ActivityContent(state: newState, staleDate: staleDate))';
const updateAfter = `${updateBefore}
    ${updateMarker}
    await SportRestActivityScheduler.synchronize(activityName: name, propsJSON: props, url: activity.attributes.url, staleDate: staleDate)`;
if (!liveActivitySource.includes(updateMarker)) {
  if (!liveActivitySource.includes(updateBefore)) {
    throw new Error('Could not locate the Expo LiveActivity update call.');
  }
  liveActivitySource = liveActivitySource.replace(updateBefore, updateAfter);
}
const endBefore = '    let content: ActivityContent<LiveActivityAttributes.ContentState>?';
const endMarker = '// SPORT_REST_EXPIRY_SCHEDULER_EARLY_END';
const endAfter = `${endMarker}
    await SportRestActivityScheduler.cancelIfEarlyEnd(propsJSON: activity.content.state.props, activityName: activity.content.state.name)

${endBefore}`;
if (!liveActivitySource.includes(endMarker)) {
  if (!liveActivitySource.includes(endBefore)) {
    throw new Error('Could not locate the Expo LiveActivity end content path.');
  }
  liveActivitySource = liveActivitySource.replace(endBefore, endAfter);
}
if (!liveActivitySource.includes(updateMarker) || !liveActivitySource.includes(endMarker)) {
  throw new Error('The Sport scheduled expiry update/end hooks were not applied.');
}

writeFileSync(liveActivityFactoryPath, factorySource);
writeFileSync(liveActivityPath, liveActivitySource);
writeFileSync(appIntentPath, source);
writeFileSync(podspecPath, podspec);
