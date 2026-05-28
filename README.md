# Axis

U+ 브랜드 운영 통합 플랫폼 — 브랜드 디자인 제작·검수, 네이밍 생성·검수, 라이브러리, 심플리 U+ 가이드 분석, 관리자 검토 기능을 제공합니다.

## 구성

- **frontend/** — React + Vite 클라이언트 (Vercel 배포)
- **server/** — Express API (Railway 배포). Gemini·국가법령정보·Supabase RAG 연동
- **shared/** — 프론트·서버 공통 룰
- **supabase/migrations/** — DB 스키마
- **data/guidelines/** — U+ 공식 가이드라인 원본 PDF

## 활성 기능 / 라우트

| 라우트 | 화면 |
|---|---|
| `/` | 로그인 |
| `/options` | 검색·문답 에이전트 |
| `/brand-graphics` `/create/:templateId` `/dashboard` `/inspection` | 브랜드 디자인 (제작·검수·내 디자인) |
| `/naming` | 브랜드 네이밍 (생성·검수, 적법성 = 법적 적법성 + 사회적 이슈·민감도) |
| `/library` | 브랜드 라이브러리 |
| `/simply-heart` | 심플리 U+ 가이드 분석 |
| `/admin/review` | 관리자 검토 |

## 환경변수

`/.env.example` 참고. 핵심:

- `GEMINI_API_KEY` — Gemini 호출용
- `LAW_API_OC` (또는 `LAW_GO_OC`) — 국가법령정보센터 Open API (`/api/law/search` 프록시·네이밍 적법성 보강)
- `SUPABASE_URL`, `SUPABASE_*_KEY` — RAG·런 저장·라이브러리

## 개발

```bash
# 루트
npm install
# 프론트
npm install --prefix frontend

# API + Web 동시 (3001 + 5178)
npm run dev:full
```

개별 실행

```bash
npm run server:watch              # Express (포트 3001)
npm run dev --prefix frontend     # Vite (포트 5178)
```

타입 체크 / 빌드

```bash
npm run typecheck:server
npm run build:frontend
```

## 배포

- **Frontend**: Vercel (`vercel.json` · 프론트 빌드)
- **Backend**: Railway (`railway.toml` · `npm start`)
