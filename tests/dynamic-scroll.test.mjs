import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { DYNAMIC_SCROLL_TOLERANCE, keyboardDismissScrollOffset, keyboardOverlap, shouldEnableScroll } from '../src/shared/ui/dynamicScrollMetrics.ts';

test('dynamic scroll stays disabled when content fits or is equal to the viewport', () => {
  assert.equal(shouldEnableScroll(700, 620), false);
  assert.equal(shouldEnableScroll(700, 700), false);
});

test('dynamic scroll ignores sub-tolerance layout noise and enables after real overflow', () => {
  assert.equal(shouldEnableScroll(700, 700 + DYNAMIC_SCROLL_TOLERANCE), false);
  assert.equal(shouldEnableScroll(700, 702), true);
});

test('dynamic scroll follows content changes in either direction', () => {
  const viewportHeight = 640;
  const initialContentHeight = 620;
  assert.equal(shouldEnableScroll(viewportHeight, initialContentHeight), false);

  const expandedContentHeight = 820;
  assert.equal(shouldEnableScroll(viewportHeight, expandedContentHeight), true);

  const collapsedContentHeight = 610;
  assert.equal(shouldEnableScroll(viewportHeight, collapsedContentHeight), false);
});

test('keyboard overlap uses the keyboard frame intersection with this scroll view', () => {
  assert.equal(keyboardOverlap({ top: 100, height: 700 }, { top: 600, height: 300 }), 200);
  assert.equal(keyboardOverlap({ top: 100, height: 500 }, { top: 650, height: 250 }), 0);
  assert.equal(keyboardOverlap({ top: 200, height: 500 }, { top: 400, height: 100 }), 100);
});

test('keyboard occlusion is measured against actual viewport geometry for scroll enablement', () => {
  const layoutScroll = (viewport, content, keyboardFrame) => {
    const covered = keyboardOverlap(viewport, keyboardFrame);
    return shouldEnableScroll(Math.max(0, viewport.height - covered), content);
  };
  const viewport = { top: 100, height: 700 };
  assert.equal(layoutScroll(viewport, 620, null), false);
  assert.equal(layoutScroll(viewport, 620, { top: 600, height: 300 }), true);
  assert.equal(layoutScroll(viewport, 620, { top: 740, height: 300 }), false);
  assert.equal(layoutScroll(viewport, 702, null), true);
});

test('keyboard dismissal restores the starting offset unless the user dragged while editing', () => {
  assert.equal(keyboardDismissScrollOffset(0, false), 0);
  assert.equal(keyboardDismissScrollOffset(120, false), 120);
  assert.equal(keyboardDismissScrollOffset(120, true), null);
  assert.equal(keyboardDismissScrollOffset(null, false), null);
  assert.equal(keyboardDismissScrollOffset(-8, false), -8);
});

test('DynamicScrollView keeps native keyboard insets and restores its saved offset after keyboard dismissal', () => {
  const dynamicScroll = readFileSync(new URL('../src/shared/ui/DynamicScrollView.tsx', import.meta.url), 'utf8');
  assert.match(dynamicScroll, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/);
  assert.match(dynamicScroll, /keyboardDidHide/);
  assert.match(dynamicScroll, /offsetBeforeKeyboardRef/);
  assert.match(dynamicScroll, /scrollTo\(\{ y: offset, animated: false \}\)/);
  assert.match(dynamicScroll, /setTimeout\(\(\) => \{/);
  assert.match(dynamicScroll, /bounces=\{scrollEnabled && keyboardCoveredHeight <= 0\}/);
  assert.match(dynamicScroll, /measureInWindow/);
  assert.match(dynamicScroll, /keyboardOverlap\(viewportFrame, nextFrame\)/);
  const numericField = readFileSync(new URL('../src/features/workout/components/NumericField.tsx', import.meta.url), 'utf8');
  assert.match(numericField, /onFocus=\{\(\) => \{ captureScrollOffset\(\); onFocus\?\.\(\); \}\}/);
});

test('workout entry uses a fixed screen and a compact keyboard layout instead of scrolling', () => {
  const appScreen = readFileSync(new URL('../src/shared/ui/AppScreen.tsx', import.meta.url), 'utf8');
  const workout = readFileSync(new URL('../src/features/workout/screens/WorkoutSessionScreen.tsx', import.meta.url), 'utf8');
  assert.match(appScreen, /if \(!scrollable\)[\s\S]*?<View style=\{\[styles\.staticContent/);
  assert.match(workout, /<AppScreen scrollable=\{false\} safeAreaEdges=\{\['top', 'bottom'\]\}>/);
  assert.match(workout, /<KeyboardAvoidingView/);
  assert.match(workout, /keyboardVisible && styles\.contentEditing/);
  assert.match(workout, /Keyboard\.dismiss\(\)/);
});

test('History, Progress, and Settings apply a visible title inside top safe area', () => {
  const history = readFileSync(new URL('../src/features/history/screens/HistoryScreen.tsx', import.meta.url), 'utf8');
  const progress = readFileSync(new URL('../src/features/progress/screens/ProgressScreen.tsx', import.meta.url), 'utf8');
  const placeholder = readFileSync(new URL('../src/shared/ui/FeaturePlaceholder.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/features/settings/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
  const settingsLayout = readFileSync(new URL('../app/(tabs)/settings/_layout.tsx', import.meta.url), 'utf8');
  assert.match(history, /safeAreaEdges=\{\['top'\]\}/);
  assert.match(history, />Historique</);
  assert.match(progress, /safeAreaEdges=\{\['top', 'bottom'\]\}/);
  assert.match(progress, />Progression</);
  assert.match(placeholder, /<AppText variant="largeTitle">\{title\}<\/AppText>/);
  assert.match(settings, /safeAreaEdges=\{\['top', 'bottom'\]\}/);
  assert.match(settings, />Réglages</);
  assert.match(settings, /Gérez votre programme/);
  assert.match(settingsLayout, /headerShown: false/);
});
