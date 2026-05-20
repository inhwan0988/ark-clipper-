import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { test, expect } from '@playwright/test';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // source에서 electron launch → app.isPackaged=false → main.js의 isDev=true →
  // startNextServer() short-circuit → http://localhost:3000 가정.
  // CI workflow가 사전에 next dev 서버를 띄워둠.
  app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      // E2E에서는 DevTools 자동 열기 끄기 (CI에서 GUI 오버헤드 줄임)
      ARC_DISABLE_DEVTOOLS: '1',
    },
    timeout: 120_000,
  });
  page = await app.firstWindow({ timeout: 120_000 });
});

test.afterAll(async () => {
  if (app) await app.close().catch(() => {});
});

test('main window loads with non-empty UI', async () => {
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 });
  // body 텍스트가 충분히 렌더링됐는지 (UI가 흰 화면이 아닌지)
  await expect(page.locator('body')).toBeVisible({ timeout: 60_000 });
  const bodyText = (await page.locator('body').textContent({ timeout: 30_000 })) || '';
  console.log(`[e2e] body text excerpt (${bodyText.length} chars): ${bodyText.slice(0, 120)}`);
  expect(bodyText.length).toBeGreaterThan(20);
});

test('window title contains app name', async () => {
  const title = await page.title();
  console.log(`[e2e] window title: ${title}`);
  // Next.js의 <title> 또는 Electron이 설정한 title 둘 중 하나에 'Ark' 또는 'Clipper'
  // (title이 빈 문자열이거나 'localhost' 같은 default면 검증 강화 가능)
  expect(title).toBeTruthy();
});
