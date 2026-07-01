// ============================
// CHITTI - Windows Automation Module
// Controls the PC from any device
// ============================

import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, unlink } from "fs/promises";

const run = promisify(exec);

// Run a PowerShell command safely
async function ps(cmd, timeout = 10000) {
  const { stdout, stderr } = await run(
    `powershell -NoProfile -NonInteractive -Command "${cmd.replace(/"/g, '\\"')}"`,
    { timeout, windowsHide: true }
  );
  return stdout.trim();
}

// ============================
// APP CONTROL
// ============================

const APP_MAP = {
  chrome: "chrome",
  browser: "chrome",
  brave: "brave",
  firefox: "firefox",
  edge: "msedge",
  notepad: "notepad",
  calculator: "calc",
  calc: "calc",
  explorer: "explorer",
  "file explorer": "explorer",
  files: "explorer",
  terminal: "wt",
  cmd: "cmd",
  powershell: "powershell",
  vscode: "code",
  "vs code": "code",
  code: "code",
  spotify: "spotify",
  slack: "slack",
  discord: "discord",
  teams: "msteams",
  outlook: "outlook",
  word: "winword",
  excel: "excel",
  paint: "mspaint",
  snip: "snippingtool",
  settings: "ms-settings:",
  "task manager": "taskmgr",
};

// Web apps that should open as URLs in the browser
const WEB_APPS = {
  whatsapp: "web.whatsapp.com",
  "whats app": "web.whatsapp.com",
  telegram: "web.telegram.org",
  youtube: "youtube.com",
  gmail: "mail.google.com",
  "google mail": "mail.google.com",
  twitter: "x.com",
  x: "x.com",
  facebook: "facebook.com",
  instagram: "instagram.com",
  linkedin: "linkedin.com",
  reddit: "reddit.com",
  github: "github.com",
  chatgpt: "chatgpt.com",
  netflix: "netflix.com",
  "amazon prime": "primevideo.com",
  prime: "primevideo.com",
  hotstar: "hotstar.com",
  maps: "maps.google.com",
  "google maps": "maps.google.com",
  drive: "drive.google.com",
  "google drive": "drive.google.com",
  docs: "docs.google.com",
  "google docs": "docs.google.com",
  sheets: "sheets.google.com",
  "google sheets": "sheets.google.com",
  notion: "notion.so",
  figma: "figma.com",
  canva: "canva.com",
  "chat gpt": "chatgpt.com",
  gemini: "gemini.google.com",
  claude: "claude.ai",
  jira: "atlassian.net",
  trello: "trello.com",
};

export async function openApp(name) {
  const lower = name.toLowerCase().trim();
  // Check if it's a web app first → open in browser
  const webUrl = WEB_APPS[lower];
  if (webUrl) return openUrl(webUrl);
  const exe = APP_MAP[lower] || lower;
  try {
    // Use Start-Process (not cmd's `start`): it throws a catchable error if the
    // app isn't found instead of popping a blocking "Windows cannot find..."
    // dialog, and the timeout guarantees we never hang the request.
    await ps(`Start-Process '${exe.replace(/'/g, "''")}'`, 8000);
    return { ok: true, message: `Opened ${name}` };
  } catch {
    return { ok: false, message: `Could not open "${name}". It may not be installed or I didn't recognize it.` };
  }
}

export async function closeApp(name) {
  const lower = name.toLowerCase().trim();
  const exe = APP_MAP[lower] || lower;
  const processName = exe.replace(/\.exe$/i, "");
  try {
    await ps(`Stop-Process -Name '${processName}' -Force -ErrorAction SilentlyContinue`);
    return { ok: true, message: `Closed ${name}` };
  } catch {
    return { ok: false, message: `Could not close "${name}"` };
  }
}

export async function listRunningApps() {
  const result = await ps(
    "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -Property Name,MainWindowTitle | ConvertTo-Json"
  );
  try {
    const clean = result.replace(/[\r\n]+/g, "").trim();
    const apps = JSON.parse(clean);
    const list = (Array.isArray(apps) ? apps : [apps])
      .filter(a => a.Name && a.MainWindowTitle)
      .map(a => ({ name: a.Name, title: a.MainWindowTitle }));
    return { ok: true, apps: list };
  } catch {
    return { ok: true, apps: [], raw: result };
  }
}

