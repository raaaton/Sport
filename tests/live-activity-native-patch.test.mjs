import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patchScript = resolve(projectRoot, 'scripts/apply-sport-native-live-activity-layout.mjs');

async function generatePatchedWidget() {
  const tempProject = mkdtempSync(resolve(tmpdir(), 'sport-live-activity-patch-'));
  try {
    const scriptDirectory = resolve(tempProject, 'scripts');
    const widgetDirectory = resolve(tempProject, 'node_modules/expo-widgets/ios/Widgets');
    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(widgetDirectory, { recursive: true });
    writeFileSync(resolve(tempProject, 'node_modules/expo-widgets/package.json'), JSON.stringify({ version: '57.0.22' }));
    writeFileSync(
      resolve(widgetDirectory, 'WidgetLiveActivity.swift'),
      readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift')),
    );
    writeFileSync(resolve(scriptDirectory, 'apply-sport-native-live-activity-layout.mjs'), readFileSync(patchScript));

    const patchURL = pathToFileURL(resolve(scriptDirectory, 'apply-sport-native-live-activity-layout.mjs')).href;
    await import(`${patchURL}?run=${Date.now()}-${Math.random()}`);
    const firstPass = readFileSync(resolve(widgetDirectory, 'WidgetLiveActivity.swift'), 'utf8');
    await import(`${patchURL}?rerun=${Date.now()}-${Math.random()}`);
    const secondPass = readFileSync(resolve(widgetDirectory, 'WidgetLiveActivity.swift'), 'utf8');
    assert.equal(secondPass, firstPass, 'running the Expo layout patch twice must not change its output');
    return secondPass;
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }
}

async function generatePatchedActivitySources() {
  const tempProject = mkdtempSync(resolve(tmpdir(), 'sport-live-activity-actions-'));
  try {
    const scriptDirectory = resolve(tempProject, 'scripts');
    const packageIOSDirectory = resolve(tempProject, 'node_modules/expo-widgets/ios');
    const widgetDirectory = resolve(tempProject, 'node_modules/expo-widgets/ios/Widgets');
    const nativeSourceDirectory = resolve(tempProject, 'modules/sport-live-activity');
    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(packageIOSDirectory, { recursive: true });
    mkdirSync(widgetDirectory, { recursive: true });
    mkdirSync(nativeSourceDirectory, { recursive: true });
    writeFileSync(resolve(tempProject, 'node_modules/expo-widgets/package.json'), JSON.stringify({ version: '57.0.22' }));
    writeFileSync(
      resolve(packageIOSDirectory, 'ExpoWidgets.podspec'),
      readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios/ExpoWidgets.podspec')),
    );
    writeFileSync(
      resolve(widgetDirectory, 'WidgetLiveActivity.swift'),
      readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift')),
    );
    writeFileSync(
      resolve(widgetDirectory, 'AppIntent.swift'),
      readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/AppIntent.swift')),
    );
    for (const nativeModuleSource of ['LiveActivity.swift', 'LiveActivityFactory.swift']) {
      writeFileSync(
        resolve(packageIOSDirectory, nativeModuleSource),
        readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios', nativeModuleSource)),
      );
    }

    const patchScripts = [
      'apply-sport-native-live-activity-layout.mjs',
      'apply-sport-rest-live-activity-actions.mjs',
    ];
    for (const patchScriptName of patchScripts) {
      writeFileSync(resolve(scriptDirectory, patchScriptName), readFileSync(resolve(projectRoot, 'scripts', patchScriptName)));
    }
    for (const nativeSourceName of ['SportRestTimerStore.swift', 'SportRestActivityScheduler.swift', 'SportRestTimerActionIntent.swift']) {
      writeFileSync(resolve(nativeSourceDirectory, nativeSourceName), readFileSync(resolve(projectRoot, 'modules/sport-live-activity', nativeSourceName)));
    }

    for (const patchScriptName of patchScripts) {
      await import(`${pathToFileURL(resolve(scriptDirectory, patchScriptName)).href}?run=${Date.now()}-${Math.random()}`);
    }

    return {
      widget: readFileSync(resolve(widgetDirectory, 'WidgetLiveActivity.swift'), 'utf8'),
      intent: readFileSync(resolve(widgetDirectory, 'AppIntent.swift'), 'utf8'),
      factory: readFileSync(resolve(packageIOSDirectory, 'LiveActivityFactory.swift'), 'utf8'),
      liveActivity: readFileSync(resolve(packageIOSDirectory, 'LiveActivity.swift'), 'utf8'),
      podspec: readFileSync(resolve(packageIOSDirectory, 'ExpoWidgets.podspec'), 'utf8'),
    };
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }
}

