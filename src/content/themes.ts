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
  onAccent: string;
}

const ON_ACCENT_DARK = 'rgb(15, 20, 25)';
const ON_ACCENT_LIGHT = 'rgb(255, 255, 255)';
// Relative luminance where black and white text reach equal WCAG contrast.
const ON_ACCENT_CROSSOVER = 0.179;

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (rgb: string): number | null => {
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map(Number) as [number, number, number];
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const onAccentFor = (accent: string): string => {
  const lum = luminance(accent);
  if (lum === null) return ON_ACCENT_LIGHT;
  return lum > ON_ACCENT_CROSSOVER ? ON_ACCENT_DARK : ON_ACCENT_LIGHT;
};

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

  return { surface, text, textMuted, border, accent, onAccent: onAccentFor(accent) };
}

export function applyThemeTokens(doc: Document): ThemeTokens {
  const tokens = readThemeTokens(doc);
  const style = doc.documentElement.style;
  const entries: readonly [string, string][] = [
    ['--slopfilter-surface', tokens.surface],
    ['--slopfilter-text', tokens.text],
    ['--slopfilter-text-muted', tokens.textMuted],
    ['--slopfilter-border', tokens.border],
    ['--slopfilter-accent', tokens.accent],
    ['--slopfilter-on-accent', tokens.onAccent],
  ];
  for (const [name, value] of entries) {
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  }
  return tokens;
}

// Leading-edge sample on the first mutation of a frame, then one trailing sample per frame for
// mutations that arrive while the frame is pending. Bursts of style churn therefore cost at most
// two samples per frame instead of one per mutation.
export function observeTheme(doc: Document, onChange: () => void): () => void {
  let frame: number | null = null;
  let trailing = false;
  let disconnected = false;
  const sample = () => {
    try {
      onChange();
    } catch {
      // A theme probe change must never pause filtering.
    }
  };
  const onFrame = () => {
    frame = null;
    if (!trailing || disconnected) return;
    trailing = false;
    sample();
  };
  const observer = new MutationObserver(() => {
    if (disconnected) return;
    if (frame !== null) {
      trailing = true;
      return;
    }
    sample();
    frame = requestAnimationFrame(onFrame);
  });
  observer.observe(doc.body, {
    attributeFilter: ['style', 'class'],
    attributes: true,
    subtree: true,
  });
  return () => {
    disconnected = true;
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    trailing = false;
  };
}