// ============================
// BROWSER CONTROL
// ============================

export async function openUrl(url) {
  if (!url.startsWith("http")) url = "https://" + url;
  try {
    await ps(`Start-Process '${url.replace(/'/g, "''")}'`, 8000);
    return { ok: true, message: `Opened ${url}` };
  } catch (e) {
    return { ok: false, message: `Could not open URL: ${e.message}` };
  }
}

export async function searchWeb(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return openUrl(url);
}

// ============================
// SYSTEM CONTROL
// ============================

export async function getSystemInfo() {
  const [cpu, mem, disk, battery, uptime] = await Promise.all([
    ps("(Get-CimInstance Win32_Processor).Name").catch(() => "unknown"),
    ps("[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,1)").catch(() => "?"),
    ps("[math]::Round((Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\").FreeSpace/1GB,1)").catch(() => "?"),
    ps("(Get-CimInstance Win32_Battery).EstimatedChargeRemaining").catch(() => "N/A"),
    ps("(Get-CimInstance Win32_OperatingSystem).LastBootUpTime").catch(() => "?"),
  ]);

  const totalMem = await ps("[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1)").catch(() => "?");

  return {
    ok: true,
    info: {
      cpu,
      memory: `${mem} GB free / ${totalMem} GB total`,
      disk: `${disk} GB free on C:`,
      battery: battery !== "N/A" ? `${battery}%` : "No battery (desktop)",
      lastBoot: uptime,
    },
  };
}

export async function setVolume(level) {
  // level: 0-100 or "mute"/"unmute"
  if (level === "mute") {
    await ps("(New-Object -ComObject WScript.Shell).SendKeys([char]173)");
    return { ok: true, message: "Muted" };
  }
  if (level === "unmute") {
    await ps("(New-Object -ComObject WScript.Shell).SendKeys([char]173)");
    return { ok: true, message: "Unmuted (toggled)" };
  }
  const vol = Math.max(0, Math.min(100, parseInt(level)));
  await ps(`
    $vol = ${vol / 100};
    $obj = New-Object -ComObject WScript.Shell;
    1..50 | ForEach-Object { $obj.SendKeys([char]174) };
    $steps = [math]::Round($vol * 50);
    1..$steps | ForEach-Object { $obj.SendKeys([char]175) }
  `);
  return { ok: true, message: `Volume set to ~${vol}%` };
}

export async function lockScreen() {
  await run("rundll32.exe user32.dll,LockWorkStation");
  return { ok: true, message: "Screen locked" };
}

export async function shutdown(action = "shutdown") {
  // NOT actually executing - returning confirmation prompt
  return { ok: false, message: `For safety, run this manually: shutdown /${action === "restart" ? "r" : "s"} /t 30` };
}

// ============================
// SCREENSHOT
// ============================

export async function takeScreenshot() {
  const filename = `chitti_ss_${Date.now()}.png`;
  const filepath = join(tmpdir(), filename);
  const psPath = filepath.replace(/\\/g, "\\\\");
  try {
    await run(
      `powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save('${psPath}'); $g.Dispose(); $bmp.Dispose()"`,
      { timeout: 15000, windowsHide: true }
    );

    const data = await readFile(filepath);
    const base64 = data.toString("base64");
    await unlink(filepath).catch(() => {});
    return { ok: true, image: `data:image/png;base64,${base64}` };
  } catch (e) {
    return { ok: false, message: `Screenshot failed: ${e.message}` };
  }
}

// ============================
// MEDIA CONTROL
// ============================

export async function mediaControl(action) {
  const keys = {
    play: "176",    // play/pause
    pause: "176",
    next: "177",    // next track
    previous: "178", // prev track
    stop: "179",
  };
  const key = keys[action?.toLowerCase()];
  if (!key) return { ok: false, message: `Unknown media action: ${action}` };

  await ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]${key})`);
  return { ok: true, message: `Media: ${action}` };
}

// ============================
// CLIPBOARD
// ============================

export async function getClipboard() {
  const text = await ps("Get-Clipboard");
  return { ok: true, text };
}

export async function setClipboard(text) {
  await ps(`Set-Clipboard -Value '${text.replace(/'/g, "''")}'`);
  return { ok: true, message: "Copied to clipboard" };
}

// ============================
// NOTIFICATIONS
// ============================