test('Expo patch generates the compact Timer-like Sport rest presentation', async () => {
  const generated = await generatePatchedWidget();
  const compactLeading = generated.split('case "compactLeading":')[1]?.split('case "compactTrailing":')[0];
  const compactTrailing = generated.split('case "compactTrailing":')[1]?.split('case "minimal":')[0];
  const expandedLeading = generated.split('case "expandedLeading":')[1]?.split('case "expandedTrailing":')[0];
  const clock = generated.split('private struct SportRestClock: View {')[1]?.split('@available(iOS 16.1, *)\nprivate struct SportRestIslandSection')[0];
  const controls = generated.split('private struct SportRestControls: View {')[1]?.split('// SPORT_REST_LIVE_ACTIVITY_NATIVE_VIEWS_END')[0];

  assert.ok(compactLeading, 'generated compact leading region exists');
  assert.ok(compactTrailing, 'generated compact trailing region exists');
  assert.ok(expandedLeading, 'generated expanded leading region exists');
  assert.ok(clock, 'generated shared rest clock exists');
  assert.ok(controls, 'generated rest controls exist');
  assert.match(generated, /else if context\.state\.name == "SportRestCompletionActivity"/);
  assert.match(generated, /@available\(iOS 26\.0, \*\)\npublic struct WidgetLiveActivity: Widget/);
  assert.match(generated, /@available\(iOS 26\.0, \*\)\nprivate struct SportRestControls: View/);
  assert.doesNotMatch(generated, /@available\(iOS 16\.1, \*\)\n@available\(iOS 16\.1, \*\)/);
  assert.doesNotMatch(generated, /\.contentMargins\(\.horizontal,\s*2,\s*for:\s*\.compact(?:Leading|Trailing)\)/);
  assert.match(compactLeading, /Image\(systemName:\s*props\.state == "finished" \? "checkmark" : "timer"\)/);
  assert.doesNotMatch(compactLeading, /Text\("(?:Rest|REST|PAUSE)"\)/);
  assert.doesNotMatch(compactLeading, /\.frame\(width:|\.fixedSize\(/);
  assert.match(clock, /Text\(timerInterval:.*pauseTime:/s);
  assert.doesNotMatch(clock, /Text\(props\.pausedTime\)/);
  assert.match(compactTrailing, /SportRestClock\(props: props, size: 14\)[\s\S]*?\.frame\(width: 44, alignment: \.trailing\)/);
  assert.doesNotMatch(compactTrailing, /\.frame\(maxWidth: \.infinity/);
  assert.match(generated, /case "compactTrailing":[\s\S]*?SportRestClock\(props: props,/);
  assert.match(generated, /case "minimal":[\s\S]*?SportRestClock\(props: props,/);
  assert.doesNotMatch(generated, /Text\("R"\)/);
  assert.match(expandedLeading, /Text\(props\.statusLabel\)/);
  assert.doesNotMatch(expandedLeading, /Image\(systemName:\s*"timer"\)/);
  assert.match(generated, /case "paused":\s*"PAUSE"/);
  assert.match(generated, /default:\s*"Repos terminé"/);
  assert.match(generated, /case "expandedTrailing":/);
  assert.match(generated, /SportRestClock\(props: props, size: 30\)/);
  assert.doesNotMatch(generated, /Text\(props\.pausedTime\)/);
  assert.match(generated, /\.contentMargins\(\.all,\s*12,\s*for:\s*\.expanded\)/);
  assert.equal((generated.match(/\.contentMargins\(\.all,\s*12,\s*for:\s*\.expanded\)/g) ?? []).length, 2, 'expanded margins are applied once to each Island return path');
  assert.match(generated, /\.padding\(\.horizontal,\s*16\)/);
  assert.match(generated, /\.padding\(\.vertical,\s*12\)/);
  assert.equal((controls.match(/Button\(intent:/g) ?? []).length, 1, 'the activity has one Pause/Resume button');
  assert.match(controls, /minHeight:\s*44/);
  assert.doesNotMatch(controls, /action:\s*"skip"|Text\("Stop"\)/);
  assert.match(generated, /else \{\s*EmptyView\(\)\s*\}\s*\n\s*\}/);
});

test('Expo generated Live Activity connects Pause and Resume to the exact persisted timer and scheduled expiry', async () => {
  const { widget: generatedWidget, intent: generatedIntent, factory: generatedFactory, liveActivity: generatedLiveActivity, podspec: generatedPodspec } = await generatePatchedActivitySources();

  assert.match(generatedIntent, /struct SportRestTimerActionIntent: LiveActivityIntent/);
  assert.match(generatedIntent, /BEGIN IMMEDIATE/);
  assert.match(generatedIntent, /Activity<LiveActivityAttributes>\.activities/);
  assert.match(generatedIntent, /props\["restTimerId"\] as\? String == restTimerID/);
  assert.match(generatedWidget, /SportRestControls\(props: props, activityID: activityID\)/);
  assert.match(generatedWidget, /case "expandedBottom":[\s\S]*?SportRestControls\(props: props, activityID: activityID\)/);
  assert.match(generatedWidget, /props\.state == "paused" \? "resume" : "pause"/);
  assert.doesNotMatch(generatedWidget, /action:\s*"skip"|Text\("Stop"\)/);
  assert.match(generatedWidget, /SportRestLockScreen\(propsJSON: context\.state\.props, activityID: context\.activityID\)/);
  assert.match(generatedWidget, /SportRestIslandSection\(propsJSON: context\.state\.props, sectionName: sectionName, activityID: context\.activityID\)/);
  assert.match(generatedWidget, /SportRestControls\(props: props, activityID: activityID\)[\s\S]*?private struct SportRestControls/);

  const storeCommit = generatedIntent.indexOf('SportRestTimerStore.apply(');
  const scheduledExpiry = generatedIntent.indexOf('SportRestActivityScheduler.synchronize(');
  const activityMutation = generatedIntent.indexOf('await activity.update(');
  assert.ok(storeCommit !== -1 && scheduledExpiry > storeCommit && activityMutation > scheduledExpiry, 'scheduled expiry and ActivityKit updates must follow the SQLite transaction');
  assert.match(generatedIntent, /Activity<LiveActivityAttributes>\.activities\.first\(where: \{ \$0\.id == activityID \}\)/);
  assert.match(generatedIntent, /await activity\.end\(activity\.content, dismissalPolicy: \.immediate\)/);
  assert.match(generatedFactory, /SportRestActivityScheduler\.schedule\(/);
  assert.match(generatedLiveActivity, /SportRestActivityScheduler\.synchronize\(/);
  assert.match(generatedLiveActivity, /SportRestActivityScheduler\.cancelIfEarlyEnd\(/);
  assert.match(generatedIntent, /Activity<LiveActivityAttributes>\.request\([\s\S]*?alertConfiguration:[\s\S]*?start:/);
  assert.match(generatedIntent, /SportRestCompletionActivity/);
  assert.match(generatedIntent, /activityState == \.pending/);
  assert.match(generatedIntent, /relevanceScore:\s*100/);
  assert.match(generatedIntent, /completionFields\["state"\]\s*=\s*"finished"/);
  assert.doesNotMatch(generatedIntent, /completionFields\["restEndsAt"\]\s*=\s*NSNull\(\)/);
  assert.match(generatedIntent, /reportScheduleFailure\(error\)/);
  assert.match(generatedPodspec, /:ios\s*=>\s*'26\.0'/);
});

test('Sport targets iOS 26 for local scheduled Live Activity starts', () => {
  const appConfig = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8'));
  const workflow = readFileSync(resolve(projectRoot, '.github/workflows/build-ios.yml'), 'utf8');

  assert.equal(appConfig.expo.ios.deploymentTarget, '26.0');
  assert.match(workflow, /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*26\.0/);
});
