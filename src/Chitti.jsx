import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Mic, MicOff, Send, Volume2, VolumeX, Square, Trash2,
  WifiOff, Download, Settings, X, Copy, Check, ChevronDown,
  MessageSquare, RotateCcw, Zap, Cpu, Brain
} from "lucide-react";

// ============================
// CHITTI - Lohith's AI Assistant
// Multi-LLM with intelligent routing
// ============================

const MODELS = [
  { id: "auto",             name: "Auto",            desc: "Smart routing by task type", provider: "auto",   icon: "zap" },
  { id: "groq-llama-70b",   name: "Groq Llama 70B",  desc: "Deep reasoning & creative", provider: "groq",   icon: "brain" },
  { id: "groq-mixtral",     name: "Groq Mixtral",    desc: "Code & multilingual",       provider: "groq",   icon: "brain" },
  { id: "groq-llama-8b",    name: "Groq Llama 8B",   desc: "Fastest responses",         provider: "groq",   icon: "brain" },
  { id: "nvidia-llama-70b", name: "NVIDIA Llama 70B", desc: "Code, DSA & reasoning",    provider: "nvidia",  icon: "cpu" },
  { id: "nvidia-llama-8b",  name: "NVIDIA Llama 8B",  desc: "Fast code helper",         provider: "nvidia",  icon: "cpu" },
];

const DEFAULT_MODEL = "auto";

// System prompt aligned with Claude Fable 5 tone principles
const SYSTEM_PROMPT = `You are Chitti, Lohith's personal AI assistant. You run directly on his Windows PC and have full system control.

Lohith is a Senior Backend Developer at Costco (Identity Team, GDX), working on DMC Core Modernization. His stack is Java 21, Spring Boot 3.5, Kubernetes on GKE, GCP Spanner, Redis, Apigee X, and GitHub Actions. He's also job searching for AI/LLM + Java roles and practicing DSA (LeetCode: lohithv2507). Treat him as the capable senior engineer he is.

You have DIRECT CONTROL over his Windows PC. When he asks you to do something on his computer, execute it immediately by including the action tag in your response. Never say you cannot control his system.

Action tags (include exactly one when executing a system action):
<<open:APP_NAME>> Open app or web app (chrome, notepad, vscode, whatsapp, youtube, gmail, spotify, etc.)
<<close:APP_NAME>> Close/kill an app
<<screenshot>> Take a screenshot
<<sysinfo>> System info (CPU, RAM, battery, disk)
<<search:QUERY>> Google search
<<url:WEBSITE>> Open a URL
<<volume:LEVEL>> Volume (0-100, mute, unmute)
<<lock>> Lock screen
<<media:ACTION>> Media (play, pause, next, previous)
<<apps>> List running apps
<<clipboard>> Clipboard contents

Keep your message brief around the tag. Examples:
"open chrome" -> "Opening Chrome. <<open:chrome>>"
"what's my battery" -> "Checking. <<sysinfo>>"
"take a screenshot" -> "Here you go. <<screenshot>>"
"search for react hooks" -> "Searching. <<search:react hooks>>"

Your style follows these principles:
Write naturally and conversationally, like a sharp, warm friend. Use prose, not bullet points, unless the content genuinely demands a list. Keep formatting minimal. No bold overload, no unnecessary headers. One question per response maximum. Use code blocks only for actual code. If a response might be read aloud, keep it clean and speakable. Be honest when unsure. Never open with hollow praise like "Great question!" and never use em dashes.`;

// ---- Storage helpers ----
const STORAGE_KEY = "chitti_conversations";
const SETTINGS_KEY = "chitti_settings";

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversations(convos) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convos)); } catch {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Validate saved model still exists in MODELS list
    if (s.model && !MODELS.find(m => m.id === s.model)) {
      s.model = DEFAULT_MODEL;
    }
    return s;
  } catch { return null; }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ---- Markdown components ----
