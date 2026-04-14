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
  generateRevisedBrandingImage,
  generateRevisedBrandingImageFollowup,
  hasGeminiApiKey,
  runBrandNamingWithGemini,
  runInspectionWithGemini,
  summarizeGuidelineFile
} from "./gemini.js";
import { copyFixedGuidelineToSlot, FIXED_GUIDELINE_SOURCES } from "./fixedGuidelines.js";
import { buildExternalNamingReferences } from "./namingExternalContext.js";
import {
  ensureDataDirs,
  getGuideline,
  GUIDELINES_DIR,
  setGuideline,
  type GuidelineRecord,
  resolveStoredPath,
  loadMeta
} from "./store.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: true }));
/** 검수 follow-up·대용량 base64 본문 대응 (2mb면 이미지 포함 요청이 잘림) */
app.use(express.json({ limit: "50mb" }));

ensureDataDirs();

/** 검수·에이전트 채팅용: 선택된 참조 가이드라인 슬롯의 본문(요약/발췌) */
async function buildPrimaryGuidelineBlock(guidelineId: string): Promise<string> {
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
  return `[참조 가이드라인 — 우선 적용 (${g?.displayName ?? guidelineId})]\n${primaryBlock}`;
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
  res.json({ ok: true, gemini: Boolean(process.env.GEMINI_API_KEY?.trim()) });
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
  const displayName = (req.body?.displayName as string) || "LGU+ VI Brandguidelines";
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

    /** 1) 참조 가이드라인 옵션에 연동된 서버 저장본(우선) */
    let primaryBlock: string;
    if (g?.aiSummary?.trim()) {
      primaryBlock = g.aiSummary;
    } else if (g) {
      primaryBlock = await excerptGuidelineForInspection(g);
    } else {
      primaryBlock =
        "등록된 참조 가이드라인이 없습니다. 브랜드 검수 화면에서 참조 가이드라인 옵션을 선택하거나 동기화하세요.";
    }

    let guidelineSummary = `[참조 가이드라인 — 우선 적용 (${g?.displayName ?? guidelineId})]\n${primaryBlock}`;

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
            "수정 이미지 생성에 실패했습니다. GEMINI_IMAGE_MODEL 또는 사용 가능한 이미지 모델(gemini-2.5-flash-image 등)을 확인하세요.";
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

/**
 * 검수 완료 후 AI 에이전트 채팅: 참조 가이드라인 맥락 + 검수 결과 + 사용자 질문.
 * 이미지 검수 대상이면 수정본을 사용자 요청에 맞춰 한 번 더 생성해 반환할 수 있음.
 */
/**
 * 브랜드 네이밍: U+ 브랜드 가이드라인 PDF + 사용자 업로드/직접 입력 + 요청 텍스트를 Gemini에 전달.
 * mode: generate | audit
 */
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
      if (mode === "audit" && (auditName || namingIntent)) {
        const catBlock = auditCategory ? `${auditCategory}\n\n` : "";
        requestText = `${catBlock}[검수명]\n${auditName}\n\n${namingIntent}`;
      } else if (mode === "generate" && auditCategory) {
        requestText = `${auditCategory}\n\n[생성 요청]\n${requestText}`;
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
        guidelineBlock = await buildPrimaryGuidelineBlock(guidelineId);
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
        externalBlock ? `[KIPRIS·국가법령정보센터 연동 요약]\n${externalBlock}` : ""
      ]
        .filter(Boolean)
        .join("\n\n");

      const result = await runBrandNamingWithGemini({
        mode,
        requestText,
        referenceNotes,
        guidelineBlock,
        auditCategoryRaw: auditCategory || undefined
      });

      res.json({
        ok: true,
        mode,
        guidelineId: useLibrary && guidelineId ? guidelineId : null,
        ...result,
        namingGeminiConfigured: hasGeminiApiKey()
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

    let guidelineContext = await buildPrimaryGuidelineBlock(guidelineId);
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

/** 검수 완료 후 "추가 수정": 기획(텍스트) → 이미지 생성 API로 실제 수정본만 반환 */
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

    let guidelineContext = await buildPrimaryGuidelineBlock(guidelineId);
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

    res.json({
      ok: true,
      revisedImage: { mimeType: out.mimeType, data: out.base64 },
      imageUpdated: true
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.error(`[guideline-api] http://localhost:${PORT}`);
});
