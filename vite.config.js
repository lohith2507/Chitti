import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
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
