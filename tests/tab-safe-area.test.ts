import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import type { ReactElement } from 'react';
import ts from 'typescript';

import { palette } from '../lib/theme.ts';

// Exercise the options the real layout passes to Expo Router. Native modules
// cannot load in Node; this checks the inset contract, not Android rendering.
function tabBarStyle(bottom: number) {
  const filename = fileURLToPath(new URL('../app/(tabs)/_layout.tsx', import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const nativeRequire = createRequire(import.meta.url);
  const replacements: Record<string, unknown> = {
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { Tabs: Object.assign(() => null, { Screen: () => null }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, right: 0, bottom, left: 0 }) },
    '@/components/haptic-tab': { HapticTab: () => null },
    '@/lib/theme': { palette },
  };
  const module = { exports: {} as { default: () => ReactElement<{ screenOptions: { tabBarStyle: { height: number; paddingBottom: number } } }> } };
  new Function('require', 'module', 'exports', source)(
    (name: string) => replacements[name] ?? nativeRequire(name), module, module.exports,
  );
  return module.exports.default().props.screenOptions.tabBarStyle;
}

test('tab controls remain above gesture and three-button navigation without losing their usable height', () => {
  const baseline = tabBarStyle(0);
  for (const bottom of [24, 34, 48]) {
    const style = tabBarStyle(bottom);
    assert.ok(style.paddingBottom >= bottom, `bottom inset ${bottom} must be reserved`);
    assert.equal(style.height - style.paddingBottom, baseline.height - baseline.paddingBottom);
    assert.equal(style.height - baseline.height, bottom);
  }
});
