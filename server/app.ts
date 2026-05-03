import "./load-env.js";
import cors from "cors";
import express from "express";
import multer from "multer";
import { mkdirSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Express } from "express";

import {
  additionalRevisionImagePipeline,
  answerInspectionAgentChat,
  excerptGuidelineForInspection,
  generateDesignEditorReplacementImage,
  generateRevisedBrandingImage,
  generateRevisedBrandingImageFollowup,
  hasGeminiApiKey,
  runBrandNamingWithGemini,
  runDesignEditorCanvasInspection,
  runDesignEditorCanvasVisualCorrection,
  runDesignEditorTextSuggestion,
  runInspectionWithGemini,
  runOptionsPageChat,
  summarizeGuidelineFile,
  type DesignEditorTextSuggestionTarget
} from "./gemini.js";
import { copyFixedGuidelineToSlot, FIXED_GUIDELINE_SOURCES } from "./fixedGuidelines.js";
import { extractPdfTextFromBase64, runSimplyHeartStep } from "./simplyHeart.js";
import { buildExternalNamingReferences } from "./namingExternalContext.js";
import { resolveLawApiOc, searchLawsJson } from "./lawApi.js";
import { getPublicApiBaseUrl } from "./publicApiUrl.js";
import {
  ensureDataDirs,
  getGuideline,
  GUIDELINES_DIR,
  setGuideline,
  type GuidelineRecord,
  resolveStoredPath,
  loadMeta
} from "./store.js";
import { persistRun, persistRunArtifact } from "./runPersistence.js";
import { extractGuidelineText } from "./guidelineExtract.js";
import { embedTextWithGemini } from "./geminiEmbeddings.js";
import {
  deleteChunksForSource,
  fileSha256Hex,
  insertChunksWithEmbeddings,
  isSupabaseRagEnabled,
  matchRagChunks,
  splitIntoChunks,
  upsertGuidelineSource,
  upsertRunQaSource
} from "./rag.js";
import { normalizeRunForRag } from "./ragNormalize.js";
import { requireAdmin } from "./adminAuth.js";
import { getSupabaseAnonClient, getSupabaseServiceClient, isSupabaseInvalidApiKeyError } from "./supabase.js";

const app = express();

/** 프로덕션 Vercel (프리뷰는 *.vercel.app으로 별도 허용) */
const CORS_ALLOWED_ORIGINS: readonly string[] = ["https://bms-sage-one.vercel.app"];

function corsAllowOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (CORS_ALLOWED_ORIGINS.includes(origin)) {
    callback(null, origin);
    return;
  }
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      callback(null, origin);
      return;
    }
    if (hostname.endsWith(".vercel.app")) {
      callback(null, origin);
      return;
    }
  } catch {
    callback(null, false);
    return;
  }
  callback(null, true);
}

app.use(
  cors({
    origin: corsAllowOrigin,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Admin-Key", "X-Session-Id"],
    maxAge: 86_400
  })
);
/** 검수 follow-up·대용량 base64 본문 대응 (2mb면 이미지 포함 요청이 잘림) */
app.use(express.json({ limit: "50mb" }));

ensureDataDirs();

/** 검수·에이전트 채팅용: 선택된 참조 가이드라인 슬롯의 본문(요약/발췌) */
async function buildPrimaryGuidelineBlock(guidelineId: string, queryText?: string): Promise<string> {
  let g = getGuideline(guidelineId);
  if (g && !g.aiSummary?.trim() && process.env.GEMINI_API_KEY?.trim()) {
    try {
      const abs = resolveStoredPath(g.storedRelativePath);
      if (existsSync(abs)) {
        const { summary } = await summarizeGuidelineFile(abs, g.mimeType);
        g = { ...g, aiSummary: summary, aiAnalyzedAt: new Date().toISOString() };
        setGuideline(g);
      }
    } catch {
      /* 검수는 발췌로 계속 */
    }
  }
  let primaryBlock: string;
  if (g?.aiSummary?.trim()) {
    primaryBlock = g.aiSummary;
  } else if (g) {
    primaryBlock = await excerptGuidelineForInspection(g);
  } else {
    primaryBlock =
      "등록된 참조 가이드라인이 없습니다. 브랜드 검수 화면에서 참조 가이드라인 옵션을 선택하거나 동기화하세요.";
  }

  let out = `[참조 가이드라인 — 우선 적용 (${g?.displayName ?? guidelineId})]\n${primaryBlock}`;

  // RAG: retrieve guideline chunks relevant to queryText and attach as context.
  if (queryText?.trim() && process.env.GEMINI_API_KEY?.trim() && process.env.SUPABASE_URL?.trim()) {
    try {
      const q = queryText.trim().slice(0, 6000);
      const qEmb = await embedTextWithGemini(q, { model: "gemini-embedding-001" });
      const matches = await matchRagChunks({ queryEmbedding: qEmb, guidelineId, sourceType: "guideline", topK: 8 });
      const picked = matches.filter((m) => typeof m.similarity === "number" && m.similarity >= 0.2).slice(0, 6);
      if (picked.length > 0) {
        const lines = picked.map(
          (m, i) =>
            `(${i + 1}) [${m.source_title}] (sim=${m.similarity.toFixed(3)})\n${String(m.content).trim()}`
        );
        out += `\n\n[관련 참고자료 — RAG 발췌]\n${lines.join("\n\n---\n")}`;
      }
    } catch (e) {
      console.error("[rag] buildPrimaryGuidelineBlock retrieval failed:", e instanceof Error ? e.message : String(e));
    }
  }

  return out;
}

/**
 * 디자인 에디터「디자인 검수」「디자인 교정」전용: 슬롯에 등록된 파일이 PDF인지 확인하고,
 * PDF에서 추출한 원문(필수) + 선택적 RAG·AI 요약을 붙입니다. PDF가 없거나 텍스트 추출에 실패하면 API가 거절됩니다.
 */
