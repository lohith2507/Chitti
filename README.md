<div align="center">

# 🤖 Chitti

### Your personal AI assistant that actually *runs* your PC.

Chitti is a Windows-native AI assistant that chats like a friend, thinks with the best free LLMs, and **controls your computer** — open apps, take screenshots, check system stats, set volume, and more. Talk to it by typing or by voice, from your desktop **or your phone**.

<br/>

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-22-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-00E5C0)

</div>

---

## ✨ What makes Chitti different

| | Feature | Description |
|---|---|---|
| 🧠 | **Smart multi-LLM routing** | Classifies your request (code, DSA, reasoning, creative, quick) and routes it to the best free model automatically — with automatic fallback if a provider is down. |
| 🕹️ | **Real PC control** | Open/close apps, take screenshots, check CPU/RAM/battery, set volume, lock the screen, control media, read/write the clipboard, and Google things — all from chat. |
| 🗣️ | **Voice in, voice out** | Speak to Chitti with your mic (speech recognition) and have it speak replies back (text-to-speech). |
| 📱 | **Use it from your phone** | Runs a local server so any device on your Wi-Fi can open Chitti in a browser and control your PC remotely. Installable as a PWA. |
| ⚡ | **Streaming responses** | Answers stream token-by-token, just like the big assistants. |
| 🖥️ | **Native desktop app** | Ships as an Electron app with a system-tray icon, single-instance lock, and minimize-to-tray. |
| 💾 | **Private by default** | Conversations and settings live in your browser's local storage. Your API keys stay in a local `.env`. |

---

## 🧩 Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│                      Electron Desktop App                      │
│  (system tray • single instance • minimize-to-tray)            │
│                                                                │
│   ┌───────────────────────┐        ┌────────────────────────┐ │
│   │   React UI (Vite)     │  HTTP  │   Express Server        │ │
│   │  chat • voice • PWA   │◄──────►│   :3000 (auto-fallback) │ │
│   └───────────────────────┘        └───────────┬────────────┘ │
│                                                 │              │
│                          ┌──────────────────────┼───────────┐ │
│                          │                       │           │ │
│                   ┌──────▼──────┐      ┌─────────▼────────┐   │ │
│                   │  /api/chat  │      │  /api/automate   │   │ │
│                   │  LLM router │      │  PowerShell exec │   │ │
│                   └──────┬──────┘      └─────────┬────────┘   │ │
│                          │                       │            │ │
└──────────────────────────┼───────────────────────┼────────────┘
                           │                       │
              ┌────────────▼───────────┐   ┌───────▼─────────┐
              │  Groq · NVIDIA · ...   │   │  Windows / PS    │
              │   (free LLM APIs)      │   │  apps • system   │
              └────────────────────────┘   └──────────────────┘
```

The **same Express server** powers both the desktop window and any phone on the network — the Electron window is just a browser pointed at `127.0.0.1`.

---

## 🔄 How it works (flows)

### 1. Chat + smart routing flow

When you send a message with the model set to **Auto**, Chitti classifies the task and picks the best model for it.

```mermaid
flowchart TD
    A["You type / speak a message"] --> B["POST /api/chat"]
    B --> C{"Model = 'auto'?"}
    C -->|"No"| D["Use the model you picked"]
    C -->|"Yes"| E["classifyTask() on last message"]
    E --> F{"Task type?"}
    F -->|"code / dsa"| G["NVIDIA Llama 70B → Groq fallback"]
    F -->|"reasoning / creative"| H["Groq Llama 70B → NVIDIA fallback"]
    F -->|"quick"| I["Groq Llama 8B (fastest)"]
    F -->|"general"| J["Groq Llama 70B"]
    G --> K["Call provider API (streaming)"]
    H --> K
    I --> K
    J --> K
    D --> K
    K --> L["Stream tokens back to the UI"]
    L --> M["Render markdown + code blocks"]
```

**Routing table** (task → preferred models, in fallback order):

| Task type | Detected by keywords like… | Routed to |
|---|---|---|
| `code` | function, api, refactor, react, spring, docker… | NVIDIA 70B → Groq Mixtral → Groq 70B |
| `dsa` | algorithm, leetcode, bfs, dp, big o… | NVIDIA 70B → Groq 70B → Mixtral |
| `reasoning` | explain, compare, trade-off, design… | Groq 70B → NVIDIA 70B |
| `creative` | write, draft, email, summarize… | Groq 70B → NVIDIA 70B |
| `quick` | what is, define, translate, list… | Groq 8B → NVIDIA 8B → Groq 70B |
| `general` | *(anything else)* | Groq 70B → NVIDIA 70B |

### 2. PC automation flow (the fun part)

Chitti can *do things* on your machine. There are two ways an action gets triggered:

```mermaid
flowchart TD
    A["Your message"] --> B{"Slash command or plain English?"}
    B -->|"e.g. /screenshot, /open chrome"| C["Direct: POST /api/automate"]
    B -->|"e.g. 'take a screenshot'"| D["Sent to LLM /api/chat"]
    D --> E["LLM replies with an action tag<br/>e.g. Here you go. &lt;&lt;screenshot&gt;&gt;"]
    E --> F["UI detects the &lt;&lt;tag&gt;&gt;"]
    F --> C
    C --> G["parseCommand() → matches a pattern"]
    G --> H["executeCommand() runs PowerShell"]
    H --> I["Result returns to chat<br/>(message, image, or system info)"]
