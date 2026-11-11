import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPluginHost } from '../src/host/plugin';
import { createStandaloneHost } from '../src/host/standalone';
import { copyText, type CopyDependencies } from '../src/host/types';

describe('clipboard adapter', () => {
  it('copies through the browser API when it is available', async () => {
    const calls: string[] = [];
    const dependencies: CopyDependencies = {
      writeClipboard: async (value) => calls.push(`clipboard:${value}`),
      fallbackCopy: (value) => {
        calls.push(`fallback:${value}`);
        return true;
      }
    };

    await copyText('1700000000', dependencies);
    assert.deepEqual(calls, ['clipboard:1700000000']);
  });

  it('falls back on a user gesture and reports rejection', async () => {
    const calls: string[] = [];
    await copyText('1 小时 30 分钟', {
      fallbackCopy(value) {
        calls.push(value);
        return true;
      }
    });
    assert.deepEqual(calls, ['1 小时 30 分钟']);
    await assert.rejects(
      () => copyText('result', { fallbackCopy: () => false }),
      /Clipboard write was rejected/
    );
  });

  it('falls back when the browser Clipboard API is present but denied', async () => {
    const calls: string[] = [];
    await copyText('1700000000', {
      async writeClipboard() {
        calls.push('clipboard');
        throw new Error('NotAllowedError');
      },
      fallbackCopy(value) {
        calls.push(`fallback:${value}`);
        return true;
      }
    });

    assert.deepEqual(calls, ['clipboard', 'fallback:1700000000']);
  });
});

describe('plugin host adapter', () => {
  it('handshakes with the Time app identity and follows host theme changes', async () => {
    let themeListener: ((theme: 'dark' | 'light') => void) | undefined;
    let closed = false;
    const host = createPluginHost(async (appId) => {
      assert.equal(appId, 'com.attson.time');
      return {
        handshake: async () => ({ theme: 'dark' as const }),
        onThemeChange(listener) {
          themeListener = listener;
          return () => { themeListener = undefined; };
        },
        close() { closed = true; }
      };
    });

    const themes: string[] = [];
    assert.equal(await host.initialize((theme) => themes.push(theme)), 'dark');
    themeListener?.('light');
    assert.deepEqual(themes, ['light']);
    assert.equal(await host.toggleTheme(), 'light');
    host.dispose();
    assert.equal(closed, true);
  });
});

describe('standalone host adapter', () => {
  it('loads, toggles and persists the standalone theme', async () => {
    const writes: string[] = [];
    const host = createStandaloneHost({
      readTheme: () => 'light',
      writeTheme: (theme) => writes.push(theme)
    });
    const changes: string[] = [];

    assert.equal(await host.initialize((theme) => changes.push(theme)), 'light');
    assert.equal(await host.toggleTheme(), 'dark');
    assert.deepEqual(writes, ['dark']);
    assert.deepEqual(changes, ['dark']);
  });
});