async function buildMandatoryViPdfContextForDesignEditor(
  guidelineId: string,
  queryText?: string
): Promise<{ ok: true; block: string } | { ok: false; error: string; status: number }> {
  const g = getGuideline(guidelineId);
  if (!g) {
    return {
      ok: false,
      status: 400,
      error:
        "VI 가이드라인 PDF가 등록되어 있지 않습니다. 브랜드 검수 화면에서 PDF 가이드를 동기화·업로드한 뒤 다시 시도해 주세요."
    };
  }
  if (g.mimeType !== "application/pdf") {
    return {
      ok: false,
      status: 400,
      error: `디자인 검수·교정은 VI 가이드라인 PDF가 필요합니다. 현재 슬롯 "${g.displayName}"은(는) PDF가 아닙니다.`
    };
  }
  const abs = resolveStoredPath(g.storedRelativePath);
  if (!existsSync(abs)) {
    return {
      ok: false,
      status: 400,
      error: "VI 가이드라인 PDF 파일을 서버에서 찾을 수 없습니다. 가이드를 다시 등록해 주세요."
    };
  }
  const excerpt = (await excerptGuidelineForInspection(g)).trim();
  if (
    !excerpt ||
    excerpt.includes("가이드 파일을 찾을 수 없습니다") ||
    excerpt.includes("PDF에서 텍스트를 추출하지 못했습니다") ||
    excerpt.includes("가이드가 이미지로만 등록되어 있습니다") ||
    excerpt.includes("지원하지 않는 가이드 형식입니다")
  ) {
    return {
      ok: false,
      status: 400,
      error:
        "VI 가이드라인 PDF에서 추론용 텍스트를 추출하지 못했습니다. 텍스트가 포함된 PDF인지 확인하거나 가이드를 다시 등록해 주세요."
    };
  }

  let block = `[VI 가이드라인 PDF — 필수 추론 근거]\n문서: ${g.displayName ?? guidelineId}\n\n${excerpt}`;

  if (queryText?.trim() && process.env.GEMINI_API_KEY?.trim() && process.env.SUPABASE_URL?.trim()) {
    try {
      const q = queryText.trim().slice(0, 6000);
      const qEmb = await embedTextWithGemini(q, { model: "gemini-embedding-001" });
      const matches = await matchRagChunks({ queryEmbedding: qEmb, guidelineId, sourceType: "guideline", topK: 8 });
      const picked = matches.filter((m) => typeof m.similarity === "number" && m.similarity >= 0.2).slice(0, 6);
      if (picked.length > 0) {
        const lines = picked.map(
          (m, i) =>
            `(${i + 1}) [${m.source_title}] (sim=${m.similarity!.toFixed(3)})\n${String(m.content).trim()}`
        );
        block += `\n\n[관련 VI 가이드라인 구절 — RAG]\n${lines.join("\n\n---\n")}`;
      }
    } catch (e) {
      console.error(
        "[rag] buildMandatoryViPdfContextForDesignEditor retrieval failed:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  if (g.aiSummary?.trim()) {
    block = `[VI 가이드라인 AI 요약 — 참고]\n${g.aiSummary.trim()}\n\n---\n\n${block}`;
  }

  return { ok: true, block };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    mkdirSync(GUIDELINES_DIR, { recursive: true });
    cb(null, GUIDELINES_DIR);
  },
  filename: (req, file, cb) => {
    const id = (req.params as { id: string }).id ?? "guideline";
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${id}-${Date.now()}-${safe}`);
  }
});

const uploadGuideline = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

/** 검수 대상(design) + 선택적 추가 참조 PDF/이미지(고정 옵션 외 보조) */
const uploadInspection = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const uploadNaming = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

async function supplementaryReferenceToSummary(f: Express.Multer.File): Promise<string> {
  const ext =
    f.mimetype === "application/pdf"
      ? ".pdf"
      : f.mimetype === "image/png"
        ? ".png"
        : f.mimetype === "image/jpeg"
          ? ".jpg"
          : ".bin";
  const tmp = join(tmpdir(), `uplus-supplement-${Date.now()}-${randomBytes(8).toString("hex")}${ext}`);
  writeFileSync(tmp, f.buffer);
  try {
    const { summary } = await summarizeGuidelineFile(tmp, f.mimetype);
    return summary.trim();
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    law: Boolean(resolveLawApiOc()),
    publicBase: getPublicApiBaseUrl()
  });
});

/** 옵션 페이지 하단 채팅 — Gemini + 브랜드/VI 가이드라인 + (선택) RAG 통합 맥락 */
app.post("/api/options/chat", async (req, res) => {
  try {
    if (!hasGeminiApiKey()) {
      res.status(503).json({
        ok: false,
        error: "GEMINI_API_KEY가 설정되어 있지 않습니다. 서버 환경 변수를 확인하세요."
      });
      return;
    }
    const raw = req.body?.messages;
    if (!Array.isArray(raw)) {
      res.status(400).json({ ok: false, error: "messages 배열이 필요합니다." });
      return;
    }
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const role = (item as { role?: string }).role;
      const content = String((item as { content?: unknown }).content ?? "");
      if (role !== "user" && role !== "assistant") continue;
      messages.push({ role, content });
    }
    if (messages.length === 0) {
      res.status(400).json({ ok: false, error: "유효한 메시지가 없습니다." });
      return;
    }
    const text = await runOptionsPageChat({ messages });
    res.json({ ok: true, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: msg });
  }
});

/** Simply Heart — 4단계 중 한 단계 실행 (멀티모달: 텍스트 + 이미지; PDF는 base64로 텍스트 추출) */
app.post("/api/simply-heart/step", async (req, res) => {
  try {
    if (!hasGeminiApiKey()) {
      res.status(503).json({
        ok: false,
        error: "GEMINI_API_KEY가 설정되어 있지 않습니다."
      });
      return;
    }
    const step = Number((req.body as { step?: unknown })?.step);
    if (![1, 2, 3, 4].includes(step)) {
      res.status(400).json({ ok: false, error: "step은 1~4여야 합니다." });
      return;
    }
    const userText = String((req.body as { text?: unknown })?.text ?? "").trim();
    const rawPdf = (req.body as { pdfBase64?: unknown })?.pdfBase64;
    const pdfBase64 = typeof rawPdf === "string" ? rawPdf.trim() : "";
    let extractedPdfText: string | undefined;
    if (pdfBase64) {
      try {
        const b64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
        extractedPdfText = await extractPdfTextFromBase64(b64);
      } catch {
        res.status(400).json({ ok: false, error: "PDF를 읽지 못했습니다. 올바른 PDF인지 확인하세요." });
        return;
      }
    }
    const rawImages = (req.body as { images?: unknown })?.images;
    const images = Array.isArray(rawImages) ? rawImages : [];
    const imageParts = images
      .filter((x): x is { mimeType?: string; data?: string } => Boolean(x) && typeof x === "object")
      .map((x) => ({
        mimeType: String(x.mimeType ?? "image/png").split(";")[0].toLowerCase().replace("image/jpg", "image/jpeg"),
        data: String(x.data ?? "").replace(/^data:image\/\w+;base64,/, ""),
      }))
      .filter((x) => x.data.length > 0);

    const rawPrior = (req.body as { prior?: Record<string, unknown> })?.prior ?? {};
    const prior = {
      "1": typeof rawPrior["1"] === "string" ? rawPrior["1"] : undefined,
      "2": typeof rawPrior["2"] === "string" ? rawPrior["2"] : undefined,
      "3": typeof rawPrior["3"] === "string" ? rawPrior["3"] : undefined,
    };

    if (!userText && !extractedPdfText && imageParts.length === 0) {
      res.status(400).json({ ok: false, error: "텍스트·PDF·이미지 중 하나 이상이 필요합니다." });
      return;
    }

    const t0 = Date.now();
    const { text, model } = await runSimplyHeartStep({
      step: step as 1 | 2 | 3 | 4,
      userText: userText || "(이미지·PDF만 제공)",
      extractedPdfText,
      imageParts: imageParts.length ? imageParts : undefined,
      prior,
    });

    if (step === 4) {
      void persistRun({
        req,
        type: "simply_heart",
        status: "pending_review",
        guidelineId: "simply-uplus-guideline",
        inputJson: {
          text: userText,
          hadPdf: Boolean(pdfBase64),
          imageCount: imageParts.length,
        },
        outputJson: {
          step1: prior["1"] ?? null,
          step2: prior["2"] ?? null,
          step3: prior["3"] ?? null,
          step4: text,
        },
        inputText: userText || null,
        outputText: [prior["1"], prior["2"], prior["3"], text].filter(Boolean).join("\n\n---\n\n"),
        model,
        latencyMs: Date.now() - t0,
      });
    }

    res.json({ ok: true, text, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: msg });
  }
});

/** Admin: 현재 로그인 사용자의 관리자 여부 (A안) */
app.get("/api/admin/me", async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    // not logged in / forbidden 모두 isAdmin=false로 응답 (UI gating용)
    res.json({ ok: true, isAdmin: false });
    return;
  }
  res.json({ ok: true, isAdmin: true, userId: auth.userId ?? null });
});

/** 국가법령정보센터 Open API 연동 상태. `?probe=1`이면 상표법 검색 1회로 실제 호출 성공 여부 확인(OC·IP 등록 필요) */
app.get("/api/law/status", async (req, res) => {
  const configured = Boolean(resolveLawApiOc());
  const base = {
    configured,
    guideUrl: "https://open.law.go.kr/",
    drfLawSearch: "https://www.law.go.kr/DRF/lawSearch.do (target=law&type=JSON)",
    envHints: [
      "프로젝트 루트 .env 또는 .env.local, 또는 server/.env 에 LAW_API_OC(또는 LAW_GO_OC) 설정",
      "open.law.go.kr 에서 이 서버의 공인 IP(또는 도메인) 등록 후에만 API가 성공합니다"
    ]
  };
  if (req.query.probe !== "1") {
    res.json(base);
    return;
  }
  if (!configured) {
    res.json({ ...base, probe: { ok: false, skipped: true as const, reason: "OC 미설정" } });
    return;
  }
  const r = await searchLawsJson("상표법", { display: 3, search: 1 });
  if (r.ok) {
    res.json({
      ...base,
      probe: { ok: true as const, query: r.query, resultLines: r.text.split("\n").length }
    });
    return;
  }
  res.json({
    ...base,
    probe: { ok: false as const, query: r.query, error: r.error }
  });
});

/**
 * 국가법령정보센터 DRF lawSearch JSON 호출 (서버에서만 OC 사용).
 * Query: q (필수), display (1~100, 선택), search=1|2 (법령명|본문, 선택)
 */
app.get("/api/law/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ ok: false, error: "q_required" });
      return;
    }
    const displayRaw = req.query.display;
    let display: number | undefined;
    if (typeof displayRaw === "string" && displayRaw.length > 0) {
      const n = Number(displayRaw);
      if (Number.isFinite(n)) display = n;
    }
    const sr = req.query.search;
    const search = sr === "1" || sr === "2" ? (Number(sr) as 1 | 2) : undefined;

    const r = await searchLawsJson(q, { display, search });
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/guidelines", (_req, res) => {
  const meta = loadMeta();
  res.json({ guidelines: Object.values(meta.guidelines) });
});

app.get("/api/guidelines/:id", (req, res) => {
  const rec = getGuideline(req.params.id);
  if (!rec) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({
    id: rec.id,
    displayName: rec.displayName,
    originalName: rec.originalName,
    mimeType: rec.mimeType,
    size: rec.size,
    uploadedAt: rec.uploadedAt,
    aiSummary: rec.aiSummary,
    aiAnalyzedAt: rec.aiAnalyzedAt,
    hasFile: existsSync(resolveStoredPath(rec.storedRelativePath))
  });
});

app.get("/api/guidelines/:id/file", (req, res) => {
  const rec = getGuideline(req.params.id);
  if (!rec) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const abs = resolveStoredPath(rec.storedRelativePath);
  if (!existsSync(abs)) {
    res.status(404).json({ error: "file_missing" });
    return;
  }
  res.setHeader("Content-Type", rec.mimeType);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(rec.originalName)}`);
  res.send(readFileSync(abs));
});

