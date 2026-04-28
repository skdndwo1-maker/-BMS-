# figma-import-mcp

Figma URL(가능하면 `fileKey`)에서 **노드 트리/프레임 목록/이미지 export/토큰**을 가져오는 MCP 서버입니다.

## 설치

```bash
npm install
```

## 환경변수

일반 백엔드(Express, `npm run server` / `npm start`)에는 **Figma 토큰이 필요 없습니다.**

Figma MCP만 쓸 때만 루트 `.env` 등에 `FIGMA_TOKEN`(Figma Personal Access Token)을 넣습니다. 토큰 없이 MCP를 띄울 수 있으며, Figma 도구를 호출할 때만 오류가 납니다.

## 실행

**Express API(가이드라인·Gemini 등)**

```bash
npm run server
# 또는
npm start
```

**Figma MCP(stdio)**

```bash
FIGMA_TOKEN="YOUR_TOKEN" npm run start:mcp
```

## 제공 도구

- `figma_import_from_url`
  - 입력: `url`, (옵션) `depth`, `normalizeMaxDepth`
  - 출력: `raw`(Figma 파일 JSON), `normalized`(정규화 트리), `frames`

- `figma_list_frames`
  - 입력: `fileKey`

- `figma_export_images`
  - 입력: `fileKey`, `nodeIds`, (옵션) `format`, `scale`, `inlineBytesBase64`

- `figma_extract_tokens`
  - 입력: `fileKey`

## 주의/한계

- `figma.com/make/...` 링크는 공식 API 식별자(`fileKey`)를 항상 안정적으로 제공하지 않을 수 있습니다.\n  이 경우 같은 디자인의 **원본 Figma file 링크**(예: `figma.com/file/{fileKey}/...`) 또는 `fileKey`가 필요합니다.

# Axis
