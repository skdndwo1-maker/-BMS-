import {
  GEMINI_IMAGE_MODEL_FALLBACKS,
  textModelCandidates,
} from "../gemini/shared.js";

export type LlmTier = "light" | "heavy" | "image";

export type LlmTask =
  | "inspection_classify"
  | "inspection_judge"
  | "inspection_plan_revision"
  | "inspection_chat"
  | "naming"
  | "design_editor_inspect"
  | "suggest_text"
  | "propose_draft"
  | "asset_prompt"
  | "options_chat"
  | "simply_heart"
  | "guideline_summarize"
  | "revise_image"
  | "revise_image_followup"
  | "generate_asset"
  | "develop_image";

/** 작업 → 등급. 초기에는 텍스트=heavy, 이미지=image, classify만 light (기본 모델 결과 동일). */
export const TASK_TIER: Record<LlmTask, LlmTier> = {
  inspection_classify: "light",
  inspection_judge: "heavy",
  inspection_plan_revision: "heavy",
  inspection_chat: "heavy",
  naming: "heavy",
  design_editor_inspect: "heavy",
  suggest_text: "heavy",
  propose_draft: "heavy",
  asset_prompt: "heavy",
  options_chat: "heavy",
  simply_heart: "heavy",
  guideline_summarize: "heavy",
  revise_image: "image",
  revise_image_followup: "image",
  generate_asset: "image",
  develop_image: "image",
};

export function getTier(task: LlmTask): LlmTier {
  return TASK_TIER[task];
}

/** 기본 off. `on`일 때만 판별 단계 실행. */
export function isInspectionClassifyEnabled(): boolean {
  return process.env.INSPECTION_CLASSIFY?.trim().toLowerCase() === "on";
}

function defaultTextPrimary(): string {
  return textModelCandidates()[0] ?? "gemini-3.1-pro-preview";
}

function defaultImagePrimary(): string {
  const fromEnv = process.env.GEMINI_IMAGE_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return GEMINI_IMAGE_MODEL_FALLBACKS[0];
}

/** 작업에 해당하는 1차 모델 (등급별 env → 기존 기본값). */
export function getModel(task: LlmTask): string {
  const tier = getTier(task);
  if (tier === "light") {
    return process.env.LLM_MODEL_LIGHT?.trim() || defaultTextPrimary();
  }
  if (tier === "heavy") {
    return process.env.LLM_MODEL_HEAVY?.trim() || defaultTextPrimary();
  }
  return process.env.LLM_MODEL_IMAGE?.trim() || defaultImagePrimary();
}

/** getModel 1차 + 기존 텍스트/이미지 폴백 체인 (중복 제거). */
export function modelCandidates(task: LlmTask): string[] {
  const primary = getModel(task);
  const tier = getTier(task);
  if (tier === "image") {
    return [...new Set([primary, ...GEMINI_IMAGE_MODEL_FALLBACKS])];
  }
  return [...new Set([primary, ...textModelCandidates()])];
}

export type LlmUsageMeta = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
};

export function logLlmCall(opts: {
  task: LlmTask;
  model: string;
  startedAt: number;
  usage?: LlmUsageMeta | null;
}): void {
  const tier = getTier(opts.task);
  const inn = opts.usage?.promptTokenCount;
  const out = opts.usage?.candidatesTokenCount;
  console.log(
    `[llm][${opts.task}] tier=${tier} model=${opts.model} ms=${Date.now() - opts.startedAt} in=${inn ?? "?"} out=${out ?? "?"}`
  );
}