app.post("/api/guidelines/:id/upload", uploadGuideline.single("file"), async (req, res) => {
  const id = String(req.params.id);
  const displayName = (req.body?.displayName as string) || "Axis VI Brand guidelines";
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "file_required" });
    return;
  }

  const prev = getGuideline(id);
  if (prev?.storedRelativePath) {
    const oldAbs = resolveStoredPath(prev.storedRelativePath);
    try {
      if (existsSync(oldAbs)) unlinkSync(oldAbs);
    } catch {
      /* ignore */
    }
  }

  const storedRelativePath = join("data", "guidelines", file.filename).replace(/\\/g, "/");

  const record: GuidelineRecord = {
    id,
    displayName,
    originalName: file.originalname,
    storedRelativePath,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    aiSummary: null,
    aiAnalyzedAt: null
  };

  setGuideline(record);

  try {
    const abs = resolveStoredPath(storedRelativePath);
    const { summary } = await summarizeGuidelineFile(abs, file.mimetype);
    record.aiSummary = summary;
    record.aiAnalyzedAt = new Date().toISOString();
    setGuideline(record);
  } catch (e) {
    record.aiSummary =
      record.aiSummary ??
      `[AI 분석 실패] ${e instanceof Error ? e.message : String(e)}`;
    setGuideline(record);
  }

  res.json({
    ok: true,
    guideline: {
      id: record.id,
      displayName: record.displayName,
      originalName: record.originalName,
      uploadedAt: record.uploadedAt,
      aiSummary: record.aiSummary,
      aiAnalyzedAt: record.aiAnalyzedAt
    }
  });
});

