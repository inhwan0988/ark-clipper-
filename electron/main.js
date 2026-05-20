const { app, BrowserWindow, shell, dialog, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

// Sentry — 사용자 PC에서 발생한 에러 자동 수집. DSN 없으면 no-op (개발자 환경).
// 빌드 시점에 SENTRY_DSN 환경변수 또는 코드에 하드코딩 (client DSN은 public이라도 OK).
// 사용 절차: sentry.io 가입 → Project (Electron) 생성 → DSN 복사 → 아래 상수 교체.
const SENTRY_DSN = process.env.SENTRY_DSN || ''; // 예: 'https://abc123@o123.ingest.sentry.io/456'
if (SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/electron/main');
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: `${process.platform}-${process.arch}`,
      release: require('../package.json').version,
      // 사용자 데이터/영상 내용은 전송 X. 스택트레이스 + OS/앱버전만.
      sendDefaultPii: false,
    });
  } catch (e) {
    console.error('[Sentry] init failed:', e);
  }
}

const isDev = !app.isPackaged;

let mainWindow;
let nextProcess;
let logStream;
let logFilePath; // 로그 파일 절대경로 (UI에서 열기 위해 보관)

// uncaughtException / unhandledRejection 글로벌 핸들러.
// 예상치 못한 crash 시 사용자에게 친화적 다이얼로그 + 로그 파일에 기록.
process.on('uncaughtException', (err) => {
  try {
    logLine(`[uncaughtException] ${err && err.stack ? err.stack : err}`);
  } catch {
    /* ignore */
  }
  // app ready 후에만 dialog 가능. ready 전이면 console.error로 끝.
  if (app.isReady()) {
    try {
      dialog.showErrorBox(
        'Ark Clipper - 예상치 못한 오류',
        `${err && err.message ? err.message : err}\n\n` +
          `이 오류가 반복되면 로그 파일을 첨부해 문의주세요.\n` +
          `로그: ${logFilePath || '(생성되지 않음)'}`,
      );
    } catch {
      /* ignore */
    }
  } else {
    console.error('[uncaughtException]', err);
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    const msg = reason && reason.stack ? reason.stack : String(reason);
    logLine(`[unhandledRejection] ${msg}`);
  } catch {
    /* ignore */
  }
});

function getLogStream() {
  if (logStream) return logStream;
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, 'next-server.log');
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    logStream.write(`\n=== ${new Date().toISOString()} app start v${app.getVersion()} (platform=${process.platform}) ===\n`);
  } catch (e) {
    /* ignore */
  }
  return logStream;
}

function logLine(s) {
  const ls = getLogStream();
  if (ls) ls.write(s.endsWith('\n') ? s : s + '\n');
}

