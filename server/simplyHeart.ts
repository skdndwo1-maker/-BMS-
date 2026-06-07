/**
 * Simply Heart — 심플리 가이드 통합 분석 또는(레거시) 단계별 Gemini 호출
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FIXED_GUIDELINE_SOURCES, SIMPLY_HEART_FIXED_GUIDE_IDS } from "./fixedGuidelines.js";
import type { GuidelineRecord } from "./store.js";
import { loadMeta, resolveStoredPath } from "./store.js";
import { excerptGuidelineForInspection } from "./gemini.js";
import {
  formatGeminiFailureMessage,
  geminiApiKeyCandidates,
  isPrepaymentCreditsDepletedError,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./gemini/shared.js";

const CORE_GUIDES: readonly { id: string; title: string; cap?: number }[] = [
  {
    id: "simply-uplus-guideline",
    title: "Simply U+ 가이드라인 (2604 설명자료·실천과제 V2, 18개 분류·학습용)",
    cap: 60_000,
  },
  {
    id: "simply-uplus-job-guide",
    title: "직무별 Simply U+ 실행 가이드 v1 (학습용)",
    cap: 45_000,
  },
] as const;

export async function extractPdfTextFromBase64(base64: string): Promise<string> {
  const buf = Buffer.from(base64, "base64");
  const pdfParseMod = (await import("pdf-parse")) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>;
  };
  const out = await pdfParseMod.default(buf);
  const t = String(out.text ?? "").trim();
  return t.slice(0, 85_000);
}

/** 레포 고정 경로 PDF를 우선 사용(슬롯·구버전 aiSummary와 무관하게 최신 파일 반영) */
function recordFromFixedSimplyHeartGuide(id: string): GuidelineRecord | null {
  if (!SIMPLY_HEART_FIXED_GUIDE_IDS.includes(id)) return null;
  const spec = FIXED_GUIDELINE_SOURCES[id];
  if (!spec) return null;
  const rel = spec.relativeSource.replace(/\\/g, "/");
  if (!existsSync(resolveStoredPath(rel))) return null;
  return {
    id,
    displayName: spec.displayName,
    originalName: basename(rel),
    storedRelativePath: rel,
    mimeType: "application/pdf",
    size: 0,
    uploadedAt: "",
    aiSummary: null,
    aiAnalyzedAt: null,
  };
}

async function buildGuidelineContext(): Promise<string> {
  const meta = loadMeta();
  const parts: string[] = [];
  const defaultCap = 34_000;

  for (const entry of CORE_GUIDES) {
    const { id, title } = entry;
    const perCap = entry.cap ?? defaultCap;
    const g: GuidelineRecord | undefined =
      SIMPLY_HEART_FIXED_GUIDE_IDS.includes(id) ? recordFromFixedSimplyHeartGuide(id) ?? meta.guidelines[id] : meta.guidelines[id];
    if (!g) {
      const hint = SIMPLY_HEART_FIXED_GUIDE_IDS.includes(id)
        ? `고정 PDF 없음: ${FIXED_GUIDELINE_SOURCES[id]?.relativeSource ?? id} 에 파일을 두세요.`
        : "슬롯 미등록: 고정 PDF를 sync-fixed로 복사하거나 업로드하면 이 맥락이 채워집니다.";
      parts.push(`[${title}]\n(${hint})`);
      continue;
    }
    try {
      let body: string;
      if (g.aiSummary?.trim()) body = g.aiSummary.trim();
      else body = (await excerptGuidelineForInspection(g)).trim();
      if (body.length > perCap) body = `${body.slice(0, perCap)}\n…(발췌 생략)`;
      parts.push(`[${title} — ${g.displayName}]\n${body}`);
    } catch {
      parts.push(`[${title}]\n(본문 로드 실패)`);
    }
  }
  return parts.join("\n\n==========\n\n");
}

function sharedRules(): string {
  return `
[심플리 가이드]
- 판단·근거는 **오직 [참고 가이드라인]**에 실린 (1) Simply U+ 설명자료·실천과제 V2(18개 분류·학습용), (2) 직무별 Simply U+ 실행 가이드 v1(학습용)만 사용. 브랜드·VI 등 **그 외 PDF는 참조하지 않음**.
- 한국어 마크다운. **군더더기 설명·반복 주석·메타 코멘트**는 쓰지 말 것.
`.trim();
}