app.post("/api/guidelines/:id/sync-fixed", async (req, res) => {
  const id = req.params.id;
  try {
    let record = copyFixedGuidelineToSlot(id);
    try {
      const abs = resolveStoredPath(record.storedRelativePath);
      const { summary } = await summarizeGuidelineFile(abs, record.mimeType);
      record = { ...record, aiSummary: summary, aiAnalyzedAt: new Date().toISOString() };
      setGuideline(record);
    } catch (e) {
      record = {
        ...record,
        aiSummary:
          record.aiSummary ?? `[AI 분석 실패] ${e instanceof Error ? e.message : String(e)}`
      };
      setGuideline(record);
    }
    const absPath = resolveStoredPath(record.storedRelativePath);
    res.json({
      ok: true,
      guideline: {
        id: record.id,
        displayName: record.displayName,
        originalName: record.originalName,
        mimeType: record.mimeType,
        size: record.size,
        uploadedAt: record.uploadedAt,
        aiSummary: record.aiSummary,
        aiAnalyzedAt: record.aiAnalyzedAt,
        hasFile: existsSync(absPath)
      }
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/guidelines/:id/analyze", async (req, res) => {
  const rec = getGuideline(req.params.id);
  if (!rec) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const abs = resolveStoredPath(rec.storedRelativePath);
  if (!existsSync(abs)) {
    res.status(404).json({ error: "file_missing" });
    return;
  }
  try {
    const { summary } = await summarizeGuidelineFile(abs, rec.mimeType);
    rec.aiSummary = summary;
    rec.aiAnalyzedAt = new Date().toISOString();
    setGuideline(rec);

    // RAG indexing (text extract -> chunk -> embedding -> store)
    // - PDF: extract text via pdf-parse
    // - Others: skip (no OCR) but still keep summary in local store
    if (process.env.GEMINI_API_KEY?.trim()) {
      try {
        const checksum = fileSha256Hex(abs);
        const src = await upsertGuidelineSource({
          guidelineId: rec.id,
          title: rec.displayName || rec.originalName || rec.id,
          storedRelativePath: rec.storedRelativePath || null,
          mimeType: rec.mimeType || null,
          checksum,
        });
        if (src?.sourceId) {
          const fullText = await extractGuidelineText(abs, rec.mimeType);
          const chunks = splitIntoChunks(fullText, { chunkChars: 1200, overlapChars: 160 });
          await deleteChunksForSource(src.sourceId);
          await insertChunksWithEmbeddings({
            sourceId: src.sourceId,
            chunks,
            embeddingModel: "gemini-embedding-001",
            embed: (t) => embedTextWithGemini(t, { model: "gemini-embedding-001" }),
          });
        }
      } catch (e) {
        console.error("[rag] guideline analyze indexing failed:", e instanceof Error ? e.message : String(e));
      }
    }

    res.json({ ok: true, aiSummary: summary, aiAnalyzedAt: rec.aiAnalyzedAt });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post(
  "/api/inspection/run",
  uploadInspection.fields([
    { name: "design", maxCount: 1 },
    { name: "supplementaryReference", maxCount: 1 }
  ]),
  async (req, res) => {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const businessCategory =
      typeof req.body?.businessCategory === "string" ? req.body.businessCategory.trim() : "";
    const designGroupRaw = typeof req.body?.designGroup === "string" ? req.body.designGroup.trim() : "";
    const designGroup = designGroupRaw === "online" || designGroupRaw === "offline" ? designGroupRaw : "";
    const designType = typeof req.body?.designType === "string" ? req.body.designType.trim() : "";

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.design?.[0];
    const supplementary = files?.supplementaryReference?.[0];
    if (!file) {
      res.status(400).json({ error: "design_required" });
      return;
    }

    let g = getGuideline(guidelineId);
    const extra =
      typeof req.body?.additionalNotes === "string" ? req.body.additionalNotes.trim() : "";

    if (g && !g.aiSummary?.trim() && process.env.GEMINI_API_KEY?.trim()) {
      try {
        const abs = resolveStoredPath(g.storedRelativePath);
        if (existsSync(abs)) {
          const { summary } = await summarizeGuidelineFile(abs, g.mimeType);
          g = { ...g, aiSummary: summary, aiAnalyzedAt: new Date().toISOString() };
          setGuideline(g);
        }
      } catch {
        /* 검수는 PDF 발췌 등으로 계속 진행 */
      }
    }

    // 참조 가이드라인(요약/발췌) + RAG 발췌(가능하면)
    const ragQuerySeed = [
      businessCategory ? `사업 영역: ${businessCategory}` : "",
      designGroup ? `디자인 그룹: ${designGroup}` : "",
      designType ? `디자인 유형: ${designType}` : "",
      extra ? `추가 검수 요청: ${extra}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    let guidelineSummary = await buildPrimaryGuidelineBlock(guidelineId, ragQuerySeed);

    /** 0) 카테고리 선택 맥락(추가 검수 원칙 확장 가능) */
    const categoryLines: string[] = [];
    if (businessCategory) categoryLines.push(`- 사업 영역: ${businessCategory}`);
    if (designGroup) categoryLines.push(`- 디자인 그룹: ${designGroup === "online" ? "온라인" : "오프라인"}`);
    if (designType) categoryLines.push(`- 디자인 유형: ${designType}`);
    if (categoryLines.length > 0) {
      guidelineSummary = `${guidelineSummary}\n\n[검수 카테고리]\n${categoryLines.join("\n")}`;
    }

    /** 2) 검수 참조 파일 업로드(선택) — 고정 옵션 자료에 덧붙이는 보조 맥락 */
    if (supplementary?.buffer?.length) {
      try {
        const suppText = await supplementaryReferenceToSummary(supplementary);
        const name = supplementary.originalname || "추가참조파일";
        guidelineSummary += `\n\n---\n[검수 참조 추가 업로드 자료 — ${name}]\n${suppText}\n---`;
      } catch (e) {
        guidelineSummary += `\n\n[검수 참조 추가 업로드 자료 처리 실패] ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (extra) {
      guidelineSummary = `${guidelineSummary}\n\n[사용자 직접 입력 검수 사항]\n${extra}`;
    }

    const buf = file.buffer;
    const designBase64 = buf.toString("base64");
    const designMime = file.mimetype;

    try {
      const t0 = Date.now();
      const result = await runInspectionWithGemini({
        designBase64,
        designMime,
        guidelineSummary
      });

      let revisedImage: { mimeType: string; data: string } | null = null;
      let revisionCaption: string | null = null;
      let revisionNote: string | null = null;

      if (designMime === "application/pdf") {
        revisionNote = "검수 대상이 PDF인 경우 수정 이미지 생성은 지원하지 않습니다. 이미지(PNG/JPEG)를 올리면 AI 수정본이 함께 생성됩니다.";
      } else if (designMime.startsWith("image/") && process.env.GEMINI_API_KEY?.trim()) {
        const rev = await generateRevisedBrandingImage({
          designBase64,
          designMime,
          guidelineContext: guidelineSummary,
          overallSummary: result.overallSummary,
          violations: result.violations,
          userNotes: extra
        });
        if (rev) {
          revisedImage = { mimeType: rev.mimeType, data: rev.base64 };
          revisionCaption = rev.caption;
        } else {
          revisionNote =
            "수정 이미지 생성에 실패했습니다. GEMINI_IMAGE_MODEL 또는 사용 가능한 이미지 모델(gemini-3.1-flash-image-preview 등)을 확인하세요.";
        }
      }

      // Auto-save run (non-blocking if Supabase env missing or insert fails)
      const runSaved = await persistRun({
        req,
        type: "inspection",
        status: "pending_review",
        guidelineId,
        mediaType: designGroup || null,
        inputJson: {
          guidelineId,
          businessCategory,
          designGroup,
          designType,
          additionalNotes: extra || null,
          supplementaryUploaded: Boolean(supplementary?.buffer?.length),
          designMime,
          designBytes: buf.length,
        },
        outputJson: {
          score: result.score,
          overallSummary: result.overallSummary,
          violations: result.violations,
          revisedImage: revisedImage ? { mimeType: revisedImage.mimeType } : null,
          revisionCaption,
          revisionNote,
        },
        inputText: guidelineSummary,
        outputText: result.overallSummary,
        score: result.score,
        model: process.env.GEMINI_MODEL?.trim() || null,
        latencyMs: Date.now() - t0,
      });
      if (runSaved?.runId) {
        await persistRunArtifact({
          runId: runSaved.runId,
          kind: "inspection_input",
          mimeType: designMime,
          dataJson: { designMime, designBytes: buf.length },
        });
        if (revisedImage) {
          await persistRunArtifact({
            runId: runSaved.runId,
            kind: "revised_image_inline_base64",
            mimeType: revisedImage.mimeType,
            dataJson: { note: "base64 returned to client; not stored in DB by default" },
          });
        }
      }

      res.json({
        ok: true,
        score: result.score,
        overallSummary: result.overallSummary,
        violations: result.violations,
        guidelineId,
        usedGuidelineSummary: Boolean(g?.aiSummary?.trim()),
        revisedImage,
        revisionCaption,
        revisionNote
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

app.post(
  "/api/naming/run",
  uploadNaming.fields([{ name: "supplementaryReference", maxCount: 1 }]),
  async (req, res) => {
    try {
      const mode = req.body?.mode === "generate" ? "generate" : "audit";
      const auditName = String(req.body?.auditName ?? "").trim();
      const namingIntent = String(req.body?.namingIntent ?? "").trim();
      const auditCategory = String(req.body?.auditCategory ?? "").trim();
      let requestText = String(req.body?.requestText ?? "").trim();

      const generateStyle =
        mode === "generate" && String(req.body?.generateStyle ?? "").trim() === "tiered" ? "tiered" : "general";
      let tierStepCount = 4;
      let tierLabelsEffective: string[] = [];
      if (mode === "generate" && generateStyle === "tiered") {
        const rawN = parseInt(String(req.body?.tierStepCount ?? "3"), 10);
        tierStepCount = Number.isFinite(rawN) ? Math.min(6, Math.max(1, rawN)) : 3;
        try {
          const rawJ = req.body?.tierLabelsJson;
          if (typeof rawJ === "string" && rawJ.trim()) {
            const parsed = JSON.parse(rawJ) as unknown;
            if (Array.isArray(parsed)) {
              tierLabelsEffective = parsed.map((x) => String(x ?? "").trim() || "단계").slice(0, tierStepCount);
            }
          }
        } catch {
          tierLabelsEffective = [];
        }
        while (tierLabelsEffective.length < tierStepCount) {
          tierLabelsEffective.push(`단계 ${tierLabelsEffective.length + 1}`);
        }
      }

      if (mode === "audit" && (auditName || namingIntent)) {
        const catBlock = auditCategory ? `${auditCategory}\n\n` : "";
        requestText = `${catBlock}[검수명]\n${auditName}\n\n${namingIntent}`;
      } else if (mode === "generate" && auditCategory) {
        requestText = `${auditCategory}\n\n[생성 요청]\n${requestText}`;
      }
      if (mode === "generate" && generateStyle === "tiered" && tierLabelsEffective.length > 0) {
        const tierBlock = tierLabelsEffective.map((lb, i) => `${i + 1}. ${lb}`).join("\n");
        requestText = `${requestText}\n\n[단계별 생성 — 요금제·가격대 라인업]\n한 번의 생성에서 **서로 다른 세계관·스토리라인을 가진 대안 패키지를 정확히 4개** 제안합니다. 각 패키지는 아래 ${tierStepCount}개 단계명과 **1:1 순서**로 대응하는 네이밍을 모두 포함해야 하며(순서 동일), **같은 패키지 안의 단계 네이밍은 하나의 스토리라인에서 일관되게 파생**되도록 하십시오.\n${tierBlock}`;
      }
      const referenceText =
        typeof req.body?.referenceText === "string" ? req.body.referenceText.trim() : "";
      const useLibrary = req.body?.useGuidelineLibrary !== "false" && req.body?.useGuidelineLibrary !== false;
      const rawGuidelineId = String(req.body?.guidelineId ?? "").trim();

      if (!requestText) {
        res.status(400).json({ error: "requestText_required" });
        return;
      }

      let guidelineId: string | null = null;
      let guidelineBlock = "";
      if (useLibrary) {
        if (!rawGuidelineId || !FIXED_GUIDELINE_SOURCES[rawGuidelineId]) {
          res.status(400).json({ error: "invalid_or_missing_guidelineId" });
          return;
        }
        guidelineId = rawGuidelineId;
        try {
          copyFixedGuidelineToSlot(guidelineId);
        } catch (e) {
          res.status(500).json({ error: String(e) });
          return;
        }
        guidelineBlock = await buildPrimaryGuidelineBlock(
          guidelineId,
          [auditCategory, auditName, namingIntent, requestText, referenceText].filter(Boolean).join("\n\n")
        );
      } else {
        guidelineBlock =
          "[참조 가이드라인]\n사용자가 라이브러리 참조를 끈 상태입니다. 아래 직접 입력·업로드만 반영하세요.";
      }

      let supplement = "";
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const sup = files?.supplementaryReference?.[0];
      if (sup?.buffer?.length) {
        try {
          supplement = await supplementaryReferenceToSummary(sup);
        } catch (e) {
          supplement = `[추가 파일 요약 실패: ${String(e)}]`;
        }
      }

      const externalBlock = await buildExternalNamingReferences({
        mode,
        auditName,
        namingIntent,
        requestText
      });

      const referenceNotes = [
        referenceText ? `[참고 정보 직접 입력]\n${referenceText}` : "",
        supplement ? `[파일 직접 업로드 요약]\n${supplement}` : "",
        externalBlock ? `[국가법령정보 연동 요약]\n${externalBlock}` : ""
      ]
        .filter(Boolean)
        .join("\n\n");

      const result = await runBrandNamingWithGemini({
        mode,
        requestText,
        referenceNotes,
        guidelineBlock,
        auditCategoryRaw: auditCategory || undefined,
        generatePlan:
          mode === "generate" && generateStyle === "tiered"
            ? { kind: "tiered" as const, stepCount: tierStepCount, labels: tierLabelsEffective }
            : mode === "generate"
              ? { kind: "general" as const }
              : undefined
      });

      // Auto-save naming run
      await persistRun({
        req,
        type: mode === "generate" ? "naming_generate" : "naming_audit",
        status: "pending_review",
        guidelineId: useLibrary && guidelineId ? guidelineId : null,
        inputJson: {
          mode,
          auditName,
          namingIntent,
          auditCategory,
          requestText,
          referenceText: referenceText || null,
          supplementIncluded: Boolean(supplement),
          useGuidelineLibrary: useLibrary,
          guidelineId: useLibrary && guidelineId ? guidelineId : null,
          generateMeta:
            mode === "generate"
              ? {
                  style: generateStyle,
                  ...(generateStyle === "tiered" ? { tierStepCount, tierLabels: tierLabelsEffective } : {}),
                }
              : null,
        },
        outputJson: result as unknown as Record<string, unknown>,
        inputText: `${guidelineBlock}\n\n${referenceNotes}\n\n${requestText}`.trim(),
        outputText: JSON.stringify(result),
        model: process.env.GEMINI_MODEL?.trim() || null,
      });

      res.json({
        ok: true,
        mode,
        guidelineId: useLibrary && guidelineId ? guidelineId : null,
        ...result,
        namingGeminiConfigured: hasGeminiApiKey(),
        generateMeta:
          mode === "generate"
            ? {
                style: generateStyle,
                ...(generateStyle === "tiered"
                  ? { tierStepCount, tierLabels: tierLabelsEffective }
                  : {})
              }
            : undefined
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

app.post("/api/inspection/followup", async (req, res) => {
  try {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const message = String(req.body?.message ?? "").trim();
    const designMime = String(req.body?.designMime ?? "");
    const designBase64 = String(req.body?.designBase64 ?? "");
    const revisionBase64 =
      typeof req.body?.revisionBase64 === "string" && req.body.revisionBase64.length > 0
        ? String(req.body.revisionBase64)
        : "";
    const revisionMime = String(req.body?.revisionMime ?? "");
    const overallSummary = String(req.body?.overallSummary ?? "");
    const additionalNotes =
      typeof req.body?.additionalNotes === "string" ? req.body.additionalNotes.trim() : "";
    const rawViol = req.body?.violations;
    const violations = Array.isArray(rawViol)
      ? rawViol.map((v: { category?: string; issue?: string; severity?: string }) => ({
          category: String(v?.category ?? ""),
          issue: String(v?.issue ?? ""),
          severity: String(v?.severity ?? "medium")
        }))
      : [];

    if (!message) {
      res.status(400).json({ error: "message_required" });
      return;
    }
    if (!designBase64 || !designMime) {
      res.status(400).json({ error: "design_required" });
      return;
    }

    let guidelineContext = await buildPrimaryGuidelineBlock(guidelineId, message);
    if (additionalNotes) {
      guidelineContext += `\n\n[사용자 직접 입력 검수 사항]\n${additionalNotes}`;
    }

    const baseIsRevision = Boolean(revisionBase64);
    const base64ForImage = baseIsRevision ? revisionBase64 : designBase64;
    const mimeForImage = baseIsRevision && revisionMime ? revisionMime : designMime;

    if (mimeForImage.startsWith("image/") && process.env.GEMINI_API_KEY?.trim()) {
      const img = await generateRevisedBrandingImageFollowup({
        baseImageBase64: base64ForImage,
        baseImageMime: mimeForImage,
        guidelineContext,
        overallSummary,
        violations,
        chatInstruction: message,
        baseIsRevision
      });
      if (img) {
        res.json({
          ok: true,
          replyText: img.caption,
          revisedImage: { mimeType: img.mimeType, data: img.base64 },
          imageUpdated: true
        });
        return;
      }
    }

    const replyText = await answerInspectionAgentChat({
      guidelineContext,
      overallSummary,
      violations,
      userMessage: message,
      designMime,
      designBase64,
      additionalNotes: additionalNotes || undefined
    });
    res.json({
      ok: true,
      replyText,
      revisedImage: null,
      imageUpdated: false
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/inspection/additional-revision", async (req, res) => {
  try {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const designMime = String(req.body?.designMime ?? "");
    const designBase64 = String(req.body?.designBase64 ?? "");
    const revisionBase64 =
      typeof req.body?.revisionBase64 === "string" && req.body.revisionBase64.length > 0
        ? String(req.body.revisionBase64)
        : "";
    const revisionMime = String(req.body?.revisionMime ?? "");
    const overallSummary = String(req.body?.overallSummary ?? "");
    const additionalNotes =
      typeof req.body?.additionalNotes === "string" ? req.body.additionalNotes.trim() : "";
    const supMime = String(req.body?.supplementaryMime ?? "");
    const supBase64 =
      typeof req.body?.supplementaryBase64 === "string" && req.body.supplementaryBase64.length > 0
        ? String(req.body.supplementaryBase64)
        : "";
    const rawViol = req.body?.violations;
    const violations = Array.isArray(rawViol)
      ? rawViol.map((v: { category?: string; issue?: string; severity?: string }) => ({
          category: String(v?.category ?? ""),
          issue: String(v?.issue ?? ""),
          severity: String(v?.severity ?? "medium")
        }))
      : [];

    if (!designBase64 || !designMime.startsWith("image/")) {
      res.status(400).json({ error: "design_image_required" });
      return;
    }

    let guidelineContext = await buildPrimaryGuidelineBlock(guidelineId, [additionalNotes, overallSummary].filter(Boolean).join("\n\n"));
    if (additionalNotes) {
      guidelineContext += `\n\n[사용자 직접 입력 검수 사항]\n${additionalNotes}`;
    }

    let supplementaryImage: { mimeType: string; base64: string } | null = null;
    if (supBase64 && supMime.startsWith("image/")) {
      supplementaryImage = { mimeType: supMime, base64: supBase64 };
    } else if (supBase64 && supMime === "application/pdf") {
      try {
        const buf = Buffer.from(supBase64, "base64");
        const tmp = join(tmpdir(), `uplus-addrev-${Date.now()}-${randomBytes(8).toString("hex")}.pdf`);
        writeFileSync(tmp, buf);
        try {
          const { summary } = await summarizeGuidelineFile(tmp, supMime);
          guidelineContext += `\n\n---\n[검수 참조 추가 업로드 자료 — PDF]\n${summary.trim()}\n---`;
        } finally {
          try {
            unlinkSync(tmp);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        guidelineContext += `\n\n[추가 참조 PDF 처리 실패] ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (!process.env.GEMINI_API_KEY?.trim()) {
      res.status(503).json({ error: "GEMINI_API_KEY가 설정되어 있지 않습니다." });
      return;
    }

    const out = await additionalRevisionImagePipeline({
      guidelineContext,
      overallSummary,
      violations,
      designMime,
      designBase64,
      revisionMime: revisionMime || undefined,
      revisionBase64: revisionBase64 || undefined,
      supplementaryImage
    });

    if (!out) {
      res.json({
        ok: false,
        revisedImage: null,
        imageUpdated: false,
        revisionNote:
          "추가 수정 이미지를 생성하지 못했습니다. GEMINI_IMAGE_MODEL 또는 이미지 모델 설정을 확인하세요."
      });
      return;
    }

    await persistRun({
      req,
      type: "inspection_additional_revision",
      status: "pending_review",
      guidelineId,
      inputJson: {
        guidelineId,
        designMime,
        revisionMime: revisionMime || null,
        supplementaryMime: supMime || null,
        hasSupplementary: Boolean(supBase64),
        additionalNotes: additionalNotes || null,
        violationsCount: violations.length,
      },
      outputJson: { ok: true, mimeType: out.mimeType, imageUpdated: true },
      inputText: guidelineContext,
      outputText: null,
      model: process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || null,
    });

    res.json({
      ok: true,
      revisedImage: { mimeType: out.mimeType, data: out.base64 },
      imageUpdated: true
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/design-editor/suggest-text", async (req, res) => {
  try {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const contentJson = String(req.body?.contentJson ?? "");
    const templateLabel = String(req.body?.templateLabel ?? "template");
    const rawTargets = req.body?.targets;
    const allowed = new Set([
      "mainTitle",
      "subtitle",
      "subtitle2",
      "subtitle3",
      "body",
      "body2",
      "body3",
      "footer"
    ]);
    const targets = Array.isArray(rawTargets)
      ? rawTargets.filter((t: unknown): t is DesignEditorTextSuggestionTarget =>
          typeof t === "string" && allowed.has(t)
        )
      : [];
    if (targets.length === 0) {
      res.status(400).json({ error: "targets_required" });
      return;
    }
    const creativeTopic =
      typeof req.body?.creativeTopic === "string" ? req.body.creativeTopic.trim() : "";
    const guidelineSummary = await buildPrimaryGuidelineBlock(guidelineId, [templateLabel, creativeTopic].filter(Boolean).join("\n\n"));
    const out = await runDesignEditorTextSuggestion({
      guidelineSummary,
      contentJson,
      targets,
      templateLabel,
      creativeTopic: creativeTopic || undefined
    });

    await persistRun({
      req,
      type: "design_editor_text_suggestion",
      status: "pending_review",
      guidelineId,
      templateId: templateLabel || null,
      inputJson: { guidelineId, templateLabel, targets, creativeTopic: creativeTopic || null, contentJsonBytes: contentJson.length },
      outputJson: out as unknown as Record<string, unknown>,
      inputText: guidelineSummary,
      outputText: JSON.stringify(out),
      model: process.env.GEMINI_MODEL?.trim() || null,
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/design-editor/correct-canvas", async (req, res) => {
  try {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const designBase64 = String(req.body?.designBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
    const designMime = String(req.body?.designMime ?? "image/png");
    const mode = req.body?.mode === "holistic" ? "holistic" : "inspection_followup";
    const overallSummary = typeof req.body?.overallSummary === "string" ? req.body.overallSummary : "";
    const rawViol = req.body?.violations;
    const violations = Array.isArray(rawViol)
      ? rawViol.map((v: { category?: string; issue?: string; severity?: string }) => ({
          category: String(v?.category ?? ""),
          issue: String(v?.issue ?? ""),
          severity: String(v?.severity ?? "medium")
        }))
      : [];

    if (!designBase64 || !designMime.startsWith("image/")) {
      res.status(400).json({ error: "design_image_required" });
      return;
    }

    if (!process.env.GEMINI_API_KEY?.trim()) {
      res.status(503).json({ error: "GEMINI_API_KEY가 설정되어 있지 않습니다." });
      return;
    }

    const creativeTopic =
      typeof req.body?.creativeTopic === "string" ? req.body.creativeTopic.trim() : "";
    const viPdf = await buildMandatoryViPdfContextForDesignEditor(
      guidelineId,
      [overallSummary, creativeTopic].filter(Boolean).join("\n\n")
    );
    if (!viPdf.ok) {
      res.status(viPdf.status).json({ error: viPdf.error });
      return;
    }
    const out = await runDesignEditorCanvasVisualCorrection({
      designBase64,
      designMime,
      guidelineContext: viPdf.block,
      overallSummary: overallSummary || undefined,
      violations: violations.length > 0 ? violations : undefined,
      mode,
      creativeTopic: creativeTopic || undefined
    });

    if (!out) {
      res.status(503).json({ error: "correction_failed" });
      return;
    }

    await persistRun({
      req,
      type: "design_editor_visual_correction",
      status: "pending_review",
      guidelineId,
      inputJson: {
        guidelineId,
        designMime,
        mode,
        creativeTopic: creativeTopic || null,
        violationsCount: violations.length,
        overallSummary: overallSummary || null,
      },
      outputJson: { ok: true, mimeType: out.mimeType, caption: out.caption },
      inputText: viPdf.block,
      outputText: out.caption ?? null,
      model: process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || null,
    });

    res.json({ ok: true, mimeType: out.mimeType, data: out.base64, caption: out.caption });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/design-editor/inspect", async (req, res) => {
  try {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const imageBase64 = String(req.body?.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
    const imageMime = String(req.body?.imageMime ?? "image/png");
    const templateId = String(req.body?.templateId ?? "");
    const designContent = req.body?.designContent;

    if (!imageBase64) {
      res.status(400).json({ error: "image_required" });
      return;
    }

    const creativeTopic =
      typeof req.body?.creativeTopic === "string" ? req.body.creativeTopic.trim() : "";
    const viPdf = await buildMandatoryViPdfContextForDesignEditor(
      guidelineId,
      [templateId, creativeTopic].filter(Boolean).join("\n\n")
    );
    if (!viPdf.ok) {
      res.status(viPdf.status).json({ error: viPdf.error });
      return;
    }
    const result = await runDesignEditorCanvasInspection({
      designBase64: imageBase64,
      designMime: imageMime,
      guidelineSummary: viPdf.block,
      designContentJson: JSON.stringify(designContent ?? {}),
      templateLabel: templateId || "template",
      creativeTopic: creativeTopic || undefined
    });

    await persistRun({
      req,
      type: "design_editor_inspection",
      status: "pending_review",
      guidelineId,
      templateId: templateId || null,
      inputJson: { guidelineId, templateId: templateId || null, imageMime, creativeTopic: creativeTopic || null },
      outputJson: { score: result.score, overallSummary: result.overallSummary, violations: result.violations },
      inputText: viPdf.block,
      outputText: result.overallSummary,
      score: result.score,
      model: process.env.GEMINI_MODEL?.trim() || null,
    });

    res.json({
      score: result.score,
      overallSummary: result.overallSummary,
      violations: result.violations
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/design-editor/replace-image", async (req, res) => {
  try {
    const guidelineId = (req.body?.guidelineId as string) || "uplus-brand-guideline";
    const designBase64 = String(req.body?.designBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
    const designMime = String(req.body?.designMime ?? "");
    const imageBrief = String(req.body?.imageBrief ?? "").trim();

    if (!designBase64 || !designMime.startsWith("image/") || !imageBrief) {
      res.status(400).json({ error: "bad_request" });
      return;
    }

    if (!process.env.GEMINI_API_KEY?.trim()) {
      res.status(503).json({ error: "GEMINI_API_KEY가 설정되어 있지 않습니다." });
      return;
    }

    const creativeTopic =
      typeof req.body?.creativeTopic === "string" ? req.body.creativeTopic.trim() : "";
    const guidelineContext = await buildPrimaryGuidelineBlock(guidelineId, [imageBrief, creativeTopic].filter(Boolean).join("\n\n"));
    const out = await generateDesignEditorReplacementImage({
      designBase64,
      designMime,
      guidelineContext,
      imageBrief,
      creativeTopic: creativeTopic || undefined
    });

    if (!out) {
      res.status(503).json({ error: "image_generation_failed" });
      return;
    }

    res.json({ ok: true, mimeType: out.mimeType, data: out.base64 });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: approve/reject + review queue (stored in Supabase)
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/admin/runs", async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "pending_review";
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

    const selectQuery = (sb: ReturnType<typeof getSupabaseServiceClient>) =>
      sb
        .from("runs")
        .select("id,created_at,type,status,guideline_id,template_id,score,model,input_text,output_text,input_json,output_json")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(limit);

    try {
      const sb = getSupabaseServiceClient();
      const { data, error } = await selectQuery(sb);
      if (error) throw new Error(error.message);
      res.json({ ok: true, runs: data ?? [] });
      return;
    } catch (e) {
      // If service role key is misconfigured, try anon for read-only listing.
      if (!isSupabaseInvalidApiKeyError(e)) throw e;
      const sbAnon = getSupabaseAnonClient();
      const { data, error } = await selectQuery(sbAnon as unknown as ReturnType<typeof getSupabaseServiceClient>);
      if (error) throw new Error(error.message);
      res.json({ ok: true, runs: data ?? [] });
      return;
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/admin/runs/:id/approve", async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }
  try {
    const id = String((req.params as { id?: string }).id ?? "").trim();
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    const reviewer = typeof req.body?.reviewer === "string" ? req.body.reviewer.trim() : "";

    const sb = getSupabaseServiceClient();
    const { data: run, error: runErr } = await sb
      .from("runs")
      .select("id,type,guideline_id,input_text,output_text,input_json,output_json")
      .eq("id", id)
      .single();
    if (runErr) throw new Error(runErr.message);

    const { error: upErr } = await sb
      .from("runs")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) throw new Error(upErr.message);

    const { error: revErr } = await sb.from("reviews").insert({
      run_id: id,
      decision: "approved",
      reason: null,
      reviewer: reviewer || null,
    });
    if (revErr) console.error("[supabase] insert review failed:", revErr.message);

    // Approved run -> RAG run_qa indexing
    // 승인된 산출물은 type별 표준 MD 양식으로 정제한 뒤 청크 → 임베딩 → rag_*에 적재합니다.
    const geminiKeyPresent = Boolean(process.env.GEMINI_API_KEY?.trim());
    const ragEnabled = isSupabaseRagEnabled();
    if (geminiKeyPresent) {
      try {
        const title = `Approved ${String(run.type)} — ${id.slice(0, 8)}`;
        const src = await upsertRunQaSource({ runId: id, title, guidelineId: run.guideline_id ?? null });
        if (!ragEnabled) {
          console.warn("[rag] approve: Supabase RAG env missing — skipped indexing (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required)");
        } else if (!src?.sourceId) {
          console.warn(`[rag] approve: upsertRunQaSource returned no sourceId for run=${id.slice(0, 8)}`);
        }
        if (src?.sourceId) {
          const normalized = normalizeRunForRag({
            type: String(run.type ?? ""),
            guidelineId: run.guideline_id ?? null,
            outputJson: run.output_json,
            outputText: run.output_text,
            inputJson: run.input_json,
            inputText: run.input_text,
          });
          const normalizedTrim = normalized.trim();
          const fallbackText = String(run.output_text ?? "").trim();
          const fallbackJson = JSON.stringify(run.output_json ?? {});
          const corpus = normalizedTrim || fallbackText || fallbackJson;
          const corpusSource = normalizedTrim
            ? "normalized"
            : fallbackText
              ? "output_text"
              : "output_json_string";
          const chunks = splitIntoChunks(corpus, { chunkChars: 1000, overlapChars: 140 });
          console.log(
            `[rag] approve indexing run=${id.slice(0, 8)} type=${String(run.type)} corpus=${corpusSource} chars=${corpus.length} chunks=${chunks.length}`
          );
          if (chunks.length === 0) {
            console.warn(
              `[rag] approve: empty corpus after chunking — run=${id.slice(0, 8)} type=${String(run.type)} (no rag_chunks will be written)`
            );
          }
          await deleteChunksForSource(src.sourceId);
          const result = await insertChunksWithEmbeddings({
            sourceId: src.sourceId,
            chunks,
            embeddingModel: "gemini-embedding-001",
            embed: (t) => embedTextWithGemini(t, { model: "gemini-embedding-001" }),
          });
          if (result) {
            console.log(
              `[rag] approve persisted run=${id.slice(0, 8)} type=${String(run.type)} requested=${chunks.length} inserted=${result.inserted} embedded=${result.embedded} failed=${result.failed}`
            );
          } else {
            console.warn(`[rag] approve: insertChunksWithEmbeddings returned null (isSupabaseRagEnabled=false?) run=${id.slice(0, 8)}`);
          }
        }
      } catch (e) {
        console.error("[rag] run approve indexing failed:", e instanceof Error ? e.message : String(e));
      }
    } else {
      console.warn("[rag] approve: GEMINI_API_KEY unset — RAG indexing skipped after approval");
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/admin/runs/:id/reject", async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }
  try {
    const id = String((req.params as { id?: string }).id ?? "").trim();
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const reviewer = typeof req.body?.reviewer === "string" ? req.body.reviewer.trim() : "";

    const sb = getSupabaseServiceClient();
    const { error: upErr } = await sb
      .from("runs")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) throw new Error(upErr.message);

    const { error: revErr } = await sb.from("reviews").insert({
      run_id: id,
      decision: "rejected",
      reason: reason || null,
      reviewer: reviewer || null,
    });
    if (revErr) console.error("[supabase] insert review failed:", revErr.message);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export { app };