function getRandomPort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startNextServer() {
  if (isDev) return 'http://localhost:3000';

  const port = await getRandomPort();
  const appRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
  const nextBin = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

  logLine(`appRoot: ${appRoot}`);
  logLine(`nextBin: ${nextBin} (exists=${fs.existsSync(nextBin)})`);
  logLine(`port: ${port}`);

  // ❗ Windows 호환성: fork()는 shebang script를 못 실행 (hashbang 무시).
  // spawn(process.execPath, ...)로 Electron binary를 Node.js처럼 사용 → Windows/Mac 모두 OK.
  // 데이터/workspace 저장 위치 결정.
  // ⚠️ Windows에서 사용자 폴더 이름이 한국어(예: C:\Users\강인환)면
  //    ffmpeg drawtext의 fontfile fopen이 실패함 → 한글 □□□.
  //    Windows는 ASCII-only path인 C:\ProgramData\ArkClipper 사용.
  // Mac/Linux는 userData 그대로 (한국어 path 거의 없음).
  let userDataDir;
  if (process.platform === 'win32') {
    // C:\ProgramData\ArkClipper — 일반 사용자도 쓰기 가능, ASCII 보장
    const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
    userDataDir = path.join(programData, 'ArkClipper');
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch (e) {
      // 권한 실패 시 userData로 fallback
      logLine(`[fatal] ProgramData mkdir failed: ${e}. Falling back to userData.`);
      userDataDir = app.getPath('userData');
    }
  } else {
    userDataDir = app.getPath('userData');
  }
  logLine(`userDataDir: ${userDataDir}`);

  // 번들된 폰트를 ASCII-safe 위치에 복사 (한국어 path 회피)
  const sourceFontsDir = path.join(appRoot, 'public', 'fonts');
  const fontsDir = path.join(userDataDir, 'fonts');
  try {
    fs.mkdirSync(fontsDir, { recursive: true });
    if (fs.existsSync(sourceFontsDir)) {
      const files = fs.readdirSync(sourceFontsDir);
      for (const f of files) {
        const src = path.join(sourceFontsDir, f);
        const dst = path.join(fontsDir, f);
        // 이미 복사돼 있고 크기 같으면 skip
        try {
          const srcStat = fs.statSync(src);
          const dstStat = fs.existsSync(dst) ? fs.statSync(dst) : null;
          if (!dstStat || dstStat.size !== srcStat.size) {
            fs.copyFileSync(src, dst);
            logLine(`copied font: ${dst}`);
          }
        } catch (e) {
          logLine(`font copy error for ${f}: ${e}`);
        }
      }
    } else {
      logLine(`⚠️ sourceFontsDir not found: ${sourceFontsDir}`);
    }
  } catch (e) {
    logLine(`fonts dir setup error: ${e}`);
  }
  logLine(`fontsDir (ASCII-safe): ${fontsDir}`);
  try {
    const installed = fs.readdirSync(fontsDir);
    logLine(`fonts installed: ${installed.join(', ')}`);
  } catch {
    /* ignore */
  }

  nextProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
      ARC_PORTABLE_ROOT: userDataDir,
      ARC_FONTS_DIR: fontsDir, // 폰트 절대경로 명시 (한국어 폰트 보장)
      ARC_LOG_FILE: logFilePath || '', // UI "로그 열기" 버튼에서 사용
      RESOURCES_PATH: process.resourcesPath,
    },
  });

  nextProcess.stdout.on('data', (d) => logLine(`[next stdout] ${d.toString().trimEnd()}`));
  nextProcess.stderr.on('data', (d) => logLine(`[next stderr] ${d.toString().trimEnd()}`));
  nextProcess.on('exit', (code, sig) => logLine(`[next exit] code=${code} sig=${sig}`));
  nextProcess.on('error', (e) => logLine(`[next error] ${e.message}`));

  const url = `http://localhost:${port}`;
  await waitForServer(url, 60_000); // Windows 첫 실행 느릴 수 있음 → 60s
  logLine(`next server ready at ${url}`);
  return url;
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Next.js server failed to start within 60s');
}