/** 통합 분석(검수): 진단 + Do/Don't + 교정안 */
function unifiedAuditInstruction(): string {
  return `
한 번의 응답에 아래 **세 구역**만 넣으세요. (Pain·Empathy 등 **별도 대제목** 금지)

[정확한 ## 대제목 — 이 세 줄만]
## 요청내용 분석 (문제 진단)
## Do & Don't
## Simply U+ 솔루션

---

## 요청내용 분석 (문제 진단)
[구조] \`### 예상 타겟\` → \`### 목적\` → \`### 문제 진단\` 순서 고정.
[사용자 입력 반영 — 필수] **[카테고리 선택]·[확인 분야]·[검수 내용]**을 아래 세 구역과 솔루션에 **모두** 반영하세요.
- ### 예상 타겟: [확인 분야]·[검수 내용]·[카테고리 선택] 맥락에서 도출. 카테고리는 조직·채널 관점을 반영.
- ### 목적: [확인 분야]와 [검수 내용]에서 드러나는 목적을 정리.
- ### 문제 진단: [검수 내용] 중심으로 진단. [카테고리 선택]에 맞는 가이드 관점 적용.
[예상 타겟·목적] 각각 **서술 문단**(1~3문장). 이 두 구역에 **번호(1. 2.)·불릿(-)** 금지.
[문제 진단] **이 헤딩 아래만** 번호 목록. 각 줄 \`1. 소제목: 진단 내용\` (2~4줄).

### 예상 타겟

### 목적

### 문제 진단

## Do & Don't
[사용자 입력 반영] [카테고리 선택]·[검수 내용] 맥락에 맞는 Do/Don't를 제시.
### Do
- 가이드 근거 실행 항목만. 각 항목 \`한 줄\` 또는 \`소제목: 한두 문장\`.

### Don't
- 지양 사항만. 각 항목 한두 줄.

## Simply U+ 솔루션
- **대안·세부 비교·장문 분석 금지.** 오직 **하나의 교정안**만 제시합니다.
- [카테고리 선택]·[확인 분야]·[검수 내용]을 모두 반영한 교정안.

### Simply U+ 솔루션
- **고객이 바로 쓸 수 있는 문장/안** 1세트(필요 시 따옴표로 예시 1개).
- 보완 포인트가 있으면 불릿 2~4개 이내로만. (별도 '솔루션 2·3' 등 금지)
`.trim();
}

/** 통합 생성: 솔루션 + 반영 항목만 (진단·Do/Don't 없음) */
function unifiedGenerateInstruction(): string {
  return `
사용자는 **새 메시지 생성**을 요청했습니다. **문제 진단·Do & Don't 구역은 출력하지 마세요.**

[정확한 ## 대제목 — 이 한 줄만]
## Simply U+ 솔루션

---

## Simply U+ 솔루션

### Simply U+ 솔루션
[출력 규칙 — 엄격]
- **고객 대면용 완성 문구(모범 답안)만** 출력하세요. 분석·진단·반영 설명은 **절대 넣지 마세요**.
- 불릿(-)·「~를 반영하여」「~관점에서」「입력하신」 등 **메타 코멘트·작성 근거 문장 금지**.
- [카테고리 선택]·[타겟]·[목적]·[생성 개요]는 **완성 문구 안에 자연스럽게 녹이되**, 항목별 설명은 하지 마세요.
- **바로 복사·붙여넣기** 가능한 1세트(제목+본문, 또는 \`>\` 인용 블록 1개).

### 반영 항목 상세
- **분석·반영 설명은 이 구역에만** 작성하세요. \`- [태그]: 설명\` 형식 **3~6개**.
- **[카테고리 선택]·[타겟]·[목적]·[생성 개요]** 각각이 모범 답안에 어떻게 반영됐는지 **항목마다 1문장**.
- (미입력) 항목은 생략.
- 예: \`- [카테고리 반영]: …\`, \`- [타겟 반영]: …\`, \`- [목적 반영]: …\`, \`- [생성 개요 반영]: …\`
`.trim();
}

