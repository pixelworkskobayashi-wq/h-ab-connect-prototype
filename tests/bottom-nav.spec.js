const { test, expect } = require('@playwright/test');

// 共通ナビが画面下端に固定されているか検証
async function assertNavFixed(page) {
  const vh = page.viewportSize().height;
  const nav = page.locator('#shared-bottom-nav');
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(
    box.y + box.height,
    `ナビ下端=${Math.round(box.y + box.height)}px / viewport=${vh}px`
  ).toBeCloseTo(vh, -1);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// スクロール操作 + ナビ位置検証
async function scrollThenAssert(page, screenId, direction) {
  const body = page.locator(`#${screenId} .body`);
  if (direction === 'down') {
    await body.evaluate(el => el.scrollBy(0, 300));
    await page.waitForTimeout(400);
    await assertNavFixed(page);
    await body.evaluate(el => el.scrollBy(0, -300));
    await page.waitForTimeout(400);
    await assertNavFixed(page);
  } else {
    await body.evaluate(el => el.scrollBy(0, -100));
    await page.waitForTimeout(400);
    await assertNavFixed(page);
    await body.evaluate(el => el.scrollBy(0, 400));
    await page.waitForTimeout(400);
    await assertNavFixed(page);
  }
}

// 画面遷移ヘルパー（共通ナビを使用）
async function navigateTo(page, label) {
  await page.locator('#shared-bottom-nav .nav-item').filter({ hasText: label }).click();
  await page.waitForTimeout(300);
}

test.describe('ボトムナビ固定テスト', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
  });

  // ─── 1. 構造・CSSプロパティ検証 ───────────────────────
  test('共通ナビが1個だけ存在する', async ({ page }) => {
    const count = await page.locator('#shared-bottom-nav').count();
    expect(count).toBe(1);
  });

  test('共通ナビが .phone の直接の子である', async ({ page }) => {
    const isDirectChild = await page.evaluate(() => {
      const nav = document.getElementById('shared-bottom-nav');
      return nav && nav.parentElement.classList.contains('phone');
    });
    expect(isDirectChild).toBe(true);
  });

  test('.phone が display:flex かつ flex-direction:column', async ({ page }) => {
    const { display, flexDir } = await page.locator('.phone').evaluate(el => ({
      display: window.getComputedStyle(el).display,
      flexDir: window.getComputedStyle(el).flexDirection,
    }));
    expect(display).toBe('flex');
    expect(flexDir).toBe('column');
  });

  test('.body が overflow:auto か scroll', async ({ page }) => {
    const ov = await page.locator('#screen-home .body').evaluate(
      el => window.getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(ov);
  });

  // ─── 2. ホーム画面 ────────────────────────────────────
  test('ホーム: 初期表示でナビが固定', async ({ page }) => {
    await assertNavFixed(page);
  });

  test('ホーム: 下スクロール→上スクロールでもナビが固定（問題の再現パターン）', async ({ page }) => {
    await scrollThenAssert(page, 'screen-home', 'down');
  });

  test('ホーム: 上スクロール→下スクロールでもナビが固定', async ({ page }) => {
    await scrollThenAssert(page, 'screen-home', 'up');
  });

  // ─── 3. 各ページ遷移後 ───────────────────────────────
  const pages = [
    { id: 'screen-workshops', label: '講習会' },
    { id: 'screen-cpd',       label: 'CPD' },
    { id: 'screen-card',      label: '会員証' },
    { id: 'screen-mypage',    label: 'マイページ' },
  ];

  for (const p of pages) {
    test(`${p.label}: 遷移直後にナビが固定`, async ({ page }) => {
      await navigateTo(page, p.label);
      await assertNavFixed(page);
    });

    test(`${p.label}: 遷移後に下→上スクロールでもナビが固定（問題の再現パターン）`, async ({ page }) => {
      await navigateTo(page, p.label);
      await scrollThenAssert(page, p.id, 'down');
    });

    test(`${p.label}: 遷移後に上→下スクロールでもナビが固定`, async ({ page }) => {
      await navigateTo(page, p.label);
      await scrollThenAssert(page, p.id, 'up');
    });
  }

  // ─── 4. 複数ページ往復 ───────────────────────────────
  test('ホーム→講習会→ホーム→CPD の往復後もナビが固定', async ({ page }) => {
    await navigateTo(page, '講習会');
    await assertNavFixed(page);
    await scrollThenAssert(page, 'screen-workshops', 'down');

    await navigateTo(page, 'ホーム');
    await assertNavFixed(page);

    await navigateTo(page, 'CPD');
    await scrollThenAssert(page, 'screen-cpd', 'down');
  });

  test('全ページを順番に巡回してナビが常に固定', async ({ page }) => {
    const tour = ['講習会', 'CPD', '会員証', 'マイページ', 'ホーム'];
    const ids  = ['screen-workshops', 'screen-cpd', 'screen-card', 'screen-mypage', 'screen-home'];
    for (let i = 0; i < tour.length; i++) {
      await navigateTo(page, tour[i]);
      await assertNavFixed(page);
      await page.locator(`#${ids[i]} .body`).evaluate(el => el.scrollBy(0, 200));
      await page.waitForTimeout(300);
      await assertNavFixed(page);
    }
  });

  // ─── 5. 申込フォーム遷移（ナビ非表示→再表示） ────────
  test('申込フォーム中はナビが非表示になる', async ({ page }) => {
    await navigateTo(page, '講習会');
    await page.locator('#screen-workshops .ws-card').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#screen-apply')).toBeVisible();
    await expect(page.locator('#shared-bottom-nav')).toBeHidden();
  });

  test('申込完了→ホームに戻るとナビが再表示・固定される', async ({ page }) => {
    await navigateTo(page, '講習会');
    await page.locator('#screen-workshops .ws-card').first().click();
    await page.waitForTimeout(300);
    await page.locator('#screen-apply .submit-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#screen-complete .home-btn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#screen-home')).toBeVisible();
    await assertNavFixed(page);
  });

  // ─── 6. ナビのアクティブ状態 ─────────────────────────
  test('講習会ページでは講習会ナビがアクティブ色になる', async ({ page }) => {
    await navigateTo(page, '講習会');
    const color = await page.locator('#nav-workshops span').evaluate(
      el => window.getComputedStyle(el).color
    );
    // #1B4F8A = rgb(27, 79, 138)
    expect(color).toBe('rgb(27, 79, 138)');
  });

});