function MarkdownMessage({ content }) {
  const [copied, setCopied] = useState(null);

  const copyCode = (code, idx) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  let codeBlockIdx = 0;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const code = String(children).replace(/\n$/, "");
          if (inline) {
            return <code style={mdStyles.inlineCode} {...props}>{children}</code>;
          }
          const idx = codeBlockIdx++;
          const lang = className?.replace("language-", "") || "";
          return (
            <div style={mdStyles.codeBlock}>
              <div style={mdStyles.codeHeader}>
                <span style={mdStyles.codeLang}>{lang || "code"}</span>
                <button
                  onClick={() => copyCode(code, idx)}
                  style={mdStyles.copyBtn}
                  title="Copy code"
                >
                  {copied === idx ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
              <pre style={mdStyles.pre}><code {...props}>{children}</code></pre>
            </div>
          );
        },
        p({ children }) { return <p style={mdStyles.p}>{children}</p>; },
        ul({ children }) { return <ul style={mdStyles.ul}>{children}</ul>; },
        ol({ children }) { return <ol style={mdStyles.ol}>{children}</ol>; },
        li({ children }) { return <li style={mdStyles.li}>{children}</li>; },
        a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" style={mdStyles.a}>{children}</a>; },
        h1({ children }) { return <h3 style={mdStyles.h}>{children}</h3>; },
        h2({ children }) { return <h3 style={mdStyles.h}>{children}</h3>; },
        h3({ children }) { return <h3 style={mdStyles.h}>{children}</h3>; },
        blockquote({ children }) { return <blockquote style={mdStyles.blockquote}>{children}</blockquote>; },
        table({ children }) { return <div style={mdStyles.tableWrap}><table style={mdStyles.table}>{children}</table></div>; },
        th({ children }) { return <th style={mdStyles.th}>{children}</th>; },
        td({ children }) { return <td style={mdStyles.td}>{children}</td>; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ---- Main Component ----
export default function Chitti() {
  // Load saved settings
  const saved = useMemo(() => loadSettings(), []);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(saved?.voiceOn ?? true);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [interim, setInterim] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [model, setModel] = useState(saved?.model ?? DEFAULT_MODEL);
  const [speechRate, setSpeechRate] = useState(saved?.speechRate ?? 1.0);
  const [conversations, setConversations] = useState(() => loadConversations());
  const [activeConvoId, setActiveConvoId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [commandHint, setCommandHint] = useState("");
  const [routeInfo, setRouteInfo] = useState(null); // { provider, model, task }

  const recogRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Persist settings on change
  useEffect(() => {
    saveSettings({ voiceOn, model, speechRate });
  }, [voiceOn, model, speechRate]);

  // ---- Online/offline tracking ----
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ---- PWA install prompt ----
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ---- Register service worker ----
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // ---- Speech recognition setup ----
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        setInput("");
        send(finalText.trim());
      }
    };
    r.onerror = (e) => {
      setListening(false);
      setInterim("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setError("Mic permission blocked. Allow microphone access for this site.");
    };
    r.onend = () => setListening(false);
    recogRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, interim]);

  // ---- Auto-save conversation ----
  useEffect(() => {
    if (messages.length === 0) return;
    const id = activeConvoId || Date.now().toString();
    if (!activeConvoId) setActiveConvoId(id);

    const firstUserMsg = messages.find(m => m.role === "user");
    const title = firstUserMsg?.content?.slice(0, 50) || "New conversation";

    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      updated.unshift({ id, title, messages, updatedAt: Date.now() });
      // Keep last 50 conversations
      const trimmed = updated.slice(0, 50);
      saveConversations(trimmed);
      return trimmed;
    });
  }, [messages]);

  const toggleMic = () => {
    const r = recogRef.current;
    if (!r) { setError("Voice input not supported. Try Chrome."); return; }
    if (listening) { try { r.stop(); } catch {} setListening(false); return; }
    stopSpeaking();
    setError("");
    try { r.start(); setListening(true); } catch {}
  };

  // ---- Text to speech ----
  const stopSpeaking = useCallback(() => {
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  }, []);

  const speak = useCallback((text) => {
    if (!voiceOn || !window.speechSynthesis) return;
    // Strip markdown for speech
    const clean = text
      .replace(/```[\s\S]*?```/g, "code block omitted")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[#*_~\[\]()>]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ");
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = speechRate;
      u.pitch = 1.0;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {}
  }, [voiceOn, speechRate]);

  // ---- Command handling ----
  const handleCommand = (text) => {
    const cmd = text.toLowerCase().trim();
    if (cmd === "/clear") { clearChat(); return true; }
    if (cmd === "/voice") { setVoiceOn(v => !v); return true; }
    if (cmd === "/settings") { setShowSettings(true); return true; }
    if (cmd === "/export") { exportConversation(); return true; }
    if (cmd === "/history") { setShowHistory(true); return true; }
    if (cmd.startsWith("/model ")) {
      const m = cmd.slice(7).trim();
      const found = MODELS.find(mod => mod.id.includes(m) || mod.name.toLowerCase().includes(m));
      if (found) { setModel(found.id); setError(""); }
      else setError("Unknown model. Try: auto, cerebras, groq, nvidia, mixtral, nemotron");
      return true;
    }
    return false;
  };

  // ---- Send to LLM (streaming, multi-provider) ----
  // ---- Try automation first ----
  const tryAutomate = async (text) => {
    try {
      // Hard timeout so a stuck system command can never freeze the UI.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      const data = await res.json();
      if (!data.matched) return false;

      let response = "";
      if (data.commandType === "screenshot" && data.ok && data.image) {
        response = "Here's your screen right now:";
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: response, image: data.image };
          return copy;
        });
      } else if (data.commandType === "list_apps" && data.ok) {
        const appList = data.apps.map(a => `${a.name} — ${a.title}`).join("\n");
        response = `Here's what's running:\n\n${appList}`;
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: response };
          return copy;
        });
      } else if (data.commandType === "system_info" && data.ok) {
        const info = data.info;
        response = `CPU: ${info.cpu}\nMemory: ${info.memory}\nDisk: ${info.disk}\nBattery: ${info.battery}`;
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: response };
          return copy;
        });
      } else if (data.commandType === "clipboard_get" && data.ok) {
        response = `Clipboard:\n\n\`\`\`\n${data.text}\n\`\`\``;
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: response };
          return copy;
        });
      } else {
        response = data.message || (data.ok ? "Done." : "Failed.");
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: response };
          return copy;
        });
      }
      if (response && !data.image) speak(response.replace(/[*`#\n-]/g, " "));
      return true;
    } catch {
      return false;
    }
  };

  // Execute action tags from LLM response (<<open:chrome>>, <<screenshot>>, etc.)
  const executeActionTag = async (fullText) => {
    const tagMatch = fullText.match(/<<(\w+)(?::(.+?))?>>/);
    if (!tagMatch) return false;

    const [fullTag, action, param] = tagMatch;
    // Only keep text BEFORE the tag (text after is often hallucinated)
    const cleanText = fullText.slice(0, tagMatch.index).replace(/\s+$/, "");

    // Map LLM action tags to automation command text
    const commandMap = {
      open: `open ${param}`,
      close: `close ${param}`,
      screenshot: "screenshot",
      sysinfo: "system info",
      search: `search ${param}`,
      url: `go to ${param}`,
      volume: `volume ${param}`,
      lock: "lock screen",
      media: `${param} music`,
      apps: "show running apps",
      clipboard: "clipboard",
    };

    const cmdText = commandMap[action];
    if (!cmdText) return false;

    try {
      const res = await fetch("/api/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cmdText }),
      });
      const data = await res.json();
      if (!data.matched || !data.ok) return false;

      // Update the message: remove the tag, show automation result
      if (data.commandType === "screenshot" && data.image) {
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: cleanText || "Here's your screen:", image: data.image };
          return copy;
        });
      } else if (data.commandType === "system_info" && data.info) {
        const info = data.info;
        const infoText = `${cleanText ? cleanText + "\n\n" : ""}CPU: ${info.cpu}\nMemory: ${info.memory}\nDisk: ${info.disk}\nBattery: ${info.battery}`;
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: infoText };
          return copy;
        });
      } else if (data.commandType === "list_apps" && data.apps) {
        const appList = data.apps.map(a => `${a.name} — ${a.title}`).join("\n");
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `${cleanText ? cleanText + "\n\n" : ""}${appList}` };
          return copy;
        });
      } else {
        const msg = cleanText || data.message || "Done.";
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: msg };
          return copy;
        });
      }
      speak(cleanText || data.message || "Done");
      return true;
    } catch {
      return false;
    }
  };

  const send = useCallback(async (textArg) => {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;

    // Handle local UI commands
    if (text.startsWith("/")) {
      const localCmds = ["/clear", "/voice", "/settings", "/export", "/history"];
      if (localCmds.some(c => text.toLowerCase().startsWith(c)) || text.toLowerCase().startsWith("/model ")) {
        if (handleCommand(text)) { setInput(""); return; }
      }
    }

    if (!online) { setError("You're offline. Connect to the internet to talk to Chitti."); return; }
    setError("");
    setInput("");
    setCommandHint("");
    setRouteInfo(null);
    stopSpeaking();

    const history = [...messages, { role: "user", content: text }];
    setMessages(history);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    // Try automation first (slash commands + natural language)
    const automated = await tryAutomate(text);
    if (automated) { setBusy(false); return; }

    // Abort controller for cancellation
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          stream: true,
          messages: apiMessages,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status})${errText ? ": " + errText.slice(0, 100) : ""}`);
      }

      // Read routing info from headers
      const rProvider = res.headers.get("X-Chitti-Provider");
      const rModel = res.headers.get("X-Chitti-Model");
      const rTask = res.headers.get("X-Chitti-Task");
      if (rProvider) setRouteInfo({ provider: rProvider, model: rModel, task: rTask });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data);
            // OpenAI-style streaming format
            const delta = evt.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch {}
        }
      }

      // Check if LLM response contains an action tag to execute
      if (acc && /<<\w+(?::.+?)?>>/g.test(acc)) {
        await executeActionTag(acc);
      } else if (acc) {
        speak(acc);
      }
    } catch (e) {
      if (e.name === "AbortError") {
        // User cancelled - keep partial response
      } else {
        setMessages((m) => {
          const copy = [...m];
          if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop();
          return copy;
        });
        setError("Could not reach Chitti. " + (e.message || "Check your connection."));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, messages, speak, stopSpeaking, online, model]);

  const cancelRequest = () => {
    if (abortRef.current) abortRef.current.abort();
    setBusy(false);
  };

  const clearChat = () => {
    stopSpeaking();
    setMessages([]);
    setActiveConvoId(null);
    setError("");
  };

  const exportConversation = () => {
    if (messages.length === 0) return;
    const text = messages.map(m => `${m.role === "user" ? "You" : "Chitti"}: ${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chitti-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadConversation = (convo) => {
    setMessages(convo.messages);
    setActiveConvoId(convo.id);
    setShowHistory(false);
  };

  const deleteConversation = (id) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (activeConvoId === id) clearChat();
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  };

  // Command hints
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith("/")) {
      const commands = ["/clear", "/voice", "/model", "/settings", "/export", "/history"];
      const match = commands.filter(c => c.startsWith(val.toLowerCase()));
      setCommandHint(match.length === 1 ? match[0] : match.length > 1 ? match.join("  ") : "");
    } else {
      setCommandHint("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    // Tab to accept command hint
    if (e.key === "Tab" && commandHint && !commandHint.includes("  ")) {
      e.preventDefault();
      setInput(commandHint);
      setCommandHint("");
    }
  };

  const orbState = listening ? "listening" : speaking ? "speaking" : busy ? "thinking" : "idle";
  const currentModel = MODELS.find(m => m.id === model);

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* ---- Header ---- */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <span style={styles.brandDot} className={`orb-mini ${orbState}`} />
          <div>
            <div style={styles.title}>CHITTI</div>
            <div style={styles.subtitle}>
              {!online ? "offline"
                : orbState === "listening" ? "listening..."
                : orbState === "thinking"
                  ? routeInfo ? `thinking via ${routeInfo.provider}...` : `routing...`
                : orbState === "speaking" ? "speaking..."
                : routeInfo ? `${routeInfo.provider} / ${routeInfo.task}` : (currentModel?.name || "online")}
            </div>
          </div>
        </div>
        <div style={styles.headerActions}>
          {!online && (
            <span style={styles.offlineBadge}><WifiOff size={14} /> offline</span>
          )}
          {installPrompt && (
            <button onClick={handleInstall} style={styles.installBtn} title="Install Chitti">
              <Download size={14} />
            </button>
          )}
          <button title="History" onClick={() => setShowHistory(true)} style={styles.iconBtn}>
            <MessageSquare size={18} />
          </button>
          <button title={voiceOn ? "Mute voice" : "Unmute voice"} onClick={() => { setVoiceOn(v => !v); stopSpeaking(); }} style={styles.iconBtn}>
            {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button title="Settings" onClick={() => setShowSettings(true)} style={styles.iconBtn}>
            <Settings size={18} />
          </button>
          <button title="New chat" onClick={clearChat} style={styles.iconBtn}>
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      {/* ---- Chat feed ---- */}
      <div ref={scrollRef} style={styles.feed}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <div className={`orb ${orbState}`} onClick={toggleMic} role="button" aria-label="Talk to Chitti">
              <div className="orb-core" />
              <div className="orb-ring" />
              <div className="orb-ring orb-ring-2" />
            </div>
            <p style={styles.emptyText}>Tap the orb to talk, or type anything below.</p>
            <div style={styles.quickActions}>
              {[
                "Open WhatsApp", "Take screenshot", "Battery status",
                "Help me with DSA", "Search for Spring Boot 4",
              ].map(q => (
                <button key={q} style={styles.quickBtn} onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ ...styles.row, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={m.role === "user" ? styles.userBubble : styles.botBubble}>
              {m.role === "assistant" ? (
                <>
                  {m.content ? <MarkdownMessage content={m.content.replace(/<<\w+(?::.+?)?>>/g, "").trim()} /> : <span className="dots"><span/><span/><span/></span>}
                  {m.image && <img src={m.image} alt="Screenshot" style={styles.screenshot} />}
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {interim && (
          <div style={{ ...styles.row, justifyContent: "flex-end" }}>
            <div style={{ ...styles.userBubble, opacity: 0.5 }}>{interim}</div>
          </div>
        )}
      </div>

      {/* ---- Error bar ---- */}
      {error && <div style={styles.error}>{error}</div>}

      {/* ---- Command hint ---- */}
      {commandHint && (
        <div style={styles.cmdHintBar}>{commandHint}</div>
      )}

      {/* ---- Footer ---- */}
      <footer style={styles.footer}>
        <button
          onClick={toggleMic}
          style={{ ...styles.micBtn, ...(listening ? styles.micBtnActive : {}) }}
          title={listening ? "Stop listening" : "Speak"}
        >
          {listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <input
          ref={inputRef}
          style={styles.textInput}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Chitti... (/ for commands)"
          disabled={busy}
        />

        {busy ? (
          <button onClick={cancelRequest} style={styles.cancelBtn} title="Cancel"><Square size={18} /></button>
        ) : speaking ? (
          <button onClick={stopSpeaking} style={styles.sendBtn} title="Stop speaking"><Square size={18} /></button>
        ) : (
          <button onClick={() => send()} style={styles.sendBtn} disabled={!input.trim()} title="Send"><Send size={18} /></button>
        )}
      </footer>

      {/* ---- Settings Panel ---- */}
      {showSettings && (
        <div style={styles.overlay} onClick={() => setShowSettings(false)}>
          <div style={styles.panel} onClick={e => e.stopPropagation()}>
            <div style={styles.panelHeader}>
              <h3 style={styles.panelTitle}>Settings</h3>
              <button onClick={() => setShowSettings(false)} style={styles.closeBtn}><X size={20} /></button>
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Model</label>
              {MODELS.map(m => {
                const ProviderIcon = m.icon === "zap" ? Zap : m.icon === "cpu" ? Cpu : Brain;
                return (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    style={{ ...styles.modelBtn, ...(model === m.id ? styles.modelBtnActive : {}) }}
                  >
                    <div style={styles.modelRow}>
                      <ProviderIcon size={14} style={{ color: model === m.id ? ACCENT : "#7C8196", flexShrink: 0 }} />
                      <div>
                        <div style={styles.modelName}>{m.name}</div>
                        <div style={styles.modelDesc}>{m.desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>How routing works (Auto mode)</label>
              <div style={styles.routeInfo}>
                <div><Cpu size={12} style={{color: "#76B900"}} /> <strong>NVIDIA</strong> - code, DSA, algorithms</div>
                <div><Brain size={12} style={{color: "#F55036"}} /> <strong>Groq Llama 70B</strong> - reasoning, creative, analysis</div>
                <div><Brain size={12} style={{color: "#F55036"}} /> <strong>Groq Mixtral</strong> - code, multilingual</div>
                <div><Brain size={12} style={{color: "#F55036"}} /> <strong>Groq Llama 8B</strong> - quick Q&A, fastest</div>
              </div>
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Voice output</label>
              <button onClick={() => setVoiceOn(v => !v)} style={styles.toggleBtn}>
                {voiceOn ? "On" : "Off"}
              </button>
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Speech rate: {speechRate.toFixed(1)}x</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speechRate}
                onChange={e => setSpeechRate(parseFloat(e.target.value))}
                style={styles.slider}
              />
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Actions</label>
              <button onClick={exportConversation} style={styles.actionBtn}>Export conversation</button>
              <button onClick={() => { clearChat(); setShowSettings(false); }} style={styles.actionBtn}>Clear current chat</button>
              <button onClick={() => { setConversations([]); saveConversations([]); setShowSettings(false); }} style={styles.dangerBtn}>Delete all history</button>
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Chat commands</label>
              <div style={styles.cmdList}>
                <div><span style={styles.cmd}>/clear</span> New conversation</div>
                <div><span style={styles.cmd}>/voice</span> Toggle voice</div>
                <div><span style={styles.cmd}>/model [name]</span> Switch model</div>
                <div><span style={styles.cmd}>/export</span> Export chat</div>
                <div><span style={styles.cmd}>/history</span> Browse history</div>
              </div>
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Automation commands</label>
              <div style={styles.cmdList}>
                <div><span style={styles.cmd}>/open [app]</span> Open an app</div>
                <div><span style={styles.cmd}>/close [app]</span> Close an app</div>
                <div><span style={styles.cmd}>/apps</span> List running apps</div>
                <div><span style={styles.cmd}>/screenshot</span> Take screenshot</div>
                <div><span style={styles.cmd}>/url [url]</span> Open a URL</div>
                <div><span style={styles.cmd}>/search [query]</span> Google search</div>
                <div><span style={styles.cmd}>/volume [0-100]</span> Set volume</div>
                <div><span style={styles.cmd}>/lock</span> Lock screen</div>
                <div><span style={styles.cmd}>/media [play/next]</span> Media control</div>
                <div><span style={styles.cmd}>/sysinfo</span> System info</div>
              </div>
            </div>

            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Voice / natural language</label>
              <div style={styles.cmdList}>
                <div>"Open Chrome" "Launch VS Code"</div>
                <div>"Take a screenshot"</div>
                <div>"Search for Spring Boot tutorials"</div>
                <div>"Mute" "Volume 50" "Play music"</div>
                <div>"Lock the screen"</div>
                <div>"Show running apps" "System info"</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- History Panel ---- */}
      {showHistory && (
        <div style={styles.overlay} onClick={() => setShowHistory(false)}>
          <div style={styles.panel} onClick={e => e.stopPropagation()}>
            <div style={styles.panelHeader}>
              <h3 style={styles.panelTitle}>History</h3>
              <button onClick={() => setShowHistory(false)} style={styles.closeBtn}><X size={20} /></button>
            </div>

            {conversations.length === 0 ? (
              <p style={styles.emptyHistory}>No conversations yet.</p>
            ) : (
              <div style={styles.historyList}>
                {conversations.map(c => (
                  <div key={c.id} style={styles.historyItem}>
                    <button onClick={() => loadConversation(c)} style={styles.historyBtn}>
                      <div style={styles.historyTitle}>{c.title}</div>
                      <div style={styles.historyDate}>{new Date(c.updatedAt).toLocaleDateString()}</div>
                    </button>
                    <button onClick={() => deleteConversation(c.id)} style={styles.historyDelete}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================
// STYLES
// ============================

const ACCENT = "#00E5C0";
const ACCENT2 = "#7A5CFF";
const BG = "#0A0B10";
const SURFACE = "#161824";
const BORDER = "#1E2030";

const styles = {
  root: { display: "flex", flexDirection: "column", height: "100dvh", maxHeight: "100dvh", width: "100%", background: BG, color: "#E8EAF0", fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, backdropFilter: "blur(10px)" },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandDot: { width: 12, height: 12, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 10px ${ACCENT}` },
  title: { fontWeight: 800, letterSpacing: 3, fontSize: 14 },
  subtitle: { fontSize: 10, color: "#7C8196", letterSpacing: 0.5, marginTop: 1 },
  headerActions: { display: "flex", gap: 4, alignItems: "center" },
  iconBtn: { background: "transparent", border: "none", color: "#9AA0B5", width: 34, height: 34, borderRadius: 8, cursor: "pointer", display: "grid", placeItems: "center", transition: "background .15s" },
  installBtn: { background: ACCENT + "22", border: `1px solid ${ACCENT}44`, color: ACCENT, width: 34, height: 34, borderRadius: 8, cursor: "pointer", display: "grid", placeItems: "center" },
  offlineBadge: { background: "#FF6B6B22", border: "1px solid #FF6B6B44", color: "#FF6B6B", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 },
  feed: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, minHeight: 280 },
  emptyText: { color: "#6B7186", fontSize: 13, textAlign: "center", lineHeight: 1.6 },
  cmdHighlight: { color: ACCENT, fontFamily: "monospace", fontSize: 12 },
  quickActions: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 400 },
  quickBtn: { background: SURFACE, border: `1px solid ${BORDER}`, color: "#B8BDD0", padding: "8px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", transition: "all .15s" },
  row: { display: "flex", width: "100%" },
  userBubble: { background: `linear-gradient(135deg, ${ACCENT2}, #5B43D6)`, color: "#fff", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", maxWidth: "80%", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  botBubble: { background: SURFACE, color: "#DDE0EC", padding: "12px 16px", borderRadius: "16px 16px 16px 4px", maxWidth: "85%", fontSize: 14, lineHeight: 1.6, wordBreak: "break-word", border: `1px solid ${BORDER}` },
  error: { background: "#2A1416", color: "#FF8D8D", padding: "8px 16px", fontSize: 12, textAlign: "center", flexShrink: 0 },
  cmdHintBar: { background: SURFACE, color: "#7C8196", padding: "4px 16px", fontSize: 11, fontFamily: "monospace", borderTop: `1px solid ${BORDER}`, flexShrink: 0 },
  footer: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: `1px solid ${BORDER}`, flexShrink: 0, paddingBottom: "max(10px, env(safe-area-inset-bottom))" },
  micBtn: { width: 44, height: 44, borderRadius: 12, border: "none", background: SURFACE, color: ACCENT, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, transition: "all .2s" },
  micBtnActive: { background: ACCENT, color: "#06231E", boxShadow: `0 0 20px ${ACCENT}88` },
  textInput: { flex: 1, background: "#0D0F18", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "11px 14px", color: "#E8EAF0", fontSize: 14, outline: "none", minWidth: 0, transition: "border-color .2s" },
  sendBtn: { width: 44, height: 44, borderRadius: 12, border: "none", background: ACCENT, color: "#06231E", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, transition: "opacity .15s" },
  cancelBtn: { width: 44, height: 44, borderRadius: 12, border: "none", background: "#FF6B6B", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 },
  screenshot: { maxWidth: "100%", borderRadius: 8, marginTop: 8, border: `1px solid ${BORDER}` },

  // Panels
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  panel: { background: "#12141E", border: `1px solid ${BORDER}`, borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "80vh", overflow: "auto", padding: 0 },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: "#12141E", zIndex: 1 },
  panelTitle: { fontSize: 16, fontWeight: 700, margin: 0, color: "#E8EAF0" },
  closeBtn: { background: "transparent", border: "none", color: "#9AA0B5", cursor: "pointer", padding: 4 },

  // Settings
  settingGroup: { padding: "16px 20px", borderBottom: `1px solid ${BORDER}` },
  settingLabel: { fontSize: 11, fontWeight: 600, color: "#7C8196", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "block" },
  modelBtn: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: `1px solid ${BORDER}`, color: "#B8BDD0", padding: "10px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 6, transition: "all .15s" },
  modelBtnActive: { borderColor: ACCENT, background: ACCENT + "11", color: "#fff" },
  modelRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  modelName: { fontWeight: 600, fontSize: 13 },
  modelDesc: { fontSize: 11, color: "#7C8196", marginTop: 2 },
  routeInfo: { fontSize: 12, color: "#9AA0B5", lineHeight: 2.2, display: "flex", flexDirection: "column", gap: 2 },
  toggleBtn: { background: ACCENT + "22", border: `1px solid ${ACCENT}44`, color: ACCENT, padding: "6px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  slider: { width: "100%", accentColor: ACCENT },
  actionBtn: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: `1px solid ${BORDER}`, color: "#B8BDD0", padding: "10px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 6, fontSize: 13 },
  dangerBtn: { display: "block", width: "100%", textAlign: "left", background: "#FF6B6B11", border: "1px solid #FF6B6B33", color: "#FF6B6B", padding: "10px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 6, fontSize: 13 },
  cmdList: { fontSize: 12, color: "#9AA0B5", lineHeight: 2 },
  cmd: { color: ACCENT, fontFamily: "monospace", marginRight: 8 },

  // History
  emptyHistory: { padding: 20, color: "#7C8196", fontSize: 13, textAlign: "center" },
  historyList: { padding: "8px 0" },
  historyItem: { display: "flex", alignItems: "center", padding: "0 12px", borderBottom: `1px solid ${BORDER}` },
  historyBtn: { flex: 1, background: "transparent", border: "none", color: "#DDE0EC", padding: "12px 8px", cursor: "pointer", textAlign: "left" },
  historyTitle: { fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  historyDate: { fontSize: 10, color: "#7C8196", marginTop: 2 },
  historyDelete: { background: "transparent", border: "none", color: "#7C8196", cursor: "pointer", padding: 8, borderRadius: 6 },
};

// Markdown-specific styles
const mdStyles = {
  inlineCode: { background: "#1E2236", color: ACCENT, padding: "2px 6px", borderRadius: 4, fontSize: "0.88em", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
  codeBlock: { background: "#0D0F18", border: `1px solid ${BORDER}`, borderRadius: 10, margin: "8px 0", overflow: "hidden" },
  codeHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "#0A0C14", borderBottom: `1px solid ${BORDER}` },
  codeLang: { fontSize: 10, color: "#7C8196", textTransform: "uppercase", letterSpacing: 0.5 },
  copyBtn: { background: "transparent", border: "none", color: "#7C8196", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" },
  pre: { margin: 0, padding: "12px", overflowX: "auto", fontSize: 12, lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: "#C8CDE0" },
  p: { margin: "6px 0", lineHeight: 1.6 },
  ul: { margin: "6px 0", paddingLeft: 20 },
  ol: { margin: "6px 0", paddingLeft: 20 },
  li: { margin: "3px 0", lineHeight: 1.5 },
  a: { color: ACCENT, textDecoration: "none" },
  h: { fontSize: 14, fontWeight: 700, margin: "12px 0 6px", color: "#fff" },
  blockquote: { borderLeft: `3px solid ${ACCENT}44`, margin: "8px 0", padding: "4px 12px", color: "#9AA0B5" },
  tableWrap: { overflowX: "auto", margin: "8px 0" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 12 },
  th: { border: `1px solid ${BORDER}`, padding: "6px 10px", background: "#0D0F18", textAlign: "left", fontWeight: 600 },
  td: { border: `1px solid ${BORDER}`, padding: "6px 10px" },
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100dvh; overflow: hidden; }
body { background: ${BG}; }
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-thumb { background: #23263A; border-radius: 8px; }
::-webkit-scrollbar-track { background: transparent; }
input, button { font-family: inherit; }
button:hover { opacity: 0.85; }
button:active { transform: scale(0.96); }
button:disabled { opacity: 0.4; pointer-events: none; }

.orb { position: relative; width: 120px; height: 120px; cursor: pointer; display: grid; place-items: center; }
.orb-core { position: absolute; width: 58px; height: 58px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, ${ACCENT}, ${ACCENT2});
  box-shadow: 0 0 40px ${ACCENT}55; transition: all .3s; }
.orb-ring { position: absolute; width: 84px; height: 84px; border-radius: 50%; border: 2px solid ${ACCENT}33; }
.orb-ring-2 { width: 110px; height: 110px; border-color: ${ACCENT2}22; }

.orb.idle .orb-core { animation: breathe 3.5s ease-in-out infinite; }
.orb.listening .orb-core { background: radial-gradient(circle at 35% 30%, #FF6B9D, ${ACCENT2}); box-shadow: 0 0 50px #FF6B9D77; animation: pulse .9s ease-in-out infinite; }
.orb.listening .orb-ring { animation: ripple 1.2s ease-out infinite; }
.orb.listening .orb-ring-2 { animation: ripple 1.2s ease-out .3s infinite; }
.orb.thinking .orb-core { animation: spin 1.1s linear infinite, breathe 2s ease-in-out infinite; }
.orb.speaking .orb-core { animation: pulse .55s ease-in-out infinite; box-shadow: 0 0 50px ${ACCENT}99; }

.orb-mini { transition: all .2s; }
.orb-mini.listening { animation: pulse .9s ease-in-out infinite; background: #FF6B9D !important; box-shadow: 0 0 10px #FF6B9D !important; }
.orb-mini.thinking { animation: pulse 1.1s ease-in-out infinite; background: #FFD166 !important; box-shadow: 0 0 10px #FFD166 !important; }
.orb-mini.speaking { animation: pulse .55s ease-in-out infinite; }

@keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ripple { 0% { transform: scale(.7); opacity: .7; } 100% { transform: scale(1.3); opacity: 0; } }

.dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.dots span { width: 6px; height: 6px; border-radius: 50%; background: ${ACCENT}; animation: blink 1.2s infinite; }
.dots span:nth-child(2) { animation-delay: .2s; }
.dots span:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%,60%,100% { opacity: .2; } 30% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .orb-core, .orb-ring, .orb-mini, .dots span { animation: none !important; }
}

@media (max-width: 480px) {
  .orb { width: 100px; height: 100px; }
  .orb-core { width: 48px; height: 48px; }
  .orb-ring { width: 68px; height: 68px; }
  .orb-ring-2 { width: 90px; height: 90px; }
}
`;
