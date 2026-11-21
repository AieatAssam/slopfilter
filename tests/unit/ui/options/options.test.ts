import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), sendMessage: vi.fn() }));

vi.mock('@/storage/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/settings')>();
  return {
    ...actual,
    loadSettings: async () => actual.DEFAULT_SETTINGS,
    saveSettings: mocks.save,
  };
});
vi.mock('@/storage/settingsIo', () => ({ exportConfig: vi.fn(), importConfig: vi.fn() }));

const html = () => readFileSync('public/ui/options/options.html', 'utf8');
const statusText = () =>
  document.querySelector('[data-testid="slopfilter-settings-status"]')?.textContent;

// Mounts the page fresh and runs the options module against it.
const loadPage = async () => {
  document.body.innerHTML = html();
  vi.resetModules();
  await import('@/ui/options/options');
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const edit = (id: string, value: string) => {
  const element = document.getElementById(id) as HTMLInputElement;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('options page', () => {
  test('every control has an associated label', () => {
    document.body.innerHTML = html();

    for (const control of document.querySelectorAll('input')) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      if (!id) throw new Error('control is missing an id');
      expect(document.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
  });

  test('every info tip carries a help title inside a title row', () => {
    document.body.innerHTML = html();

    const tips = document.querySelectorAll('.info-tip');
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect(tip.closest('.setting-title-row'), 'tip outside a title row').not.toBeNull();
      const help = tip.getAttribute('title');
      expect(help, 'missing title').toBeTruthy();
      expect(help?.length).toBeGreaterThan(0);
    }
  });

  test('loads the shared page tokens before the options styles', () => {
    const source = html();
    const shared = source.indexOf('href="../page.css"');
    expect(shared).toBeGreaterThan(-1);
    expect(shared).toBeLessThan(source.indexOf('href="./options.css"'));
  });
});

describe('options persistence', () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(undefined);
    mocks.sendMessage
      .mockReset()
      .mockResolvedValue({ type: 'text-pattern-download-complete', ok: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage: mocks.sendMessage } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('an edit made while an older save is pending keeps "Saving…" until the newest save lands', async () => {
    await loadPage();
    vi.useFakeTimers();
    let releaseFirst: () => void = () => {};
    mocks.save.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    );

    edit('hide-threshold', '0.5');
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    edit('hide-threshold', '0.6');
    expect(statusText()).toBe('Saving…');

    releaseFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(statusText()).toBe('Saving…');

    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(statusText()).toBe('Saved.');
  });

  test('the text-pattern download starts only when that checkbox is switched on', async () => {
    await loadPage();
    const pattern = document.getElementById('enable-text-pattern') as HTMLInputElement;
    pattern.checked = true;

    const hideAds = document.getElementById('hide-ads') as HTMLInputElement;
    hideAds.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    pattern.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'text-pattern-download' });
  });
});
