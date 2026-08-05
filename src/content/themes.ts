export type ContentTheme = 'generic' | 'x';

export const themeForPlatform = (platform: string): ContentTheme =>
  platform === 'x' ? 'x' : 'generic';

export const themeClass = (theme: ContentTheme): string => `slopfilter-theme-${theme}`;
