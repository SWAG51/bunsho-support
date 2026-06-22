const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// ---- 設定の読み書き（APIキー・ウィンドウ位置などをローカル保存） ----
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('config save failed', e);
  }
}

// PC起動時の自動起動（Windows/Mac共通。配布版でのみ登録）
function applyAutoStart() {
  if (!app.isPackaged) return; // 開発中(electron .)は登録しない
  const enabled = loadConfig().autoStart !== false; // 既定オン
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
  } catch (e) {
    console.error('login item failed', e);
  }
}

let win = null;
let tray = null;

// アプリアイコン（青地に「文」）。PNGを優先し、無ければSVGで代替
function appIcon() {
  const png = path.join(__dirname, 'icon.png');
  try {
    if (fs.existsSync(png)) {
      const img = nativeImage.createFromPath(png);
      if (!img.isEmpty()) return img;
    }
  } catch { /* fall through */ }
  const svg = 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="#2f6df6"/><text x="16" y="23" font-size="19" font-family="Yu Gothic,Meiryo,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">文</text></svg>`
  ).toString('base64');
  return nativeImage.createFromDataURL(svg);
}

function createWindow() {
  const cfg = loadConfig();
  const bounds = cfg.bounds || {};

  win = new BrowserWindow({
    width: bounds.width || 400,
    height: bounds.height || 600,
    x: bounds.x,
    y: bounds.y,
    minWidth: 320,
    minHeight: 360,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: cfg.alwaysOnTop !== false, // 既定で最前面
    skipTaskbar: false,
    backgroundColor: '#f4f6fa',
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (cfg.alwaysOnTop !== false) {
    win.setAlwaysOnTop(true, 'floating');
  }

  win.loadFile('index.html');

  // ウィンドウ位置・サイズを記憶
  const persistBounds = () => {
    if (!win) return;
    const c = loadConfig();
    c.bounds = win.getBounds();
    saveConfig(c);
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  // 閉じる＝タスクトレイに格納（完全終了はトレイメニューから）
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(appIcon());
  tray.setToolTip('ビジネス文書生成サポート');
  const menu = Menu.buildFromTemplate([
    { label: 'ウィンドウを表示', click: () => { if (win) { win.show(); win.focus(); } } },
    {
      label: '常に最前面に表示',
      type: 'checkbox',
      checked: loadConfig().alwaysOnTop !== false,
      click: (item) => {
        const c = loadConfig();
        c.alwaysOnTop = item.checked;
        saveConfig(c);
        if (win) win.setAlwaysOnTop(item.checked, 'floating');
      },
    },
    {
      label: 'PC起動時に自動で起動',
      type: 'checkbox',
      checked: loadConfig().autoStart !== false,
      click: (item) => {
        const c = loadConfig();
        c.autoStart = item.checked;
        saveConfig(c);
        applyAutoStart();
      },
    },
    { type: 'separator' },
    { label: '終了', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (win) { win.show(); win.focus(); } });
}

// ---- 多重起動を防ぐ ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    applyAutoStart();
    createWindow();
    createTray();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (win) win.show();
    });
  });
}

app.on('window-all-closed', (e) => {
  // トレイ常駐のため終了しない
});

// ===== IPC: 設定 =====
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_e, patch) => {
  const c = loadConfig();
  Object.assign(c, patch);
  saveConfig(c);
  return c;
});

// ===== IPC: ウィンドウ操作 =====
ipcMain.on('win:hide', () => { if (win) win.hide(); });
ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.handle('win:toggleTop', () => {
  const c = loadConfig();
  const next = !(c.alwaysOnTop !== false);
  c.alwaysOnTop = next;
  saveConfig(c);
  if (win) win.setAlwaysOnTop(next, 'floating');
  return next;
});
ipcMain.on('open:external', (_e, url) => { shell.openExternal(url); });

// ===== IPC: Gemini モデル一覧（最適なflashモデルを自動選択するため） =====
ipcMain.handle('gemini:listModels', async (_e, apiKey) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`モデル一覧の取得に失敗 (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
});

// ===== IPC: Gemini 生成 =====
ipcMain.handle('gemini:generate', async (_e, { apiKey, model, system, user, temperature }) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.8,
      maxOutputTokens: 2048,
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`生成に失敗 (${res.status}): ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const text =
    cand && cand.content && cand.content.parts
      ? cand.content.parts.map((p) => p.text || '').join('')
      : '';
  if (!text) {
    throw new Error('返答が空でした。少し言い回しを変えてもう一度お試しください。');
  }
  return text.trim();
});
