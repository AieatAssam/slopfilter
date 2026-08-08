import { getEntry, resolveSelector } from '@/adapters/x/selectors';

export type ContentTheme = 'generic' | 'x';

export const themeForPlatform = (platform: string): ContentTheme =>
  platform === 'x' ? 'x' : 'generic';

export const themeClass = (theme: ContentTheme): string => `slopfilter-theme-${theme}`;

export interface ThemeTokens {
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
}

const FALLBACKS = {
  surface: 'rgb(255, 255, 255)',
  text: 'rgb(15, 20, 25)',
  accent: 'rgb(29, 155, 240)',
} as const;

const isTransparent = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === 'transparent' ||
    normalized === 'rgba(0, 0, 0, 0)' ||
    normalized === 'rgba(0,0,0,0)'
  );
};

const none = (value: string): boolean => isTransparent(value);

const computedStyle = (element: Element | null, property: string): string | null => {
  if (!element) return null;
  const value = getComputedStyle(element)[property as 'color'];
  return typeof value === 'string' && !none(value) ? value : null;
};

const mix = (color: string, percentage: string, surface: string): string =>
  `color-mix(in srgb, ${color} ${percentage}, ${surface})`;

export function readThemeTokens(root: ParentNode): ThemeTokens {
  const surfaceProbe = resolveSelector(root, getEntry('theme-surface'));
  const accentProbe = resolveSelector(root, getEntry('theme-accent'));
  const separatorProbe = resolveSelector(root, getEntry('theme-separator'));
  const textProbe = resolveSelector(root, getEntry('timeline-container')) ?? surfaceProbe;

  const surface = computedStyle(surfaceProbe, 'backgroundColor') ?? FALLBACKS.surface;
  const text = computedStyle(textProbe, 'color') ?? FALLBACKS.text;
  const accent = computedStyle(accentProbe, 'backgroundColor') ?? FALLBACKS.accent;
  const textMuted = mix(text, '70%', surface);
  const separator = computedStyle(separatorProbe, 'backgroundColor');
  const border = separator ? separator : mix(text, '12%', surface);

  return { surface, text, textMuted, border, accent };
}

export function applyThemeTokens(doc: Document): ThemeTokens {
  const tokens = readThemeTokens(doc);
  const style = doc.documentElement.style;
  style.setProperty('--slopfilter-surface', tokens.surface);
  style.setProperty('--slopfilter-text', tokens.text);
  style.setProperty('--slopfilter-text-muted', tokens.textMuted);
  style.setProperty('--slopfilter-border', tokens.border);
  style.setProperty('--slopfilter-accent', tokens.accent);
  return tokens;
}

export function observeTheme(doc: Document, onChange: () => void): () => void {
  const observer = new MutationObserver(() => {
    try {
      onChange();
    } catch {
      // A theme probe change must never pause filtering.
    }
  });
  observer.observe(doc.body, {
    attributeFilter: ['style', 'class'],
    attributes: true,
    subtree: true,
  });
  return () => observer.disconnect();
}
