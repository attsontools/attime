import { connectPlugin, type PluginClient } from '@attson/plugin-sdk/browser';

import { copyText, type ThemeName, type TimeHost } from './types';

interface PluginConnection {
  handshake(): Promise<{ theme: ThemeName }>;
  onThemeChange(listener: (theme: ThemeName) => void): () => void;
  close(): void;
}

type ConnectPlugin = (appId: string) => Promise<PluginConnection>;

export function createPluginHost(connect: ConnectPlugin): TimeHost {
  let client: PluginConnection | null = null;
  let removeThemeListener: (() => void) | null = null;
  let currentTheme: ThemeName = 'dark';
  return {
    mode: 'plugin',
    async initialize(onTheme) {
      client = await connect('com.attson.time');
      const handshake = await client.handshake();
      currentTheme = handshake.theme;
      removeThemeListener = client.onThemeChange((theme) => {
        currentTheme = theme;
        onTheme(theme);
      });
      return currentTheme;
    },
    async toggleTheme() {
      return currentTheme;
    },
    copy: copyText,
    dispose() {
      removeThemeListener?.();
      removeThemeListener = null;
      client?.close();
      client = null;
    }
  };
}

export const host = createPluginHost(
  (appId) => connectPlugin(appId) as Promise<PluginClient>
);
