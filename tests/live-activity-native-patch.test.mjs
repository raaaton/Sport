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
