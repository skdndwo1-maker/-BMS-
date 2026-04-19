import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 브라우저의 `/api/*` → Express (`npm run server`, 기본 PORT=3001) */
const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:3001",
    changeOrigin: true
  }
} as const;

// https://vite.dev/config/
export default defineConfig({
  /** 루트 `.env`를 함께 읽음 (클라이언트 번들에는 `VITE_` 접두어만 노출됨; GEMINI 키는 백엔드 전용) */
  envDir: path.resolve(__dirname, ".."),
  plugins: [react(), tailwindcss()],
  server: {
    /** 선호 포트(다른 Vite가 점유 중이면 다음 포트로 넘어감) */
    port: 5178,
    strictPort: false,
    /** 127.0.0.1·localhost 모두에서 접속 가능하도록 (기본은 IPv6 localhost만인 환경이 있음) */
    host: true,
    proxy: apiProxy
  },
  /** `vite preview`에서도 `/api`가 백엔드로 가도록 동일 프록시 */
  preview: {
    host: true,
    proxy: apiProxy
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
