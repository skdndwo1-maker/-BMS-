#!/usr/bin/env node
/**
 * Cursor 내장 Simple Browser로 프론트(dev 서버) URL을 엽니다.
 * 사용: node .vscode/open-frontend.mjs [포트]
 */
import { execSync } from "node:child_process";

/** `frontend/vite.config.ts` 선호 포트와 맞춤 */
const port = process.argv[2] ?? "5178";
const full = `http://localhost:${port}`;
const encoded = encodeURIComponent(full);
const deeplink = `cursor://vscode.simple-browser/show?url=${encoded}`;

execSync(`open "${deeplink}"`, { shell: true, stdio: "inherit" });
