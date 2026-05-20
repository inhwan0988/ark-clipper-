import { defineConfig } from '@playwright/test';

// Electron E2E 설정 — Mac/Windows runner에서 자동 실행
// dev mode로 next dev + electron source launch (production 빌드 결과물 대신 source).
// 검증 목표: 앱이 정상 launch + 메인 윈도우 로드 + UI 텍스트 렌더링.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
  },
});