export async function showNotification(title, message) {
  await ps(`
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(0);
    $textNodes = $template.GetElementsByTagName('text');
    $textNodes.Item(0).AppendChild($template.CreateTextNode('${title.replace(/'/g, "''")}')) | Out-Null;
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template);
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Chitti').Show($toast)
  `).catch(() => {});
  return { ok: true, message: `Notification sent: ${title}` };
}

// ============================
// COMMAND PARSER
// Parses natural language into automation actions
// ============================

const COMMAND_PATTERNS = [
  // === Slash commands (exact, highest priority) ===
  { pattern: /^\/open\s+(.+)/i, action: (m) => ({ type: "open_app", app: m[1] }) },
  { pattern: /^\/close\s+(.+)/i, action: (m) => ({ type: "close_app", app: m[1] }) },
  { pattern: /^\/apps$/i, action: () => ({ type: "list_apps" }) },
  { pattern: /^\/url\s+(.+)/i, action: (m) => ({ type: "open_url", url: m[1] }) },
  { pattern: /^\/search\s+(.+)/i, action: (m) => ({ type: "search", query: m[1] }) },
  { pattern: /^\/screenshot$/i, action: () => ({ type: "screenshot" }) },
  { pattern: /^\/ss$/i, action: () => ({ type: "screenshot" }) },
  { pattern: /^\/sysinfo$/i, action: () => ({ type: "system_info" }) },
  { pattern: /^\/volume\s+(.+)/i, action: (m) => ({ type: "volume", level: m[1] }) },
  { pattern: /^\/lock$/i, action: () => ({ type: "lock" }) },
  { pattern: /^\/media\s+(.+)/i, action: (m) => ({ type: "media", action: m[1] }) },
  { pattern: /^\/clipboard$/i, action: () => ({ type: "clipboard_get" }) },
  { pattern: /^\/copy\s+(.+)/i, action: (m) => ({ type: "clipboard_set", text: m[1] }) },
  { pattern: /^\/notify\s+(.+)/i, action: (m) => ({ type: "notify", title: "Chitti", message: m[1] }) },

  // === Natural language (flexible, matches anywhere in sentence) ===

  // Screenshot - "take a screenshot", "screenshot please", "can you take a screenshot", "capture my screen"
  { pattern: /\b(?:take\s+(?:a\s+)?)?screenshot\b/i, action: () => ({ type: "screenshot" }) },
  { pattern: /\bcapture\s+(?:my\s+)?(?:the\s+)?screen\b/i, action: () => ({ type: "screenshot" }) },
  { pattern: /\bscreen\s*(?:shot|capture|grab)\b/i, action: () => ({ type: "screenshot" }) },
  { pattern: /\bsnap\s+(?:my\s+)?(?:the\s+)?screen\b/i, action: () => ({ type: "screenshot" }) },
  { pattern: /\bshow\s+(?:me\s+)?(?:my\s+)?(?:the\s+)?screen\b/i, action: () => ({ type: "screenshot" }) },

  // Open in browser - "open WhatsApp in Chrome", "open YouTube on browser"
  { pattern: /\b(?:open|launch|start)\s+(?:up\s+)?(?:the\s+)?(\w[\w\s]*?)\s+(?:in|on|using|with)\s+(?:the\s+)?(?:chrome|browser|edge|firefox)\b/i, action: (m) => ({ type: "open_app", app: m[1].trim() }) },

  // Open app - "open chrome", "can you open chrome", "please launch vscode", "start notepad"
  { pattern: /\b(?:open|launch|start|run)\s+(?:up\s+)?(?:the\s+)?(\w[\w\s]*?)(?:\s+(?:app|application|please|for me))?$/i, action: (m) => ({ type: "open_app", app: m[1].trim() }) },

  // Close app - "close chrome", "kill notepad", "quit vscode", "shut down chrome"
  { pattern: /\b(?:close|quit|kill|exit|stop|shut\s*down)\s+(?:the\s+)?(\w[\w\s]*?)(?:\s+(?:app|application|please|for me))?$/i, action: (m) => ({ type: "close_app", app: m[1].trim() }) },

  // Search - "search for react hooks", "google spring boot", "look up java interview questions"
  { pattern: /\b(?:search|google|look\s*up|find)\s+(?:for\s+)?(?:me\s+)?(.+)/i, action: (m) => ({ type: "search", query: m[1].trim() }) },

  // Lock - "lock the screen", "lock my pc", "lock computer", "lock it"
  { pattern: /\block\s+(?:the\s+)?(?:my\s+)?(?:screen|pc|computer|system|it)\b/i, action: () => ({ type: "lock" }) },
  { pattern: /\block\s+(?:the\s+)?(?:my\s+)?(?:screen|pc|computer)\b/i, action: () => ({ type: "lock" }) },

  // Volume - "set volume to 50", "volume 80", "turn volume up", "make it louder"
  { pattern: /\bvolume\s+(?:to\s+)?(\d+)/i, action: (m) => ({ type: "volume", level: m[1] }) },
  { pattern: /\b(?:set|change|adjust)\s+(?:the\s+)?volume\s+(?:to\s+)?(\d+)/i, action: (m) => ({ type: "volume", level: m[1] }) },
  { pattern: /\bmute\b/i, action: () => ({ type: "volume", level: "mute" }) },
  { pattern: /\bunmute\b/i, action: () => ({ type: "volume", level: "unmute" }) },

  // Media - "play music", "pause", "next song", "skip track"
  { pattern: /\b(?:play|pause|resume)\s*(?:the\s+)?(?:music|song|track|audio)?/i, action: () => ({ type: "media", action: "play" }) },
  { pattern: /\b(?:next|skip)\s+(?:the\s+)?(?:track|song|music)/i, action: () => ({ type: "media", action: "next" }) },
  { pattern: /\b(?:prev|previous|go\s+back)\s+(?:the\s+)?(?:track|song)/i, action: () => ({ type: "media", action: "previous" }) },

  // System info - "system info", "how's my pc", "system status", "check my system", "battery"
  { pattern: /\b(?:system|sys|pc|computer|machine|device)\s*(?:info|status|health|stats|details)\b/i, action: () => ({ type: "system_info" }) },
  { pattern: /\bhow(?:'s| is)\s+(?:my\s+)?(?:pc|computer|system|machine)\b/i, action: () => ({ type: "system_info" }) },
  { pattern: /\b(?:check|show|get)\s+(?:my\s+)?(?:system|battery|cpu|ram|memory|disk)\b/i, action: () => ({ type: "system_info" }) },
  { pattern: /\bbattery\s*(?:level|status|percentage|life)?\b/i, action: () => ({ type: "system_info" }) },

  // List apps - "show apps", "what's running", "running apps", "list processes"
  { pattern: /\b(?:show|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:running\s+)?(?:apps|applications|programs|processes)\b/i, action: () => ({ type: "list_apps" }) },
  { pattern: /\bwhat(?:'s| is)\s+running\b/i, action: () => ({ type: "list_apps" }) },
  { pattern: /\brunning\s+(?:apps|programs|processes)\b/i, action: () => ({ type: "list_apps" }) },

  // Open URL - "go to google.com", "open website youtube.com"
  { pattern: /\b(?:go\s+to|open|visit|navigate\s+to)\s+(?:the\s+)?(?:url|website|site)?\s*(https?:\/\/.+|[\w.-]+\.(?:com|org|net|io|dev|ai|co)\S*)/i, action: (m) => ({ type: "open_url", url: m[1] }) },

  // Clipboard - "what's on my clipboard", "show clipboard", "paste clipboard"
  { pattern: /\bclipboard\b/i, action: () => ({ type: "clipboard_get" }) },
];

export function parseCommand(text) {
  for (const { pattern, action } of COMMAND_PATTERNS) {
    const match = text.match(pattern);
    if (match) return action(match);
  }
  return null;
}

export async function executeCommand(cmd) {
  switch (cmd.type) {
    case "open_app": return openApp(cmd.app);
    case "close_app": return closeApp(cmd.app);
    case "list_apps": return listRunningApps();
    case "open_url": return openUrl(cmd.url);
    case "search": return searchWeb(cmd.query);
    case "screenshot": return takeScreenshot();
    case "system_info": return getSystemInfo();
    case "volume": return setVolume(cmd.level);
    case "lock": return lockScreen();
    case "media": return mediaControl(cmd.action);
    case "clipboard_get": return getClipboard();
    case "clipboard_set": return setClipboard(cmd.text);
    case "notify": return showNotification(cmd.title, cmd.message);
    default: return { ok: false, message: `Unknown command type: ${cmd.type}` };
  }
}