```

**What Chitti can control:**

| Command tag | Slash command | Does |
|---|---|---|
| `<<open:APP>>` | `/open chrome` | Launches a desktop app **or** a web app (WhatsApp, YouTube, Gmail…) |
| `<<close:APP>>` | `/close notepad` | Kills a running app |
| `<<screenshot>>` | `/ss` | Captures the primary screen and returns it inline |
| `<<sysinfo>>` | `/sysinfo` | CPU, free/total RAM, disk, battery, last boot |
| `<<search:QUERY>>` | `/search react hooks` | Opens a Google search |
| `<<url:SITE>>` | `/url github.com` | Opens a website |
| `<<volume:LEVEL>>` | `/volume 50` | Sets volume (0–100, `mute`, `unmute`) |
| `<<lock>>` | `/lock` | Locks the workstation |
| `<<media:ACTION>>` | `/media next` | play / pause / next / previous |
| `<<apps>>` | `/apps` | Lists apps with a visible window |
| `<<clipboard>>` | `/clipboard` | Reads current clipboard contents |

> Natural language works too — "open whatsapp", "how's my pc", "mute", "lock my computer", "what's running" all map to the right action.

### 3. Startup / runtime flow

```mermaid
flowchart TD
    A["Launch Chitti.exe"] --> B["Electron main.cjs loads .env"]
    B --> C{"Already running?"}
    C -->|"Yes"| D["Focus existing window & exit"]
    C -->|"No"| E["Start embedded Express server"]
    E --> F{"Port 3000 free?"}
    F -->|"No"| G["Auto-try 3001, 3002, … (up to 20)"]
    F -->|"Yes"| H["Bind port"]
    G --> H
    H --> I["Wait for /health = ok"]
    I --> J["Open BrowserWindow → 127.0.0.1:PORT"]
    J --> K["Create tray icon<br/>(Open • Phone Access • Quit)"]
```

### 4. Phone access flow

```mermaid
flowchart LR
    A["Tray → 'Phone Access'"] --> B["Copies http://your-ip:PORT"]
    B --> C["Open the URL on your phone<br/>(same Wi-Fi)"]
    C --> D["Full Chitti UI in the browser"]
    D --> E["Chat + trigger automations<br/>that run on your PC"]
```

---

## 🚀 Getting started

### Prerequisites
- **Node.js 22+**
- **Windows** (automation features use PowerShell)
- At least one free API key (see below)

### 1. Get free API keys

Chitti works with multiple providers — you only need **one** to start, but more means better routing and fallback.

| Provider | Get a free key at | Best for |
|---|---|---|
| **Groq** | [console.groq.com](https://console.groq.com) | reasoning, creative, speed |
| **NVIDIA NIM** | [build.nvidia.com](https://build.nvidia.com) | code, DSA, reasoning |
| **Cerebras** | [cloud.cerebras.ai](https://cloud.cerebras.ai) | fastest inference |

### 2. Configure your environment

```bash
cp .env.example .env
```

Then edit `.env`:

```ini
GROQ_API_KEY=gsk_your_key_here
NVIDIA_API_KEY=nvapi-your_key_here
CEREBRAS_API_KEY=your_key_here
PORT=3000
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run it

```bash
# Web dev mode (hot reload UI at http://localhost:5173, needs the server too)
npm run dev

# Full production server (builds UI + serves it on http://localhost:3000)
npm run prod

# Native desktop app (Electron)
npm run electron:dev
```

Then open **http://localhost:3000** — or grab your phone and visit `http://<your-pc-ip>:3000`.

---

## 📦 Building distributables

| Command | Output | Notes |
|---|---|---|
| `npm run build` | `dist/` | Bundles the React front-end with Vite |
| `npm run bundle` | `server.bundle.cjs` | Builds UI + bundles the server with esbuild |
| `npm run exe` | `release/Chitti.exe` | Single portable executable (pkg, Node 22 Win x64) |
| `npm run electron:build` | `release-desktop/` | Windows installer (NSIS) with desktop + start-menu shortcuts |

> When packaged, Chitti reads `.env` from the folder next to the executable, so you can ship the app and drop in keys separately.

---

## 🗂️ Project structure

```
Chitti/
├── electron/
│   └── main.cjs          # Electron main process: window, tray, env, lifecycle
├── public/               # PWA manifest, icons, service worker
├── src/
│   ├── Chitti.jsx        # The entire React UI (chat, voice, settings, routing)
│   └── main.jsx          # React entry point
├── server.js             # Express API: /api/chat (LLM router) + /api/automate
├── automation.js         # Windows control: apps, screenshots, system, media…
├── generate-icons.js     # Icon generation helper
├── index.html            # App shell
├── vite.config.js        # Vite config
└── package.json          # Scripts, deps, Electron/pkg build config
```

---

## ⚙️ Tech stack

- **Frontend:** React 19, Vite 6, `react-markdown` + `remark-gfm`, `lucide-react` icons, Web Speech API (STT + TTS), PWA/service worker
- **Backend:** Express 5, native `fetch` streaming proxy, keyword-based task classifier + routing engine
- **Automation:** Node `child_process` driving PowerShell (Start-Process, CIM/WMI queries, `System.Drawing` screenshots, media keys)
- **Desktop / packaging:** Electron 42, electron-builder (NSIS), `@yao-pkg/pkg`, esbuild

---

## 🔐 Notes on safety & privacy

- API keys live only in your local `.env` — never bundled into the UI.
- Conversations and settings are stored in your browser's `localStorage`, not sent anywhere except the LLM provider you chose.
- Destructive actions are guarded: `shutdown`/`restart` intentionally return a manual command instead of executing, so nothing powers off by accident.
- Automation only runs on the machine hosting the server. Anyone on your local network who opens the URL can trigger actions, so use it on trusted networks.

---

<div align="center">

Built with care for people who'd rather *talk* to their computer than click around it.

</div>
