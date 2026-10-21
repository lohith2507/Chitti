import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load all .env vars (empty prefix), not just VITE_*. GROQ_API_KEY is only
  // read here in the Node-side config and attached by the dev proxy below, so
  // it is never bundled into client code or visible in the browser.
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.GROQ_API_KEY;

  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        "/api/chat": {
          target: "https://api.groq.com",
          changeOrigin: true,
          rewrite: () => "/openai/v1/chat/completions",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (apiKey) {
                proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
              }
            });
          },
        },
      },
    },
  };
});