function unifiedInstruction(mode: "audit" | "generate"): string {
  return mode === "generate" ? unifiedGenerateInstruction() : unifiedAuditInstruction();
}

function stepInstruction(step: 1 | 2 | 3 | 4): string {
  if (step === 1) {
    return `
당신은 LG U+ **Simply Heart** 워크플로의 **1단계: 요청 내용 분석 (Diagnosis)** 담당입니다.

## 형식 (마크다운)
[구조] \`### 예상 타겟\` → \`### 목적\` → \`### 문제 진단\` 순서 고정.
[예상 타겟·목적] 각각 서술만(1~3문장). 번호·불릿 금지.
[문제 진단] 이 헤딩 아래만 \`1. 소제목: 진단 내용\` 형식, 2~4줄. 공부·선택 부담·인지부하 등 구체적으로.

### 예상 타겟

### 목적

### 문제 진단
`.trim();
  }
  if (step === 2) {
    return `
당신은 **2단계: Simply Pain Point (Empathy)** 담당입니다. 공급자 시각에서 놓치기 쉬운 고객 불편을 짚습니다.

출력에 반드시 포함:
1. 고객이 느낄 수 있는 **인지 부하**·**결정 피로**
2. 복잡한 옵션 나열·전문용어 남발 등으로 **결정 장애**를 유발하는지

## 형식 (마크다운) — **공감 포인트** 구역 안에서만 목록 번호 1부터
### 공감 포인트 (Pain)
- 각 포인트는 **한 덩어리**로 두세요: \`소제목: 본문\` 또는 \`**소제목**\` 다음 줄 상세.
- 상세가 길면 **같은 불릿/같은 번호 항목 안**에서만 줄바꿈으로 이어 쓰고, **문단마다 새 번호를 달지 마세요.**
`.trim();
  }
  if (step === 3) {
    return `
당신은 **3단계: Do & Don't (Guideline)** 담당입니다.

출력에 반드시 포함:
1. [참고 가이드라인]에 근거한 **Do** 목록 (실천 가능한 문장)
2. **Don't** 목록 (지양 사항, 반드시 Simply U+ 가이드라인 근거와 연결해 설명)
3. 전문용어·혜택 직관성·「보이지 않는 기술로 처리 가능한 영역」인지 여부에 대한 평가

## 형식 (마크다운)
### Do
### Don't
### 가이드 정합성 메모

### Do / Don't 작성 규칙 (화면에서 소제목·본문으로 구분됩니다)
- **Do**와 **Don't**의 **각 항목**마다 **소제목**과 **본문**을 분명히 나누어 씁니다.
- **형식 A (권장):** \`소제목: 본문\` — 콜론(\`:\` 또는 \`：\`) 앞은 짧은 요약/행동 이름, 뒤는 근거·설명·예시.
- **형식 B:** 1행에 소제목만 두고, 빈 줄 없이 2행부터 본문을 여러 문장으로 이어 씁니다.
- 한 불릿(-) 항목 안에서는 A 또는 B 중 **하나만** 쓰고, 긴 문장만 이어 쓰지 마세요.
`.trim();
  }
  return `
당신은 **4단계: Simply U+ 솔루션 (Delivery)** 담당입니다.

출력에 반드시 포함:
1. **정제된 메시지** 제안 (1~2안)
2. **심플해진 네이밍/표현** 제안 (해당 시)
3. **간소화된 프로세스** 제안 (단계를 줄인 고객 여정)
4. **고객이 해야 할 단 하나의 행동 (One Action)** — 명확한 CTA 한 줄

## 형식 (마크다운) — 계층을 지켜 주세요 (UI에서 구역별로 구분됩니다)
### 솔루션 메시지
- 소제목이 필요하면 **단독 한 줄**로 쓰고(예: 정제된 메시지 제안과 맥락), 바로 아래에 각 안을 붙입니다.
- **각 안은 반드시 이 2단계로** 씁니다.
  - **1줄:** \`[1안]\`, \`[2안]\` 으로 시작하는 **한 줄 요약**(핵심만, 따옴표 없음).
  - **2줄(필수):** 그 아래 줄에 **고객 대면 문구만** 큰따옴표(\`"\`)로 감싼 **한 문단**을 둡니다. (예: \`"고객님, …"\`)
- 안과 안 사이는 빈 한 줄로 구분합니다.

### One Action (단 하나의 행동)
`.trim();
}

