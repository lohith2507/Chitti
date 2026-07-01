import express from "express";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { networkInterfaces } from "os";
import dotenv from "dotenv";
import { parseCommand, executeCommand } from "./automation.js";

// __dirname: works in ESM (node server.js), CJS bundle (esbuild), and .exe (pkg)
let __server_dirname;
try {
  __server_dirname = dirname(fileURLToPath(import.meta.url));
} catch {
  __server_dirname = typeof __dirname !== "undefined" ? __dirname : dirname(process.argv[1]);
}

// When running as .exe, read .env from the folder containing the exe
const exeDir = process.pkg ? dirname(process.execPath) : __server_dirname;
dotenv.config({ path: join(exeDir, ".env") });

const app = express();
const START_PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_PORT_TRIES = 20;

// Expose the actually-bound port to the Electron main process (same process,
// shared global). main.cjs awaits this before loading the window.
let __resolvePort;
global.__chittiPortPromise = new Promise((resolve) => { __resolvePort = resolve; });

app.use(express.json({ limit: "1mb" }));

// Serve built frontend (embedded inside exe via pkg assets, or local dist/)
app.use(express.static(join(__server_dirname, "dist")));

// ============================
// MULTI-PROVIDER LLM CONFIG
// ============================

const PROVIDERS = {
  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    models: {
      "groq-llama-70b":  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", strengths: ["reasoning", "analysis", "creative"] },
      "groq-mixtral":    { id: "mixtral-8x7b-32768",      name: "Mixtral 8x7B",   strengths: ["code", "multilingual"] },
      "groq-llama-8b":   { id: "llama-3.1-8b-instant",    name: "Llama 3.1 8B",   strengths: ["speed"] },
    },
  },
  nvidia: {
    name: "NVIDIA",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: process.env.NVIDIA_API_KEY,
    models: {
      "nvidia-llama-70b": { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B", strengths: ["code", "dsa", "reasoning"] },
      "nvidia-llama-8b":  { id: "meta/llama-3.1-8b-instruct",  name: "Llama 3.1 8B",  strengths: ["speed", "code"] },
    },
  },
};

// ============================
// TASK CLASSIFIER (keyword-based, fast)
// ============================

const TASK_PATTERNS = {
  code: /\b(code|function|implement|debug|fix bug|refactor|class|method|api|endpoint|import|export|async|await|promise|regex|sql|query|script|compile|runtime|syntax|error|exception|stack trace|git|deploy|docker|kubernetes|k8s|cicd|pipeline|spring|java|python|javascript|typescript|react|node|html|css|json|yaml|xml|rest|grpc|graphql|webpack|vite|npm|maven|gradle)\b/i,
  dsa: /\b(dsa|algorithm|data structure|leetcode|dynamic programming|dp|bfs|dfs|graph|tree|linked list|binary search|sort|hash map|heap|stack|queue|sliding window|two pointer|backtrack|recursion|memoiz|time complexity|space complexity|big o|greedy|divide and conquer|topological)\b/i,
  reasoning: /\b(explain|why|analyze|compare|evaluate|think through|pros and cons|trade.?off|architect|design|plan|strategy|decide|should i|what if|consider|recommend|review|assess|critique|opinion|best approach|how does .+ work)\b/i,
  creative: /\b(write|draft|compose|email|blog|article|essay|story|poem|message|letter|resume|cover letter|description|bio|tagline|slogan|pitch|presentation|summarize|rephrase|rewrite)\b/i,
  quick: /\b(what is|who is|when|where|define|meaning|translate|convert|calculate|how much|how many|yes or no|true or false|list|name)\b/i,
};

function classifyTask(text) {
  const lower = text.toLowerCase();
  // Check patterns in priority order
  if (TASK_PATTERNS.code.test(lower)) return "code";
  if (TASK_PATTERNS.dsa.test(lower)) return "dsa";
  if (TASK_PATTERNS.reasoning.test(lower)) return "reasoning";
  if (TASK_PATTERNS.creative.test(lower)) return "creative";
  if (TASK_PATTERNS.quick.test(lower)) return "quick";
  return "general";
}

// Task type → best model routing (with fallback chain)
const ROUTING_TABLE = {
  code:      ["nvidia-llama-70b", "groq-mixtral", "groq-llama-70b"],
  dsa:       ["nvidia-llama-70b", "groq-llama-70b", "groq-mixtral"],
  reasoning: ["groq-llama-70b", "nvidia-llama-70b"],
  creative:  ["groq-llama-70b", "nvidia-llama-70b"],
  quick:     ["groq-llama-8b", "nvidia-llama-8b", "groq-llama-70b"],
  general:   ["groq-llama-70b", "nvidia-llama-70b"],
};

function resolveModel(modelKey) {
  for (const [providerName, provider] of Object.entries(PROVIDERS)) {
    if (provider.models[modelKey]) {
      return { provider: providerName, ...provider, model: provider.models[modelKey] };
    }
  }
  return null;
}

