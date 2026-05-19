const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

const isDev = !app.isPackaged;

let mainWindow;
let nextProcess;
let logStream;

function getLogStream() {
  if (logStream) return logStream;
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'next-server.log');
    logStream = fs.createWriteStream(p, { flags: 'a' });
    logStream.write(`\n=== ${new Date().toISOString()} app start (platform=${process.platform}) ===\n`);
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
  // 데이터/workspace 저장 위치를 userData로 (Windows에서 app.asar.unpacked는 권한 X)
  // Mac: ~/Library/Application Support/Ark Clipper
  // Windows: %APPDATA%/Ark Clipper
  const userDataDir = app.getPath('userData');
  logLine(`userDataDir: ${userDataDir}`);

  nextProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1', // Electron을 일반 Node 처럼 실행
      ARC_PORTABLE_ROOT: userDataDir, // 데이터/workspace 저장 위치
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

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
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
