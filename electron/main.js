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
let updateWindow; // 업데이트 진행 표시 창
let updateInfoCache; // 마지막 update-available info 보관 (다이얼로그 재사용용)

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

// WHY: 렌더러는 http://localhost:PORT 로 로드되고 API 키는 localStorage에 저장됨.
// localStorage는 origin(포트 포함)별로 격리되므로, 매 실행 랜덤 포트면 origin이 바뀌어
// 이전에 저장한 키가 사라진 것처럼 보임. → 포트를 저장해 재사용하면 origin이 고정돼 키가 유지됨.
function getPortFilePath() {
  return path.join(app.getPath('userData'), 'arc-port.json');
}

function readSavedPort() {
  try {
    const saved = JSON.parse(fs.readFileSync(getPortFilePath(), 'utf-8'));
    if (typeof saved.port === 'number' && saved.port > 0 && saved.port < 65536) {
      return saved.port;
    }
  } catch {
    /* 파일 없음/손상 — 무시 */
  }
  return null;
}

function savePort(port) {
  try {
    fs.writeFileSync(getPortFilePath(), JSON.stringify({ port }), 'utf-8');
  } catch (e) {
    logLine(`[port] save failed: ${e}`);
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '127.0.0.1');
  });
}

// 저장된 포트가 비어 있으면 재사용, 아니면 새로 잡고 저장.
async function getStablePort() {
  const saved = readSavedPort();
  if (saved && (await isPortFree(saved))) {
    logLine(`[port] reusing saved port ${saved}`);
    return saved;
  }
  const fresh = await getRandomPort();
  savePort(fresh);
  logLine(`[port] new port ${fresh} (saved=${saved ?? 'none'})`);
  return fresh;
}