function routeTask(taskType) {
  const chain = ROUTING_TABLE[taskType] || ROUTING_TABLE.general;
  for (const modelKey of chain) {
    const resolved = resolveModel(modelKey);
    if (resolved && resolved.key) return { modelKey, ...resolved };
  }
  return null;
}

// ============================
// API ENDPOINTS
// ============================

// Health check
app.get("/health", (_req, res) => {
  const available = {};
  for (const [name, p] of Object.entries(PROVIDERS)) {
    available[name] = !!p.key;
  }
  res.json({ status: "ok", assistant: "Chitti", providers: available, uptime: process.uptime() });
});

// Get available providers and models
app.get("/api/providers", (_req, res) => {
  const result = {};
  for (const [providerName, provider] of Object.entries(PROVIDERS)) {
    if (!provider.key) continue;
    result[providerName] = {
      name: provider.name,
      models: Object.entries(provider.models).map(([key, m]) => ({
        key, id: m.id, name: m.name, strengths: m.strengths,
      })),
    };
  }
  res.json(result);
});

// Automation endpoint - execute system commands
app.post("/api/automate", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No command text" });

  const cmd = parseCommand(text);
  if (!cmd) return res.json({ ok: false, matched: false, message: "Not a recognized command" });

  console.log(`[Automation] ${cmd.type}:`, JSON.stringify(cmd));
  try {
    const result = await executeCommand(cmd);
    res.json({ ...result, matched: true, commandType: cmd.type });
  } catch (e) {
    console.error("[Automation] Error:", e.message);
    res.json({ ok: false, matched: true, message: e.message });
  }
});

// Main chat endpoint with smart routing
app.post("/api/chat", async (req, res) => {
  const { messages, model: requestedModel, stream, max_tokens } = req.body;

  let provider, providerName, modelId, modelKey, taskType;

  if (requestedModel && requestedModel !== "auto") {
    // Manual model selection
    const resolved = resolveModel(requestedModel);
    if (!resolved || !resolved.key) {
      return res.status(400).json({ error: `Model ${requestedModel} not available` });
    }
    provider = resolved;
    providerName = resolved.provider;
    modelId = resolved.model.id;
    modelKey = requestedModel;
    taskType = "manual";
  } else {
    // Auto-route: classify the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    taskType = lastUserMsg ? classifyTask(lastUserMsg.content) : "general";
    const routed = routeTask(taskType);
    if (!routed) {
      return res.status(500).json({ error: "No LLM providers configured" });
    }
    provider = routed;
    providerName = routed.provider;
    modelId = routed.model.id;
    modelKey = routed.modelKey;
  }

  console.log(`[Router] task=${taskType} → ${providerName}/${modelId}`);

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: max_tokens || 4096,
        stream: !!stream,
        messages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`${providerName} error ${response.status}:`, errBody);
      return res.status(response.status).send(errBody);
    }

    // Send routing metadata as a custom header
    res.setHeader("X-Chitti-Provider", providerName);
    res.setHeader("X-Chitti-Model", modelKey);
    res.setHeader("X-Chitti-Task", taskType);

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(decoder.decode(value, { stream: true }));
        }
      };

      req.on("close", () => { try { reader.cancel(); } catch {} });
      await pump();
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (err) {
    console.error(`${providerName} proxy error:`, err.message);
    res.status(502).json({ error: `Failed to reach ${providerName}` });
  }
});

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(join(__server_dirname, "dist", "index.html"));
});

const server = createServer(app);

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "0.0.0.0";
}

// Try START_PORT; if it's taken (e.g. another dev server like a Next.js app is
// already on 3000), automatically fall back to the next free port instead of
// crashing with EADDRINUSE.
function listenWithFallback(port, triesLeft) {
  const onError = (err) => {
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      console.warn(`  Port ${port} is in use, trying ${port + 1}...`);
      listenWithFallback(port + 1, triesLeft - 1);
    } else {
      console.error("  Chitti server failed to start:", err.message);
      process.exit(1);
    }
  };

  server.once("error", onError);
  server.listen(port, "0.0.0.0", () => {
    server.removeListener("error", onError);
    process.env.CHITTI_PORT = String(port);
    if (__resolvePort) __resolvePort(port);

    const ip = getLocalIP();
    const active = Object.entries(PROVIDERS).filter(([, p]) => p.key).map(([n]) => n);

    console.log("");
    console.log("  ╔═══════════════════════════════════════════╗");
    console.log("  ║            CHITTI is online                ║");
    console.log("  ╠═══════════════════════════════════════════╣");
    console.log(`  ║  Local:     http://localhost:${port}`);
    console.log(`  ║  Network:   http://${ip}:${port}`);
    console.log(`  ║  Providers: ${active.join(", ")}`);
    console.log("  ╚═══════════════════════════════════════════╝");
    console.log("");
    console.log("  Routing: code/dsa → NVIDIA | reasoning/creative → Groq | quick → Groq 8B");
    console.log("");
  });
}

listenWithFallback(START_PORT, MAX_PORT_TRIES);
