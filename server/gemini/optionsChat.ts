import { GoogleGenerativeAI } from "@google/generative-ai";

import { loadMeta } from "../store.js";
import { isSupabaseRagEnabled, matchRagChunks } from "../rag.js";
import { embedTextWithGemini } from "../geminiEmbeddings.js";
import {
  getKey,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";
import { excerptGuidelineForInspection } from "./guideline.js";

/** 옵션 하단 채팅: 브랜드·VI 두 축을 항상 별도 블록으로 주입 (단일 자료 편향 방지) */
const OPTIONS_PAGE_CORE_GUIDELINE_IDS: readonly { id: string; title: string }[] = [
  { id: "uplus-brand-guideline", title: "브랜드 가이드라인" },
  { id: "uplus-vi-guideline", title: "VI 가이드라인" },
];

async function buildOptionsChatReferenceCorpus(userQuery: string): Promise<string> {
  const meta = loadMeta();
  const parts: string[] = [];
  const perCoreCap = 42_000;

  for (const { id, title } of OPTIONS_PAGE_CORE_GUIDELINE_IDS) {
    const g = meta.guidelines[id];
    let block: string;
    if (!g) {
      block =
        "(이 슬롯에 등록된 PDF가 없습니다. 고정 자료를 쓰려면 서버에서 해당 id로 sync-fixed를 실행하거나 관리 화면에서 업로드하세요. 답변 시 이 축은 비어 있음을 인지하고, 등록된 다른 자료·일반 원칙으로 보완하세요.)";
    } else {
      try {
        let body: string;
        if (g.aiSummary?.trim()) {
          body = g.aiSummary.trim();
        } else {
          body = (await excerptGuidelineForInspection(g)).trim();
        }
        if (body.length > perCoreCap) {
          body = `${body.slice(0, perCoreCap)}\n…(이하 생략 — 전문은 서버 등록 PDF 기준)`;
        }
        block = body;
      } catch {
        block = "(본문을 불러오지 못했습니다.)";
      }
    }
    parts.push(`[참고 자료 · ${title} — 슬롯 id: ${id}]\n${block}`);
  }

  const q = userQuery.trim();
  if (q && getKey() && isSupabaseRagEnabled()) {
    try {
      const qEmb = await embedTextWithGemini(q.slice(0, 12_000));
      for (const { id, title } of OPTIONS_PAGE_CORE_GUIDELINE_IDS) {
        if (!meta.guidelines[id]) continue;
        const matches = await matchRagChunks({
          queryEmbedding: qEmb,
          guidelineId: id,
          sourceType: "guideline",
          topK: 6,
        });
        if (matches.length === 0) continue;
        const ragBody = matches
          .map((m, idx) => `(${idx + 1}) similarity=${Number(m.similarity).toFixed(4)}\n${m.content.trim()}`)
          .join("\n\n---\n\n");
        let ragBlock = `[질문 관련 추가 발췌 — RAG · ${title}]\n${ragBody}`;
        const ragCap = 14_000;
        if (ragBlock.length > ragCap) ragBlock = `${ragBlock.slice(0, ragCap)}\n…`;
        parts.push(ragBlock);
      }
    } catch (e) {
      console.warn("[gemini] options chat RAG:", e instanceof Error ? e.message : e);
    }
  }

  const coreIds = new Set(OPTIONS_PAGE_CORE_GUIDELINE_IDS.map((x) => x.id));
  let budget = 28_000;
  for (const g of Object.values(meta.guidelines)) {
    if (coreIds.has(g.id)) continue;
    if (budget <= 0) break;
    let block: string;
    if (g.aiSummary?.trim()) {
      block = `[${g.displayName} — 요약]\n${g.aiSummary.trim()}`;
    } else {
      block = `[${g.displayName} — 발췌]\n${(await excerptGuidelineForInspection(g)).trim()}`;
    }
    if (block.length > budget) block = `${block.slice(0, budget)}\n…(생략)`;
    parts.push(block);
    budget -= block.length;
  }

  if (parts.length === 0) {
    return "(등록된 가이드라인이 없습니다. 일반 지식으로 답하되 브랜드 전용 판단은 한계가 있음을 안내하세요.)";
  }
  return parts.join("\n\n==========\n\n");
}

/**
 * 옵션 페이지 멀티턴 채팅. `messages`의 마지막은 반드시 user.
 * 브랜드·VI 가이드라인 전역 맥락 + (가능 시) 질의 기반 RAG + Gemini로 통합 답변.
 */
export async function runOptionsPageChat(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const key = getKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const trimmed = opts.messages
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0);
  if (trimmed.length === 0) {
    throw new Error("메시지가 비어 있습니다.");
  }
  const last = trimmed[trimmed.length - 1];
  if (last.role !== "user") {
    throw new Error("마지막 메시지는 사용자 질문이어야 합니다.");
  }

  const guidelineContext = (await buildOptionsChatReferenceCorpus(last.content)).slice(0, 120_000);

  const systemInstruction = `당신은 LG U+ 브랜드·VI·디자인 업무를 돕는 AI 어시스턴트입니다.

[응답 언어]
- 기본 응답 언어는 한국어입니다.

[추론 원칙 — 다원 참조]
- 답변을 작성할 때 **아래를 균형 있게 함께 고려**하세요. **브랜드 가이드만**, **VI만**, 또는 **모델 일반 지식만**으로 단정하지 마세요.
  (1) Google Gemini를 통한 합리적 설명·추론
  (2) **[참고 자료 · 브랜드 가이드라인]** 및 (있을 경우) **[질문 관련 추가 발췌 — RAG · 브랜드 가이드라인]**
  (3) **[참고 자료 · VI 가이드라인]** 및 (있을 경우) **[질문 관련 추가 발췌 — RAG · VI 가이드라인]**
- 브랜드 정체성·톤·내러티브와 VI·로고·시각 규정은 서로 다른 레이어입니다. 질문 유형에 맞게 **둘을 구분해** 인용하고 필요하면 **통합**하세요.
- 어떤 슬롯이 비어 있거나 «미등록» 안내가 있으면 그 사실을 한 문장으로 알리고, 등록된 자료와 일반 원칙으로 보완하세요.
- 두 가이드가 어긋나 보이면 양쪽 근거를 짧게 짚은 뒤 실무적으로 정리하세요.
- 참고 자료에 없는 내용은 추측임을 분명히 하세요.

[참고 자료 본문]
${guidelineContext}`;

  const history = trimmed.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }]
  }));

  const lastUserText = last.content;
  const genAI = new GoogleGenerativeAI(key);
  let lastErr: unknown;

  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: mid,
        systemInstruction
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastUserText);
      const text = result.response.text();
      if (text?.trim()) return text;
      return "(빈 응답이 반환되었습니다. 다시 시도해 주세요.)";
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] options chat model=${mid} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
      throw e;
    }
  }
  return `답변 생성에 실패했습니다: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`;
}
