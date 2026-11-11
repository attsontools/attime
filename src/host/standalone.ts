import { copyText, type ThemeName, type TimeHost } from './types';

const STORAGE_KEY = 'attime.theme';

export interface StandaloneDependencies {
  readTheme(): string | null;
  writeTheme(theme: ThemeName): void;
}

export function createStandaloneHost(dependencies: StandaloneDependencies): TimeHost {
  let theme: ThemeName = 'dark';
  let themeListener: ((theme: ThemeName) => void) | null = null;
  return {
    mode: 'standalone',
    async initialize(onTheme) {
      themeListener = onTheme;
      theme = dependencies.readTheme() === 'light' ? 'light' : 'dark';
      return theme;
    },
    async toggleTheme() {
      theme = theme === 'dark' ? 'light' : 'dark';
      dependencies.writeTheme(theme);
      themeListener?.(theme);
      return theme;
    },
    copy: copyText,
    dispose() {
      themeListener = null;
    }
  };
}

export const host = createStandaloneHost({
  readTheme: () => localStorage.getItem(STORAGE_KEY),
  writeTheme: (theme) => localStorage.setItem(STORAGE_KEY, theme)
});
