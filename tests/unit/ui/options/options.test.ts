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
});
