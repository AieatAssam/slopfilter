import { expect, test } from '../support/extension';
import { mountGolden } from '../support/harness';

test('placeholder chrome matches a neighbouring cell in padding, border, radius and margin', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);
  await page.waitForTimeout(300);

  await page.evaluate(
    (value) => window.__slopfilterHarness.collapseFirstPost(value),
    ['posts 40+ times per day'],
  );
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  await expect(placeholder).toBeVisible();

  const measured = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="slopfilter-placeholder"]');
    if (!(p instanceof HTMLElement)) throw new Error('placeholder missing');
    const cells = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    );
    const cell = cells.find((el) => getComputedStyle(el).display !== 'none');
    if (!(cell instanceof HTMLElement)) throw new Error('no visible cell');
    const ps = getComputedStyle(p);
    const cs = getComputedStyle(cell);
    return {
      paddingInline: ps.paddingInlineStart,
      borderBlockEnd: ps.borderBlockEndColor,
      radius: ps.borderRadius,
      marginTokens: ps.margin.split(' '),
      cellPaddingInline: cs.paddingInlineStart,
      cellBorderBlockEnd: cs.borderBlockEndColor,
    };
  });

  expect(measured.paddingInline).toBe(measured.cellPaddingInline);
  expect(measured.borderBlockEnd).toBe(measured.cellBorderBlockEnd);
  expect(measured.radius).toBe('0px');
  expect([...new Set(measured.marginTokens)]).toEqual(['0px']);
});

test('the placeholder stays one line and matches a neighbouring single-line cell within 8px', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await page.evaluate(() => {
    const section = document.querySelector('[aria-label="Timeline: Your Home Timeline"]');
    if (!section) throw new Error('timeline missing');
    const target = document.createElement('article');
    target.dataset.testid = 'tweet';
    const name = document.createElement('div');
    name.textContent = 'target';
    target.append(name);
    section.append(target);

    const neighbour = document.createElement('article');
    neighbour.dataset.testid = 'tweet';
    neighbour.id = 'zz-single-line';
    const row = document.createElement('div');
    row.style.cssText = 'align-items:center;display:flex;gap:8px;';
    const avatar = document.createElement('div');
    avatar.style.cssText = 'width:40px;height:40px;';
    const text = document.createElement('div');
    text.textContent = 'one line';
    row.append(avatar, text);
    neighbour.append(row);
    section.appendChild(neighbour);
  });
  await page.waitForTimeout(200);

  const neighbourHeight = await page.evaluate(
    () => document.getElementById('zz-single-line')?.offsetHeight ?? -1,
  );

  await page.evaluate(
    (value) => window.__slopfilterHarness.collapseFirstPost(value),
    ['posts 40+ times per day'],
  );
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  await expect(placeholder).toBeVisible();

  const after = await page.evaluate((referenceId) => {
    const p = document.querySelector('[data-testid="slopfilter-placeholder"]');
    if (!(p instanceof HTMLElement)) throw new Error('placeholder missing');
    const reference = document.getElementById(referenceId);
    if (!(reference instanceof HTMLElement)) throw new Error('reference missing');
    return { placeholder: p.offsetHeight, reference: reference.offsetHeight };
  }, 'zz-single-line');

  expect(Math.abs(after.placeholder - after.reference)).toBeLessThanOrEqual(8);
  expect(Math.abs(after.placeholder - neighbourHeight)).toBeLessThanOrEqual(8);
});

test('account menu opens above surrounding content, closes on Escape and outside click, returns focus to its trigger', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForTimeout(200);

  const article = page.locator('article[data-testid="tweet"]').first();
  const trigger = article.getByRole('button', { name: 'Account options' });
  await article.hover();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const focused = await page.evaluate(() => document.activeElement?.textContent);
  expect(focused).toContain('Account options');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(600, 450);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const focusedAfterOutside = await page.evaluate(() => document.activeElement?.textContent);
  expect(focusedAfterOutside).toContain('Account options');
});

test('collapsed-row controls stay in flow without covering the recovery actions', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto('/?fixture=high-frequency');
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  await expect(placeholder).toBeVisible();

  const boxes = await placeholder.evaluate((element) => {
    const rect = (selector: string) => {
      const node = element.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`missing ${selector}`);
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return {
      reason: rect('.slopfilter-reason'),
      showAnyway: rect('.slopfilter-show-anyway'),
      breakdown: rect('.slopfilter-breakdown-toggle'),
      feedback: rect('[data-testid="slopfilter-feedback"]'),
    };
  });

  for (const pair of [
    [boxes.reason, boxes.feedback],
    [boxes.showAnyway, boxes.feedback],
    [boxes.breakdown, boxes.feedback],
  ] as const) {
    expect(pair[0].bottom <= pair[1].top || pair[1].bottom <= pair[0].top).toBe(true);
  }
});

test('feed controls wrap inside a narrow post with touch-sized targets', async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const article = page.locator('article[data-testid="tweet"]').first();
  const controls = article.getByTestId('slopfilter-feedback');
  await expect(controls).toBeVisible();

  const layout = await article.evaluate((element) => {
    const group = element.querySelector<HTMLElement>('[data-testid="slopfilter-feedback"]');
    if (!group) throw new Error('feedback controls missing');
    const articleBox = element.getBoundingClientRect();
    const groupBox = group.getBoundingClientRect();
    return {
      contained: groupBox.left >= articleBox.left && groupBox.right <= articleBox.right,
      buttonHeights: Array.from(
        group.querySelectorAll(':scope > button'),
        (button) => button.getBoundingClientRect().height,
      ),
    };
  });

  expect(layout.contained).toBe(true);
  expect(Math.min(...layout.buttonHeights)).toBeGreaterThanOrEqual(40);
});
