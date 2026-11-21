import { beforeEach, describe, expect, test, vi } from 'vitest';
import { applyThemeTokens, observeTheme, readThemeTokens } from '@/content/themes';

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const setBody = (background: string, color: string): void => {
  document.body.style.backgroundColor = background;
  document.body.style.color = color;
};

const addAccentProbe = (background: string): HTMLElement => {
  const probe = document.createElement('div');
  probe.setAttribute('data-testid', 'tweetButtonInline');
  probe.style.backgroundColor = background;
  document.body.appendChild(probe);
  return probe;
};

const addSeparatorProbe = (background: string): HTMLElement => {
  const probe = document.createElement('div');
  probe.setAttribute('data-testid', 'cellInnerDiv');
  const inner = document.createElement('div');
  inner.style.backgroundColor = background;
  probe.appendChild(inner);
  document.body.appendChild(probe);
  return probe;
};

beforeEach(() => {
  document.body.innerHTML = '';
  for (const name of [
    '--slopfilter-surface',
    '--slopfilter-text',
    '--slopfilter-text-muted',
    '--slopfilter-border',
    '--slopfilter-accent',
    '--slopfilter-on-accent',
  ]) {
    document.documentElement.style.removeProperty(name);
  }
});

describe('readThemeTokens', () => {
  test('samples probe values on a light theme', () => {
    setBody('rgb(255, 255, 255)', 'rgb(15, 20, 25)');
    addAccentProbe('rgb(29, 155, 240)');
    addSeparatorProbe('rgb(239, 243, 244)');

    const tokens = readThemeTokens(document);

    expect(tokens.surface).toBe('rgb(255, 255, 255)');
    expect(tokens.text).toBe('rgb(15, 20, 25)');
    expect(tokens.accent).toBe('rgb(29, 155, 240)');
    expect(tokens.border).toBe('rgb(239, 243, 244)');
    expect(tokens.textMuted).toContain('color-mix');
    expect(tokens.onAccent).toBe('rgb(15, 20, 25)');
  });

  test('picks white on-accent text for a black surface accent', () => {
    setBody('rgb(0, 0, 0)', 'rgb(247, 249, 249)');
    addAccentProbe('rgb(0, 0, 0)');

    const tokens = readThemeTokens(document);

    expect(tokens.onAccent).toBe('rgb(255, 255, 255)');
  });

  test('samples probe values on a lights-out theme', () => {
    setBody('rgb(0, 0, 0)', 'rgb(247, 249, 249)');
    addAccentProbe('rgb(29, 155, 240)');
    addSeparatorProbe('rgb(47, 51, 54)');

    const tokens = readThemeTokens(document);

    expect(tokens.surface).toBe('rgb(0, 0, 0)');
    expect(tokens.text).toBe('rgb(247, 249, 249)');
    expect(tokens.border).toBe('rgb(47, 51, 54)');
  });

  test('falls back when the accent probe is missing', () => {
    setBody('rgb(255, 255, 255)', 'rgb(15, 20, 25)');

    const tokens = readThemeTokens(document);

    expect(tokens.accent).toBe('rgb(29, 155, 240)');
  });

  test('falls back on a transparent computed value', () => {
    setBody('rgb(255, 255, 255)', 'rgb(15, 20, 25)');
    addAccentProbe('rgba(0, 0, 0, 0)');

    const tokens = readThemeTokens(document);

    expect(tokens.accent).toBe('rgb(29, 155, 240)');
    expect(tokens.textMuted).toContain('color-mix');
    expect(tokens.border).toContain('color-mix');
  });

  test('derives border via color-mix when no separator probe', () => {
    setBody('rgb(255, 255, 255)', 'rgb(15, 20, 25)');

    const tokens = readThemeTokens(document);

    expect(tokens.border).toContain('color-mix');
  });
});

describe('applyThemeTokens', () => {
  test('writes the tokens onto documentElement style', () => {
    setBody('rgb(21, 32, 43)', 'rgb(247, 249, 249)');
    addAccentProbe('rgb(29, 155, 240)');

    applyThemeTokens(document);

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--slopfilter-surface')).toBe('rgb(21, 32, 43)');
    expect(style.getPropertyValue('--slopfilter-text')).toBe('rgb(247, 249, 249)');
    expect(style.getPropertyValue('--slopfilter-accent')).toBe('rgb(29, 155, 240)');
    expect(style.getPropertyValue('--slopfilter-on-accent')).toBe('rgb(15, 20, 25)');
  });

  test('writes white on-accent for a dark accent', () => {
    setBody('rgb(0, 0, 0)', 'rgb(247, 249, 249)');
    addAccentProbe('rgb(0, 0, 0)');

    applyThemeTokens(document);

    expect(document.documentElement.style.getPropertyValue('--slopfilter-on-accent')).toBe(
      'rgb(255, 255, 255)',
    );
  });
});

describe('observeTheme', () => {
  test('fires once per style change and stops after disconnect', async () => {
    const onChange = vi.fn();
    const disconnect = observeTheme(document, onChange);

    document.body.style.backgroundColor = 'rgb(0, 0, 0)';
    document.body.style.color = 'rgb(231, 233, 234)';
    await flush();

    expect(onChange).toHaveBeenCalledTimes(1);

    disconnect();
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    await flush();

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
