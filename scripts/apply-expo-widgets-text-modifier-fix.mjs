import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(projectRoot, 'node_modules/expo-widgets/package.json');
const sourcePath = resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/DynamicView.swift');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

if (packageJson.version !== '57.0.22') {
  throw new Error(`Expected expo-widgets 57.0.22, found ${packageJson.version}. Recheck the native Text modifier patch.`);
}

let source = readFileSync(sourcePath, 'utf8');
const unpatchedCall = 'render(TextView.self, TextViewProps.self, updateProps: updateChildren)';
const patchedCall = [
  'render(',
  '        TextView.self,',
  '        TextViewProps.self,',
  '        updateProps: updateChildren,',
  '        wrapInUIBaseView: false',
  '      )',
].join('\n');

if (!source.includes('wrapInUIBaseView: Bool = true')) {
  if (!source.includes(unpatchedCall)) {
    throw new Error('Could not locate the expected expo-widgets Text rendering implementation.');
  }

  source = source.replace(unpatchedCall, patchedCall);
  source = source.replace(
    'private func render<P, V>(_ viewType: V.Type, _ propsType: P.Type, updateProps: ((_ initialProps: P) throws -> Void)? = nil) -> some View',
    [
      'private func render<P, V>(',
      '    _ viewType: V.Type,',
      '    _ propsType: P.Type,',
      '    updateProps: ((_ initialProps: P) throws -> Void)? = nil,',
      '    wrapInUIBaseView: Bool = true',
      '  ) -> some View',
    ].join('\n'),
  );
  source = source.replace(
    '          return AnyView(UIBaseView<P, V>(props: props).transition(.identity))',
    [
      '          if wrapInUIBaseView {',
      '            return AnyView(UIBaseView<P, V>(props: props).transition(.identity))',
      '          }',
      '          return AnyView(V(props: props).transition(.identity))',
    ].join('\n'),
  );
}

if (!source.includes('wrapInUIBaseView: false') || !source.includes('return AnyView(V(props: props).transition(.identity))')) {
  throw new Error('The expo-widgets Text modifier fix was not applied completely.');
}

writeFileSync(sourcePath, source);
