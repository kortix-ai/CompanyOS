/**
 * KRTX-5256: a flick in the artifact viewer keeps scrolling after the finger
 * lifts on iOS. The viewer renders through react-native-webview's real iOS
 * component; only React Native and the native view are host stubs, so the
 * test reads the props the native `RNCWebView` receives.
 *
 * Under the new architecture an unset `decelerationRate` reaches the native
 * view as the codegen default 0, and react-native-webview 14.0.1 writes that
 * rate to the WKWebView scroll view on every drag: no momentum at all. The
 * patch (`patches/react-native-webview+14.0.1.patch`) sends UIKit's normal
 * rate, 0.998, when the caller sets none.
 */
import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { dirname, join } from 'node:path';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

type HostProps = React.PropsWithChildren<Record<string, unknown>>;
const host =
  (name: string) =>
  ({ children, ...props }: HostProps) =>
    React.createElement(name, props, children);

const RNCWebView = host('rnc-webview');
const webviewSrc = join(
  dirname(Bun.resolveSync('react-native-webview/package.json', import.meta.dir)),
  'src'
);

// Every name react-native-webview imports; only View, Image and StyleSheet run here.
mock.module('react-native', () => ({
  View: host('view'),
  Text: host('text'),
  ActivityIndicator: host('spinner'),
  Linking: {},
  Image: { resolveAssetSource: (source: unknown) => source },
  Platform: { OS: 'ios' },
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
mock.module(join(webviewSrc, 'RNCWebViewNativeComponent.ts'), () => ({
  default: RNCWebView,
  Commands: {},
}));
mock.module(join(webviewSrc, 'NativeRNCWebViewModule.ts'), () => ({
  default: { shouldStartLoadWithLockIdentifier: () => undefined },
}));
mock.module('@/components/kortix/kortix-loader', () => ({ KortixLoader: host('loader') }));
mock.module('@/lib/artifacts/open-artifact-link', () => ({ openArtifactLink: () => false }));
mock.module('@/lib/logger', () => ({ log: { warn: () => undefined } }));
mock.module('@/lib/utils/open-link', () => ({ openLink: async () => undefined }));
mock.module('@/lib/utils/resolve-local-url', () => ({ resolveLocalUrl: (url: string) => url }));

let ArtifactWebView: typeof import('./ArtifactWebView').ArtifactWebView;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Metro resolves the platform file; Bun does not, so the iOS component stands in for the package.
  const ios = await import(join(webviewSrc, 'WebView.ios.tsx'));
  mock.module('react-native-webview', () => ({ WebView: ios.default }));
  ({ ArtifactWebView } = await import('./ArtifactWebView'));
});

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

const nativeWebView = () => {
  act(() => {
    tree = create(
      <ArtifactWebView
        viewUrl="https://api.example.test/v1/artifacts/s/token/"
        background="white"
        bottomInset={34}
        onHttpError={() => undefined}
        onLoadError={() => undefined}
      />
    );
  });
  return tree?.root.findAllByType(RNCWebView)[0];
};

describe('artifact viewer scrolling (iOS)', () => {
  test('the native web view decelerates at the UIKit normal rate, so a flick keeps its momentum', () => {
    expect(nativeWebView()?.props.decelerationRate).toBe(0.998);
  });
});
