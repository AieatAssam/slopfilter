import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../support/extension';
import { attachFeedback, goldenVariantIds, mountGolden, restoreArticle } from '../support/harness';

const restoreVariants = async (
  page: import('@playwright/test').Page,
  ids: string[],
): Promise<void> => {
  for (const id of ids) await restoreArticle(page, id);
};

const openGolden = async (context: BrowserContext) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);
  return page;
};

test('each cluster box is fully contained by its own article box', async ({ context }) => {
  const page = await openGolden(context);
  const ids = await goldenVariantIds(page);
  await restoreVariants(page, ids);
  for (const id of ids) await attachFeedback(page, id);

  const groups = await page.evaluate((targets) => {
    return targets.map((id) => {
      const article = document.getElementById(id);
      if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${id}`);
      const cluster = article.querySelector('[data-testid="slopfilter-feedback"]');
      if (!(cluster instanceof HTMLElement)) throw new Error(`cluster missing: ${id}`);
      const articleRect = article.getBoundingClientRect();
      const clusterRect = cluster.getBoundingClientRect();
      return {
        contained:
          clusterRect.top >= articleRect.top &&
          clusterRect.left >= articleRect.left &&
          clusterRect.bottom <= articleRect.bottom &&
          clusterRect.right <= articleRect.right,
      };
    });
  }, ids);

  for (const group of groups) expect(group.contained).toBe(true);
});

test('injection stays in the post content column and in flow', async ({ context }) => {
  const page = await openGolden(context);
  const ids = await goldenVariantIds(page);
  await restoreVariants(page, ids);

  for (const id of ids) await attachFeedback(page, id);
  const positions = await page.evaluate((targets) => {
    return targets.map((id) => {
      const article = document.getElementById(id);
      if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${id}`);
      const anchor = article.querySelector<HTMLElement>('[data-testid="slopfilter-anchor"]');
      const cluster = article.querySelector<HTMLElement>('[data-testid="slopfilter-feedback"]');
      const text = article.querySelector('[data-testid="tweetText"]');
      if (!anchor || !cluster || !text) throw new Error(`controls missing: ${id}`);
      return {
        anchor: getComputedStyle(anchor).position,
        cluster: getComputedStyle(cluster).position,
        sameColumn: anchor.parentElement?.contains(text) ?? false,
        articleDirectChild: anchor.parentElement === article,
      };
    });
  }, ids);

  for (const position of positions) {
    expect(position.anchor).toBe('relative');
    expect(position.cluster).toBe('static');
    expect(position.sameColumn).toBe(true);
    expect(position.articleDirectChild).toBe(false);
  }
});

test('detail-page injection stays inside the content column', async ({ context }) => {
  const page = await openGolden(context);
  await page.evaluate(() => {
    const article = document.createElement('article');
    article.id = 'detail-layout-post';
    article.dataset.testid = 'tweet';
    article.innerHTML = `
      <div data-testid="detail-sidebar"></div>
      <div data-testid="detail-content">
        <div data-testid="User-Name"><div dir="ltr">Account</div><div dir="ltr"><a href="/account/status/detail-layout-post">@account</a></div></div>
        <div data-testid="tweetText">A post opened on its own page.</div>
      </div>
      <div data-testid="detail-actions"></div>
      <time datetime="2026-08-12T20:00:00.000Z"></time>
    `;
    document.body.append(article);
  });
  await attachFeedback(page, 'detail-layout-post');

  const layout = await page.locator('#detail-layout-post').evaluate((article) => {
    const anchor = article.querySelector<HTMLElement>('[data-testid="slopfilter-anchor"]');
    const content = article.querySelector<HTMLElement>('[data-testid="detail-content"]');
    if (!anchor || !content) throw new Error('detail controls missing');
    return {
      sameColumn: anchor.parentElement === content,
      directChild: anchor.parentElement === article,
    };
  });

  expect(layout.sameColumn).toBe(true);
  expect(layout.directChild).toBe(false);
});

test('clicking a control does not activate the underlying post', async ({ context }) => {
  const page = await openGolden(context);
  const id = (await goldenVariantIds(page))[0];
  if (!id) throw new Error('no golden article');
  await restoreArticle(page, id);
  await attachFeedback(page, id);

  const article = page.locator(`[id="${id}"]`);
  await article.getByRole('button', { name: 'Why this score' }).click();
  await expect(page.getByTestId('slopfilter-inspector')).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5174/');
});

test('controls return after navigating back to the feed', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);
  await expect(page.getByTestId('slopfilter-feedback').first()).toBeVisible();
  await page.evaluate(() => history.pushState({}, '', '/account01/status/123'));
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL('http://localhost:5174/');
  await mountGolden(page);
  await expect(page.getByTestId('slopfilter-feedback').first()).toBeVisible();
});