function buildUserPayload(opts: {
  userText: string;
  extractedPdfText?: string;
  prior: Partial<Record<"1" | "2" | "3", string>>;
  step: 0 | 1 | 2 | 3 | 4;
  mode?: "audit" | "generate";
}): string {
  const chunks: string[] = [`[사용자 입력 — 텍스트]\n${opts.userText || "(없음)"}`];
  if (opts.extractedPdfText?.trim()) {
    chunks.push(`[사용자 첨부 PDF에서 추출한 텍스트]\n${opts.extractedPdfText.trim()}`);
  }
  if (opts.step === 0) {
    chunks.push(`\n---\n${unifiedInstruction(opts.mode ?? "audit")}`);
    return chunks.join("\n\n");
  }
  if (opts.prior["1"]) chunks.push(`[1단계 결과 요약·전문]\n${opts.prior["1"]}`);
  if (opts.prior["2"]) chunks.push(`[2단계 결과 요약·전문]\n${opts.prior["2"]}`);
  if (opts.prior["3"]) chunks.push(`[3단계 결과 요약·전문]\n${opts.prior["3"]}`);
  chunks.push(`\n---\n${stepInstruction(opts.step)}`);
  return chunks.join("\n\n");
}

export type SimplyHeartImagePart = { mimeType: string; data: string };

export async function runSimplyHeartStep(opts: {
  step: 0 | 1 | 2 | 3 | 4;
  userText: string;
  extractedPdfText?: string;
  imageParts?: SimplyHeartImagePart[];
  prior: Partial<Record<"1" | "2" | "3", string>>;
  mode?: "audit" | "generate";
}): Promise<{ text: string; model: string }> {
  const apiKeys = geminiApiKeyCandidates();
  if (apiKeys.length === 0) throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");

  const guidelineContext = (await buildGuidelineContext()).slice(0, 100_000);
  const systemInstruction = `${sharedRules()}

[참고 가이드라인 — 서버 등록 본문]
${guidelineContext}`;

  const userTextBlock = buildUserPayload(opts);
  const hasVision =
    (opts.imageParts?.length ?? 0) > 0 &&
    opts.imageParts!.some((p) => /^image\/(png|jpeg|jpg|webp)$/i.test(p.mimeType));

  let lastErr: unknown;

  const preamble =
    hasVision && opts.imageParts?.length
      ? "첨부 이미지(시안·배너 등)의 **가독성·메시지 계층·브랜드 정합성**을 텍스트와 함께 분석하세요. 이미지에서 읽은 텍스트를 인용할 때는 따옴표로 구분하세요.\n\n"
      : "";

  for (const apiKey of apiKeys) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const mid of textModelCandidates()) {
      try {
        const model = genAI.getGenerativeModel({
          model: mid,
          systemInstruction,
        });

        const parts: Array<
          { text: string; inlineData?: never } | { text?: never; inlineData: { mimeType: string; data: string } }
        > = [{ text: `${preamble}${userTextBlock}` }];
        for (const im of opts.imageParts ?? []) {
          if (!/^image\/(png|jpeg|jpg|webp)$/i.test(im.mimeType)) continue;
          const data = im.data.replace(/^data:image\/\w+;base64,/, "");
          parts.push({ inlineData: { mimeType: im.mimeType.split(";")[0], data } });
        }

        const result = await model.generateContent(parts);
        const text = result.response.text();
        if (text?.trim()) return { text: text.trim(), model: mid };
        return { text: "(빈 응답)", model: mid };
      } catch (e) {
        rethrowIfInvalidApiKey(e);
        lastErr = e;
        if (isPrepaymentCreditsDepletedError(e)) {
          console.warn("[simply-heart] prepayment credits depleted for current API key");
          break;
        }
        if (shouldTryNextTextModel(e)) {
          console.warn(`[simply-heart] model=${mid} retry`, e instanceof Error ? e.message : e);
          continue;
        }
        throw e;
      }
    }
  }
  const label = opts.step === 0 ? "통합 분석" : `단계 ${opts.step}`;
  throw new Error(`Simply Heart ${label} 실패: ${formatGeminiFailureMessage(lastErr)}`);
}