async function createWindow() {
  let url;
  try {
    url = await startNextServer();
  } catch (e) {
    logLine(`[fatal] ${e && e.stack ? e.stack : e}`);
    const logPath = path.join(app.getPath('userData'), 'next-server.log');
    dialog.showErrorBox(
      'Ark Clipper - 서버 시작 실패',
      `내부 서버를 시작하지 못했습니다.\n\n오류: ${e && e.message ? e.message : e}\n\n` +
        `로그 파일: ${logPath}\n` +
        `이 파일을 첨부해 문의주세요.`,
    );
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Ark Clipper',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(url);

  // 외부 링크는 시스템 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });

  // /api/* URL로의 페이지 navigation 차단 (다운로드는 a[download]로만 트리거).
  // 이전 버그: window.location.href = '/api/projects/download' 패턴이
  // Electron Chromium에서 페이지 자체를 navigate해서 검정 화면 + DevTools
  // source view가 뜨던 문제. 클라이언트 코드는 a 태그로 fix했지만,
  // defense-in-depth 차원에서 main에서도 차단.
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    try {
      const parsed = new URL(navUrl);
      if (parsed.pathname.startsWith('/api/')) {
        event.preventDefault();
        logLine(`[nav] blocked navigation to API endpoint: ${navUrl}`);
      }
    } catch {
      /* ignore parse errors */
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // electron-updater로 새 버전 자동 다운로드 + 알림 (production만).
  // 1초 후 첫 체크 + 이후 1시간마다 주기 체크 (앱 켜놔도 새 버전 감지).
  if (!isDev) {
    setTimeout(() => {
      setupAutoUpdater();
    }, 1000);
  }
}

/**
 * electron-updater 통합 — 백그라운드 자동 다운로드 + "재시작" 한 번 클릭으로 적용.
 * Discord/VS Code 방식. 사용자가 다운로드/재설치 의식 안 함.
 *
 * package.json의 build.publish 설정으로 GitHub Releases 사용.
 * release artifact에 latest.yml / latest-mac.yml 자동 포함되어야 함
 * (electron-builder --publish always 또는 onTag 빌드 시 자동 생성).
 */
function setupAutoUpdater() {
  let updater;
  try {
    const mod = require('electron-updater');
    updater = mod.autoUpdater;
  } catch (e) {
    logLine(`[updater] electron-updater import failed: ${e && e.message ? e.message : e}`);
    return;
  }

  // 로그 통합 — updater 내부 로그를 우리 logLine으로
  updater.logger = {
    info: (m) => logLine(`[updater] ${m}`),
    warn: (m) => logLine(`[updater][warn] ${m}`),
    error: (m) => logLine(`[updater][error] ${m}`),
    debug: () => {},
  };

  // 자동 다운로드 ON, 자동 설치는 OFF (사용자 동의 후 재시작)
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('checking-for-update', () => logLine('[updater] checking...'));
  updater.on('update-not-available', (info) => logLine(`[updater] up to date (${info && info.version})`));
  updater.on('error', (err) => logLine(`[updater] error: ${err && err.message ? err.message : err}`));
  updater.on('download-progress', (p) => {
    logLine(`[updater] downloading ${p.percent.toFixed(1)}% (${(p.bytesPerSecond / 1024).toFixed(0)} KB/s)`);
  });

  updater.on('update-available', (info) => {
    const current = app.getVersion();
    logLine(`[updater] new version: ${current} → ${info && info.version} — downloading in background`);
    // OS native toast 알림 (비침습) — 사용자가 다른 작업 중일 때도 알림
    if (Notification.isSupported()) {
      try {
        new Notification({
          title: '새 버전 다운로드 중',
          body: `v${current} → v${info.version}을(를) 백그라운드에서 받고 있어요.`,
          silent: true,
        }).show();
      } catch (e) {
        logLine(`[updater] notification error: ${e && e.message ? e.message : e}`);
      }
    }
  });

  updater.on('update-downloaded', async (info) => {
    const current = app.getVersion();
    logLine(`[updater] download complete: ${current} → ${info && info.version}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // 1. OS native toast 알림 (사용자가 앱에 포커스 안 줘도 인지 가능)
    if (Notification.isSupported()) {
      try {
        const notif = new Notification({
          title: '새 버전 준비 완료',
          body: `v${current} → v${info.version} — 클릭하면 지금 적용`,
        });
        notif.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
          killNextProcessTree();
          setImmediate(() => updater.quitAndInstall());
        });
        notif.show();
      } catch (e) {
        logLine(`[updater] notification error: ${e && e.message ? e.message : e}`);
      }
    }

    // 2. 다이얼로그 (사용자가 앱에 포커스 줘 있으면 명시적 확인)
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '새 버전 준비 완료',
      message: `Ark Clipper 업데이트가 준비됐어요`,
      detail:
        `현재: v${current}\n` +
        `새 버전: v${info.version}\n\n` +
        '지금 앱을 재시작하면 새 버전이 적용됩니다.\n' +
        '나중에 선택하면 다음 종료 시 자동 적용돼요.',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) {
      // 자식 프로세스 먼저 정리 후 quit + install
      killNextProcessTree();
      setImmediate(() => updater.quitAndInstall());
    }
  });

  // 첫 체크 (앱 시작 시 1회)
  updater.checkForUpdates().catch((e) => {
    logLine(`[updater] initial check failed: ${e && e.message ? e.message : e}`);
  });

  // 주기 체크 — 1시간마다. 앱을 계속 켜놓는 사용자도 새 버전을 놓치지 않음.
  setInterval(
    () => {
      updater.checkForUpdates().catch((e) => {
        logLine(`[updater] periodic check failed: ${e && e.message ? e.message : e}`);
      });
    },
    60 * 60 * 1000,
  );
}

app.whenReady().then(createWindow);

/**
 * Windows에서 nextProcess.kill()은 child of child를 안 죽임 → Node 서버 잔류 → 다음 설치 시 파일 lock.
 * taskkill /T /F 로 자식 트리 전체를 강제 종료.
 */
function killNextProcessTree() {
  if (!nextProcess || nextProcess.killed) return;
  const pid = nextProcess.pid;
  if (process.platform === 'win32' && pid) {
    try {
      const { execSync } = require('child_process');
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  } else {
    try {
      nextProcess.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  nextProcess = null;
}

app.on('before-quit', killNextProcessTree);
app.on('window-all-closed', () => {
  killNextProcessTree();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => {
    killNextProcessTree();
    app.quit();
  });
});
