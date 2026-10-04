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

    await import(`${pathToFileURL(resolve(scriptDirectory, 'apply-sport-native-live-activity-layout.mjs')).href}?run=${Date.now()}-${Math.random()}`);
    return readFileSync(resolve(widgetDirectory, 'WidgetLiveActivity.swift'), 'utf8');
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }
}

async function generatePatchedActivitySources() {
  const tempProject = mkdtempSync(resolve(tmpdir(), 'sport-live-activity-actions-'));
  try {
    const scriptDirectory = resolve(tempProject, 'scripts');
    const widgetDirectory = resolve(tempProject, 'node_modules/expo-widgets/ios/Widgets');
    const nativeSourceDirectory = resolve(tempProject, 'modules/sport-live-activity');
    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(widgetDirectory, { recursive: true });
    mkdirSync(nativeSourceDirectory, { recursive: true });
    writeFileSync(resolve(tempProject, 'node_modules/expo-widgets/package.json'), JSON.stringify({ version: '57.0.22' }));
    writeFileSync(
      resolve(widgetDirectory, 'WidgetLiveActivity.swift'),
      readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift')),
    );
    writeFileSync(
      resolve(widgetDirectory, 'AppIntent.swift'),
      readFileSync(resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/AppIntent.swift')),
    );

    const patchScripts = [
      'apply-sport-native-live-activity-layout.mjs',
      'apply-sport-rest-live-activity-actions.mjs',
    ];
    for (const patchScriptName of patchScripts) {
      writeFileSync(resolve(scriptDirectory, patchScriptName), readFileSync(resolve(projectRoot, 'scripts', patchScriptName)));
    }
    for (const nativeSourceName of ['SportRestTimerStore.swift', 'SportRestTimerActionIntent.swift']) {
      writeFileSync(resolve(nativeSourceDirectory, nativeSourceName), readFileSync(resolve(projectRoot, 'modules/sport-live-activity', nativeSourceName)));
    }

    for (const patchScriptName of patchScripts) {
      await import(`${pathToFileURL(resolve(scriptDirectory, patchScriptName)).href}?run=${Date.now()}-${Math.random()}`);
    }

    return {
      widget: readFileSync(resolve(widgetDirectory, 'WidgetLiveActivity.swift'), 'utf8'),
      intent: readFileSync(resolve(widgetDirectory, 'AppIntent.swift'), 'utf8'),
    };
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }
}

test('Expo patch generates the compact Timer-like Sport rest presentation', async () => {
  const generated = await generatePatchedWidget();
  const compactLeading = generated.split('case "compactLeading":')[1]?.split('case "compactTrailing":')[0];
  const clock = generated.split('private struct SportRestClock: View {')[1]?.split('@available(iOS 16.1, *)\nprivate struct SportRestIslandSection')[0];

  assert.ok(compactLeading, 'generated compact leading region exists');
  assert.ok(clock, 'generated shared rest clock exists');
  assert.doesNotMatch(generated, /\.contentMargins\(\.horizontal,\s*2,\s*for:\s*\.compact(?:Leading|Trailing)\)/);
  assert.match(compactLeading, /Image\(systemName:\s*"timer"\)/);
  assert.match(compactLeading, /Text\("Rest"\)/);
  assert.doesNotMatch(compactLeading, /PAUSE|REST/);
  assert.doesNotMatch(compactLeading, /\.frame\(width:|\.fixedSize\(/);
  assert.match(clock, /Text\(timerInterval:.*pauseTime:/s);
  assert.doesNotMatch(clock, /Text\(props\.pausedTime\)/);
  assert.match(generated, /case "compactTrailing":\s*\n\s*SportRestClock\(props: props,/);
  assert.match(generated, /case "minimal":\s*\n\s*SportRestClock\(props: props,/);
  assert.doesNotMatch(generated, /Text\("R"\)/);
  assert.match(generated, /case "expandedTrailing":/);
  assert.match(generated, /Text\("Rest"\)/);
  assert.match(generated, /SportRestClock\(props: props, size: 30\)/);
  assert.doesNotMatch(generated, /PAUSE|Text\(props\.pausedTime\)/);
  assert.match(generated, /else \{\s*EmptyView\(\)\s*\}\s*\n\s*\}/);
});

test('Expo generated Live Activity connects Pause, Resume, and Stop to the exact persisted timer', async () => {
  const { widget: generatedWidget, intent: generatedIntent } = await generatePatchedActivitySources();

  assert.match(generatedIntent, /struct SportRestTimerActionIntent: LiveActivityIntent/);
  assert.match(generatedIntent, /BEGIN IMMEDIATE/);
  assert.match(generatedIntent, /Activity<LiveActivityAttributes>\.activities/);
  assert.match(generatedIntent, /props\["restTimerId"\] as\? String == restTimerID/);
  assert.match(generatedWidget, /#available\(iOS 17\.0, \*\)/);
  assert.match(generatedWidget, /SportRestControls\(props: props, activityID: activityID\)/);
  assert.match(generatedWidget, /case "expandedBottom":\s*\n\s*SportRestControls\(props: props, activityID: activityID\)/);
  assert.match(generatedWidget, /props\.state == "paused" \? "resume" : "pause"/);
  assert.match(generatedWidget, /action: "skip"/);
  assert.match(generatedWidget, /SportRestLockScreen\(propsJSON: context\.state\.props, activityID: context\.activityID\)/);
  assert.match(generatedWidget, /SportRestIslandSection\(propsJSON: context\.state\.props, sectionName: sectionName, activityID: context\.activityID\)/);
  assert.match(generatedWidget, /SportRestControls\(props: props, activityID: activityID\)[\s\S]*?private struct SportRestControls/);

  const storeCommit = generatedIntent.indexOf('SportRestTimerStore.apply(');
  const activityMutation = generatedIntent.indexOf('await activity.update(');
  assert.ok(storeCommit !== -1 && activityMutation > storeCommit, 'ActivityKit updates must follow the SQLite transaction');
  assert.match(generatedIntent, /Activity<LiveActivityAttributes>\.activities\.first\(where: \{ \$0\.id == activityID \}\)/);
  assert.match(generatedIntent, /await activity\.end\(activity\.content, dismissalPolicy: \.immediate\)/);
});
