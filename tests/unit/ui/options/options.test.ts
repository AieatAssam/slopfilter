import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('options page', () => {
  test('every control has an associated label', () => {
    document.body.innerHTML = readFileSync('src/ui/options/options.html', 'utf8');

    for (const control of document.querySelectorAll('input')) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      if (!id) throw new Error('control is missing an id');
      expect(document.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
  });

  test('every info tip carries a help title inside a title row', () => {
    document.body.innerHTML = readFileSync('src/ui/options/options.html', 'utf8');

    const tips = document.querySelectorAll('.info-tip');
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect(tip.closest('.setting-title-row'), 'tip outside a title row').not.toBeNull();
      const help = tip.getAttribute('title');
      expect(help, 'missing title').toBeTruthy();
      expect(help?.length).toBeGreaterThan(0);
    }
  });
});