async function startNextServer() {
  if (isDev) return 'http://localhost:3000';

  const port = await getStablePort();
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
/**
 * 진행률 표시용 미니 BrowserWindow (380x300, frameless 아님).
 * 메인 윈도우와 별개로 작동 — 사용자가 메인 작업하면서도 다운로드 진행률 항상 확인 가능.
 */
function ensureUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) return updateWindow;
  updateWindow = new BrowserWindow({
    width: 380,
    height: 300,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Ark Clipper 업데이트',
    backgroundColor: '#0a1428',
    alwaysOnTop: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  updateWindow.loadFile(path.join(__dirname, 'update-window.html'));
  updateWindow.on('closed', () => {
    updateWindow = null;
  });
  return updateWindow;
}

/** update-window의 DOM을 JS로 직접 갱신 (preload + IPC 없이 단순하게). */
function updateUpdateWindow(state) {
  if (!updateWindow || updateWindow.isDestroyed()) return;
  const safe = JSON.stringify(state);
  const code = `
    (function() {
      var s = ${safe};
      if (s.from != null) document.getElementById('from').textContent = s.from;
      if (s.to != null) document.getElementById('to').textContent = s.to;
      if (s.title != null) document.getElementById('title').textContent = s.title;
      if (s.status != null) {
        var el = document.getElementById('status');
        el.textContent = s.status;
        el.className = 'status' + (s.statusClass ? ' ' + s.statusClass : '');
      }
      var bar = document.getElementById('bar');
      if (s.percent != null) {
        bar.classList.remove('indeterminate');
        bar.style.width = s.percent + '%';
        document.getElementById('percent').textContent = s.percent.toFixed(1) + '%';
      } else if (s.indeterminate) {
        bar.classList.add('indeterminate');
        bar.style.width = '30%';
      }
      if (s.speed != null) document.getElementById('speed').textContent = s.speed;
      if (s.size != null) document.getElementById('size').textContent = s.size;
      if (s.showActions === true) document.getElementById('actions').style.display = 'flex';
      if (s.restartLabel != null) {
        var b = document.getElementById('restartBtn');
        b.textContent = s.restartLabel;
        b.disabled = s.restartDisabled === true;
      }
    })();
  `;
  updateWindow.webContents.executeJavaScript(code).catch(() => {});
}

function formatBytes(n) {
  if (!n || n <= 0) return '-';
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

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

  // macOS는 ad-hoc 서명 한계로 자동 다운로드해도 Squirrel.Mac code signature 검증 실패 →
  // 다운로드만 하고 못 쓰는 결과. 따라서 macOS는 "감지 + 다운로드 페이지 안내" 모드.
  // Windows는 정상적으로 자동 다운로드 + 적용 가능.
  const IS_MAC = process.platform === 'darwin';
  updater.autoDownload = !IS_MAC;
  updater.autoInstallOnAppQuit = !IS_MAC;

  updater.on('checking-for-update', () => {
    logLine('[updater] checking...');
  });

  updater.on('update-not-available', (info) => {
    logLine(`[updater] up to date (${info && info.version})`);
    // 최신이면 별도 안내 안 함 (조용히)
  });

  updater.on('error', (err) => {
    const msg = err && err.message ? err.message : String(err);
    logLine(`[updater] error: ${msg}`);
    // macOS는 autoDownload=false라 다운로드 자체를 안 하지만,
    // 만에 하나 update-check 단계에서 에러가 나면 사용자한테 빨간 창 안 띄우고 로그만.
    if (IS_MAC) return;
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateUpdateWindow({
        title: '업데이트 실패',
        status: '업데이트 다운로드 중 오류가 발생했어요: ' + msg,
        statusClass: 'err',
        indeterminate: false,
        percent: 0,
        showActions: true,
        restartLabel: '창 닫기',
        restartDisabled: false,
      });
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setProgressBar(-1);
      } catch {}
    }
  });

  updater.on('download-progress', (p) => {
    const pct = typeof p.percent === 'number' ? p.percent : 0;
    const speedKB = (p.bytesPerSecond || 0) / 1024;
    const speedStr =
      speedKB > 1024
        ? (speedKB / 1024).toFixed(2) + ' MB/s'
        : speedKB.toFixed(0) + ' KB/s';
    logLine(`[updater] downloading ${pct.toFixed(1)}% (${speedStr})`);

    // 1) 별도 progress 창 갱신
    updateUpdateWindow({
      title: '새 버전 다운로드 중',
      status: '받는 중이에요. 끝나면 알려드릴게요.',
      percent: pct,
      speed: speedStr,
      size:
        formatBytes(p.transferred || 0) + ' / ' + formatBytes(p.total || 0),
      showActions: true,
      restartLabel: '다운로드 중…',
      restartDisabled: true,
    });

    // 2) 메인 윈도우 dock / taskbar progress
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setProgressBar(pct / 100);
      } catch {}
    }
  });

  updater.on('update-available', async (info) => {
    updateInfoCache = info;
    const current = app.getVersion();
    const newer = info && info.version;

    // ━━ macOS: 다운로드 페이지 안내 모드 ━━
    if (IS_MAC) {
      logLine(`[updater] new version: ${current} → ${newer} — macOS는 수동 안내 모드`);

      // OS 토스트 (앱 포커스 없어도 인지)
      if (Notification.isSupported()) {
        try {
          new Notification({
            title: `🎉 새 버전 v${newer}`,
            body: '다운로드 페이지를 열려면 앱 창을 확인해주세요.',
            silent: false,
          }).show();
        } catch {}
      }

      if (!mainWindow || mainWindow.isDestroyed()) return;

      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '새 버전 안내',
        message: `🎉 새 버전 v${newer} 이(가) 있어요!`,
        detail:
          `현재 버전: v${current}\n` +
          `새 버전: v${newer}\n\n` +
          'macOS는 코드 서명 정책상 매번 새 dmg를 받아서 설치해주셔야 해요.\n' +
          '"다운로드 페이지 열기" 버튼을 누르면 새 버전을 받을 수 있는 페이지가 열립니다.\n\n' +
          '⏱️ 설치는 1분도 안 걸려요.',
        buttons: ['📥 다운로드 페이지 열기', '나중에'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response === 0) {
        shell.openExternal('https://tools.arkvvs.ai/tools/ark-clipper');
      }
      return;
    }

    // ━━ Windows: 자동 다운로드 + 적용 ━━
    logLine(`[updater] new version: ${current} → ${newer} — downloading in background`);

    // 1) 별도 progress 창 즉시 띄움 (사용자가 명확히 인지)
    ensureUpdateWindow();
    updateUpdateWindow({
      from: current,
      to: newer,
      title: '새 버전 다운로드 중',
      status:
        '새로운 Ark Clipper가 있어요. 백그라운드로 받고 있고, 다 받으면 알려드릴게요.',
      indeterminate: true,
      speed: '연결 중…',
      size: '-',
      showActions: false,
    });

    // 2) 메인 윈도우 위에 modal 다이얼로그로 명시적 안내
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: '업데이트 시작',
          message: `🎉 새 버전 v${newer} 이(가) 있어요!`,
          detail:
            `현재 버전: v${current}\n` +
            `새 버전: v${newer}\n\n` +
            '백그라운드로 다운로드를 시작합니다.\n' +
            '진행률은 별도 창에서 확인할 수 있어요.\n' +
            '다 받으면 "지금 재시작" 다이얼로그가 나타납니다.',
          buttons: ['확인'],
          defaultId: 0,
        })
        .catch(() => {});
    }

    // 3) OS 토스트
    if (Notification.isSupported()) {
      try {
        new Notification({
          title: '새 버전 다운로드 시작',
          body: `v${current} → v${newer} — 백그라운드로 받고 있어요.`,
          silent: false,
        }).show();
      } catch (e) {
        logLine(`[updater] notification error: ${e && e.message ? e.message : e}`);
      }
    }
  });

  updater.on('update-downloaded', async (info) => {
    const current = app.getVersion();
    const newer = info && info.version;
    logLine(`[updater] download complete: ${current} → ${newer}`);

    // dock progress 제거
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setProgressBar(-1);
      } catch {}
    }

    // 1) progress 창 → "지금 재시작" 액션 활성화
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateUpdateWindow({
        title: '다운로드 완료!',
        status: '새 버전 적용 준비 끝. "지금 재시작"을 누르면 적용됩니다.',
        statusClass: 'ok',
        percent: 100,
        speed: '완료',
        showActions: true,
        restartLabel: '🚀 지금 재시작',
        restartDisabled: false,
      });
      // 버튼 클릭 핸들러 inject
      updateWindow.webContents
        .executeJavaScript(
          `
        (function() {
          var btn = document.getElementById('restartBtn');
          var later = document.getElementById('laterBtn');
          if (btn && !btn._wired) {
            btn._wired = true;
            btn.addEventListener('click', function() {
              window.location.hash = '#restart';
            });
          }
          if (later && !later._wired) {
            later._wired = true;
            later.addEventListener('click', function() {
              window.location.hash = '#later';
            });
          }
        })();
      `,
        )
        .catch(() => {});

      // hash 변경 감지 → 액션
      updateWindow.webContents.on('did-navigate-in-page', (_e, url) => {
        if (url.endsWith('#restart')) {
          killNextProcessTree();
          setImmediate(() => updater.quitAndInstall());
        } else if (url.endsWith('#later')) {
          if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
        }
      });
    }

    // 2) OS 토스트
    if (Notification.isSupported()) {
      try {
        const notif = new Notification({
          title: '✅ 새 버전 준비 완료',
          body: `v${current} → v${newer} — 클릭하면 지금 적용`,
        });
        notif.on('click', () => {
          killNextProcessTree();
          setImmediate(() => updater.quitAndInstall());
        });
        notif.show();
      } catch (e) {
        logLine(`[updater] notification error: ${e && e.message ? e.message : e}`);
      }
    }

    // 3) 메인 윈도우 modal 다이얼로그 (마지막 결정타)
    if (mainWindow && !mainWindow.isDestroyed()) {
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '새 버전 준비 완료',
        message: `✅ v${newer} 적용 준비가 끝났어요`,
        detail:
          `현재: v${current}\n` +
          `새 버전: v${newer}\n\n` +
          '지금 앱을 재시작하면 새 버전이 적용됩니다.\n' +
          '"나중에" 선택해도 다음 종료 시 자동 적용돼요.',
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response === 0) {
        killNextProcessTree();
        setImmediate(() => updater.quitAndInstall());
      } else {
        if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
      }
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
  void updateInfoCache;
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
