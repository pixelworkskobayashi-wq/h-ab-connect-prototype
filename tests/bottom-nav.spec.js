const { test, expect } = require('@playwright/test');

// ボトムナビが画面下端に固定されているか検証
async function assertNavFixed(page, screenId) {
  const vh = page.viewportSize().height;
  const nav = page.locator(`#${screenId} .bottom-nav`);
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(
    box.y + box.height,
    `[${screenId}] ナビ下端=${Math.round(box.y + box.height)}px / viewport=${vh}px`
  ).toBeCloseTo(vh, -1);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// スクロール操作 + ナビ位置を検証
async function scrollThenAssert(page, screenId, direction) {
  const body = page.locator(`#${screenId} .body`);
  if (direction === 'down') {
    // 問題が起きやすいパターン：最初に下へ
    await body.evaluate(el => el.scrollBy(0, 300));
    await page.waitForTimeout(400);
    await assertNavFixed(page, screenId);
    await body.evaluate(el => el.scrollBy(0, -300));
    await page.waitForTimeout(400);
    await assertNavFixed(page, screenId);
  } else {
    // 上から先のパターン
    await body.evaluate(el => el.scrollBy(0, -100));
    await page.waitForTimeout(400);
    await assertNavFixed(page, screenId);
    await body.evaluate(el => el.scrollBy(0, 400));
    await page.waitForTimeout(400);
    await assertNavFixed(page, screenId);
  }
}

// 画面遷移ヘルパー
async function navigateTo(page, fromScreen, label) {
  await page.locator(`#${fromScreen} .bottom-nav .nav-item`).filter({ hasText: label }).click();
  await page.waitForTimeout(300);
}

test.describe('ボトムナビ固定テスト', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
  });

  // ─── 1. CSSプロパティ検証 ───────────────────────────────
  test('全画面: bottom-nav が position:absolute', async ({ page }) => {
    const ids = ['screen-home', 'screen-workshops', 'screen-cpd', 'screen-card', 'screen-mypage'];
    for (const id of ids) {
      const pos = await page.locator(`#${id} .bottom-nav`).evaluate(
        el => window.getComputedStyle(el).position
      );
      expect(pos, `[${id}] position=${pos}`).toBe('absolute');
    }
  });

  test('.body が overflow:auto か scroll', async ({ page }) => {
    const ov = await page.locator('#screen-home .body').evaluate(
      el => window.getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(ov);
  });

  test('.phone が overflow:hidden かつ position:relative', async ({ page }) => {
    const { overflow, position } = await page.locator('.phone').evaluate(el => ({
      overflow: window.getComputedStyle(el).overflow,
      position: window.getComputedStyle(el).position,
    }));
    expect(overflow).toBe('hidden');
    expect(position).toBe('relative');
  });

  // ─── 2. ホーム画面 ─────────────────────────────────────
  test('ホーム: 初期表示でナビが固定', async ({ page }) => {
    await assertNavFixed(page, 'screen-home');
  });

  test('ホーム: 最初に下スクロール→上スクロールでもナビが固定', async ({ page }) => {
    await scrollThenAssert(page, 'screen-home', 'down');
  });

  test('ホーム: 最初に上スクロール→下スクロールでもナビが固定', async ({ page }) => {
    await scrollThenAssert(page, 'screen-home', 'up');
  });

  // ─── 3. 各ページ遷移後 ─────────────────────────────────
  const pages = [
    { id: 'screen-workshops', label: '講習会' },
    { id: 'screen-cpd',       label: 'CPD' },
    { id: 'screen-card',      label: '会員証' },
    { id: 'screen-mypage',    label: 'マイページ' },
  ];

  for (const p of pages) {
    test(`${p.label}: 遷移直後にナビが固定`, async ({ page }) => {
      await navigateTo(page, 'screen-home', p.label);
      await assertNavFixed(page, p.id);
    });

    test(`${p.label}: 遷移後に下→上スクロールでもナビが固定（問題の再現パターン）`, async ({ page }) => {
      await navigateTo(page, 'screen-home', p.label);
      await scrollThenAssert(page, p.id, 'down');
    });

    test(`${p.label}: 遷移後に上→下スクロールでもナビが固定`, async ({ page }) => {
      await navigateTo(page, 'screen-home', p.label);
      await scrollThenAssert(page, p.id, 'up');
    });
  }

  // ─── 4. 複数ページ往復 ─────────────────────────────────
  test('ホーム→講習会→ホーム→CPD の往復後もナビが固定', async ({ page }) => {
    await navigateTo(page, 'screen-home', '講習会');
    await assertNavFixed(page, 'screen-workshops');

    // 講習会で下スクロール（問題パターン）
    await scrollThenAssert(page, 'screen-workshops', 'down');

    await navigateTo(page, 'screen-workshops', 'ホーム');
    await assertNavFixed(page, 'screen-home');

    await navigateTo(page, 'screen-home', 'CPD');
    await scrollThenAssert(page, 'screen-cpd', 'down');
  });

  test('全ページを順番に巡回してナビが常に固定', async ({ page }) => {
    const tour = [
      { from: 'screen-home',      label: '講習会', to: 'screen-workshops' },
      { from: 'screen-workshops', label: 'CPD',    to: 'screen-cpd' },
      { from: 'screen-cpd',       label: '会員証', to: 'screen-card' },
      { from: 'screen-card',      label: 'マイページ', to: 'screen-mypage' },
      { from: 'screen-mypage',    label: 'ホーム', to: 'screen-home' },
    ];
    for (const step of tour) {
      await navigateTo(page, step.from, step.label);
      await assertNavFixed(page, step.to);
      // 各ページで下スクロール
      await page.locator(`#${step.to} .body`).evaluate(el => el.scrollBy(0, 200));
      await page.waitForTimeout(300);
      await assertNavFixed(page, step.to);
    }
  });

  // ─── 5. 申込フォーム遷移 ───────────────────────────────
  test('講習会→申込フォーム→完了→ホーム の遷移が動作する', async ({ page }) => {
    await navigateTo(page, 'screen-home', '講習会');
    await page.locator('#screen-workshops .ws-card').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#screen-apply')).toBeVisible();

    // 申込確定
    await page.locator('#screen-apply .submit-btn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#screen-complete')).toBeVisible();

    // ホームに戻る
    await page.locator('#screen-complete .home-btn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#screen-home')).toBeVisible();
    await assertNavFixed(page, 'screen-home');
  });

});
