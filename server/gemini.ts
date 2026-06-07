/**
 * Gemini 통합 진입점 (배럴 re-export).
 *
 * 기능별 구현은 `./gemini/` 하위 모듈에 정의되어 있습니다.
 *   - `gemini/shared.ts`      — API 키·모델 후보·재시도 정책·PDF 추출 등 공통 유틸
 *   - `gemini/guideline.ts`   — VI/브랜드 가이드 PDF·이미지 요약·발췌
 *   - `gemini/inspection.ts`  — 브랜드 검수 + 수정 이미지 생성·후속 채팅
 *   - `gemini/designEditor.ts`— 디자인 에디터 캔버스 검수·문안 제안·시각 교정
 *   - `gemini/optionsChat.ts` — 옵션 페이지 멀티턴 채팅 (브랜드·VI 듀얼 컨텍스트)
 *   - `gemini/naming.ts`      — 브랜드 네이밍 생성·검수 (단계별·일반)
 *
 * 기존 호출부는 `from "./gemini.js"`를 그대로 유지할 수 있도록 동일 export를 재공개합니다.
 */

export { hasGeminiApiKey } from "./gemini/shared.js";
export {
  excerptGuidelineForInspection,
  summarizeGuidelineFile,
} from "./gemini/guideline.js";
export {
  runInspectionWithGemini,
  generateRevisedBrandingImage,
  additionalRevisionImagePipeline,
  generateRevisedBrandingImageFollowup,
  answerInspectionAgentChat,
} from "./gemini/inspection.js";
export {
  runDesignEditorCanvasInspection,
  generateDesignEditorReplacementImage,
  runDesignEditorTextSuggestion,
  runDesignEditorCanvasVisualCorrection,
  runDesignEditorAssetGeneration,
  runDesignEditorImageGeneration,
  type DesignEditorViolationRow,
  type DesignEditorTextSuggestionTarget,
  type DesignEditorAssetKind,
  type DesignEditorIllustrationStyle,
} from "./gemini/designEditor.js";
export { runOptionsPageChat } from "./gemini/optionsChat.js";
export {
  runBrandNamingWithGemini,
  type BrandNamingGeminiResult,
  type BrandNamingProposalGemini,
  type ProposalDetailLogicGemini,
  type TierPackageEvaluationGemini,
  type TierNamingAlternativeGemini,
} from "./gemini/naming.js";
