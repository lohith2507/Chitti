const { app, BrowserWindow, shell, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

// ============================
// ENV LOADING
// Load .env before the server starts
// ============================

function loadEnv() {
  const locations = [
    // Electron packaged: .env next to the installed exe
    path.join(path.dirname(process.execPath), ".env"),
    // Electron packaged: in resources
    process.resourcesPath ? path.join(process.resourcesPath, ".env") : null,
    // Development: project root
    path.join(__dirname, "..", ".env"),
  ].filter(Boolean);

  for (const envPath of locations) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      break;
    }
  }
}

loadEnv();

// The server may fall back to a different port if the configured one is busy
// (e.g. another dev server already on 3000). It resolves the actual bound port
// via global.__chittiPortPromise, which we await before loading the window.
let PORT = parseInt(process.env.PORT, 10) || 3000;

// ============================
// SINGLE INSTANCE LOCK
// Prevents a second launch from trying to bind PORT (EADDRINUSE crash).
// If Chitti is already running, just focus the existing window and exit.
// ============================

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// ============================
// START EXPRESS SERVER
// Only the primary instance reaches this point.
// ============================

require("../server.bundle.cjs");

// ============================
// ELECTRON WINDOW
// ============================

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 780,
    minWidth: 380,
    minHeight: 600,
    title: "Chitti",
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Use 127.0.0.1 (not "localhost") so we always hit our IPv4 server. On Windows
  // "localhost" can resolve to IPv6 ::1 first, which may belong to a different
  // local server sharing the same port number.
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  // Show window once content is ready (no white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Minimize to tray on close
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create a simple tray icon (16x16 green circle)
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2klEQVQ4T2NkoBAwUqifgWoG" +
      "LF68+H8oEDBQywv/GRgYbBgZGRcSayDMgP9AQKQ3/jMyMuoD1S8gxgCYAf+B4D9Q3B5o" +
      "wAJiDEEYgOQNe6AB+8HmEGMIzACgAfYMDAz6QGYcAwODPjEuQBjAwMDAACRjgUx9BgYG" +
      "faBL8LoE2QXMQM1AMx2ABhwAOWHx4sX/8fkb2QULFixYgNdGdBfgNADFBTgNANoBdMF/" +
      "oAH2yC4gGIhAAxYg+wLZFwQNAGq2X7x48QJkXxA0AKiZkIuxBiKxqZiYdAwAP9FbEV/z" +
      "jC8AAAAASUVORK5CYII=",
      "base64"
    )
  );

  tray = new Tray(icon);
  tray.setToolTip("Chitti - AI Assistant");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Chitti",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Phone Access",
      click: () => {
        const { networkInterfaces } = require("os");
        const nets = networkInterfaces();
        let ip = "localhost";
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) { ip = net.address; break; }
          }
          if (ip !== "localhost") break;
        }
        const { clipboard } = require("electron");
        clipboard.writeText(`http://${ip}:${PORT}`);
        tray.displayBalloon({
          title: "Chitti",
          content: `Phone URL copied: http://${ip}:${PORT}`,
        });
      },
    },
    { type: "separator" },
    {
      label: "Quit Chitti",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ============================
// APP LIFECYCLE
// ============================

app.whenReady().then(async () => {
  // Purge any stale service-worker / HTTP caches from older builds so the
  // renderer never loads an index.html that points at a dead asset hash.
  // localStorage (saved conversations + settings) is intentionally preserved.
  try {
    const { session } = require("electron");
    await session.defaultSession.clearStorageData({
      storages: ["serviceworkers", "cachestorage"],
    });
    await session.defaultSession.clearCache();
  } catch (e) {
    console.error("Cache purge failed (non-fatal):", e.message);
  }

  // Wait for the server to report the port it actually bound to (it may have
  // fallen back from the configured port if that one was busy).
  try {
    const boundPort = await Promise.race([
      global.__chittiPortPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
    if (boundPort) PORT = boundPort;
  } catch {}

  // Poll until the Express server is ready
  const waitForServer = () => {
    const http = require("http");
    const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      if (res.statusCode === 200) {
        createWindow();
        createTray();
      } else {
        setTimeout(waitForServer, 200);
      }
    });
    req.on("error", () => setTimeout(waitForServer, 200));
    req.end();
  };
  waitForServer();
});

// Someone tried to launch a second instance - focus our window instead
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  // Don't quit - keep running in tray
});