test('the cluster never overlaps the native caret control', async ({ context }) => {
  const page = await openGolden(context);
  const ids = await goldenVariantIds(page);
  await restoreVariants(page, ids);
  // Model the real X header caret: a More button pinned to the article's top-right corner. The
  // captured fixture ships its own caret deep inside a tall article, so the probe is stamped with a
  // dedicated marker and queried by it — otherwise querySelector resolves to the fixture's stray
  // caret and the overlap it used to create is never exercised.
  for (const id of ids) {
    await page.evaluate((target) => {
      const article = document.getElementById(target);
      if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${target}`);
      const caret = document.createElement('button');
      caret.type = 'button';
      caret.dataset.testid = 'caret';
      caret.dataset.slopfilterCaretProbe = 'true';
      caret.setAttribute('aria-label', 'More');
      caret.style.cssText =
        'position:absolute;top:60px;right:16px;width:20px;height:20px;display:block';
      article.appendChild(caret);
    }, id);
  }
  for (const id of ids) await attachFeedback(page, id);

  const overlaps = await page.evaluate((targets) => {
    return targets.map((id) => {
      const article = document.getElementById(id);
      if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${id}`);
      const cluster = article.querySelector('[data-testid="slopfilter-feedback"]');
      if (!(cluster instanceof HTMLElement)) throw new Error(`cluster missing: ${id}`);
      const caret = article.querySelector('[data-slopfilter-caret-probe]');
      if (!(caret instanceof HTMLElement)) throw new Error(`caret probe missing: ${id}`);
      const clusterRect = cluster.getBoundingClientRect();
      const caretRect = caret.getBoundingClientRect();
      return (
        clusterRect.left < caretRect.right &&
        clusterRect.right > caretRect.left &&
        clusterRect.top < caretRect.bottom &&
        clusterRect.bottom > caretRect.top
      );
    });
  }, ids);

  for (const intersects of overlaps) expect(intersects).toBe(false);
});

test('the visible cluster remains interactive and does not intercept the native caret', async ({
  context,
}) => {
  const page = await openGolden(context);
  const id = (await goldenVariantIds(page))[0];
  if (!id) throw new Error('no golden article');

  await page.evaluate((target) => {
    const article = document.getElementById(target);
    if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${target}`);
    const caret = document.createElement('button');
    caret.type = 'button';
    caret.dataset.testid = 'caret-click-probe';
    caret.dataset.slopfilterCaretProbe = 'true';
    caret.setAttribute('aria-label', 'More');
    caret.style.cssText =
      'position:absolute;top:60px;right:16px;width:20px;height:20px;display:block;opacity:1;visibility:visible';
    article.appendChild(caret);
  }, id);
  await attachFeedback(page, id);

  const cluster = page.locator(`[id="${id}"] [data-testid="slopfilter-feedback"]`);
  await expect(cluster).toHaveCSS('opacity', '1');
  await expect(cluster).toHaveCSS('pointer-events', 'auto');
});

test('injected clusters stay inside their article, clear the caret and stay compact across four widths', async ({
  context,
}) => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ];

  for (const viewport of viewports) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto('/');
    await mountGolden(page);
    const ids = await goldenVariantIds(page);
    await restoreVariants(page, ids);
    await page.evaluate((targets) => {
      for (const target of targets) {
        const article = document.getElementById(target);
        if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${target}`);
        const caret = document.createElement('button');
        caret.type = 'button';
        caret.dataset.slopfilterCaretProbe = 'true';
        caret.setAttribute('aria-label', 'More');
        caret.style.cssText =
          'position:absolute;top:60px;right:16px;width:20px;height:20px;display:block';
        article.appendChild(caret);
      }
    }, ids);
    for (const id of ids) await attachFeedback(page, id);

    const clusters = await page.evaluate(
      ({ targets, width }) =>
        targets.flatMap((id) => {
          const article = document.getElementById(id);
          if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${id}`);
          const caret = article.querySelector('[data-slopfilter-caret-probe]');
          if (!(caret instanceof HTMLElement)) throw new Error(`caret probe missing: ${id}`);
          const caretRect = caret.getBoundingClientRect();
          const articleRect = article.getBoundingClientRect();
          return Array.from(
            article.querySelectorAll<HTMLElement>('[data-testid="slopfilter-feedback"]'),
          )
            .map((cluster) => cluster.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map((rect) => ({
              contained: rect.left >= articleRect.left - 1 && rect.right <= articleRect.right + 1,
              compact: width < 768 || rect.height <= 48,
              clearsCaret: !(
                rect.left < caretRect.right &&
                rect.right > caretRect.left &&
                rect.top < caretRect.bottom &&
                rect.bottom > caretRect.top
              ),
            }));
        }),
      { targets: ids, width: viewport.width },
    );

    expect(clusters.length).toBeGreaterThan(0);
    for (const cluster of clusters) {
      expect(cluster.contained, `${viewport.width}px cluster inside article`).toBe(true);
      expect(cluster.compact, `${viewport.width}px cluster height`).toBe(true);
      expect(cluster.clearsCaret, `${viewport.width}px cluster clears caret`).toBe(true);
    }
    await page.close();
  }
});
