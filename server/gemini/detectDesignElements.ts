import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

import {
  getKey,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";

/** design_guideline_reference.applies_to 매핑용 구성 요소 판별 결과 */
export type DesignElementDetection = {
  hasText: boolean;
  hasLayout: boolean;
  hasColor: boolean;
  hasIcon2D: boolean;
  hasIcon3D: boolean;
  hasPictogram: boolean;
  hasImagePeople: boolean;
  hasImageBackground: boolean;
  hasLogo: boolean;
  badgeType: "circle" | "tube" | "roundbox" | null;
};

const designElementDetectionSchema = {
  type: SchemaType.OBJECT,
  description: "디자인 이미지 내 구성 요소 존재 여부",
  properties: {
    hasText: {
      type: SchemaType.BOOLEAN,
      description: "읽을 수 있는 텍스트(타이틀·본문·캡션·유의사항 등)가 보이면 true",
    },
    hasLayout: {
      type: SchemaType.BOOLEAN,
      description: "전체 구도·그리드·블록 배치·여백 구조 등 레이아웃 검토 대상이 있으면 true",
    },
    hasColor: {
      type: SchemaType.BOOLEAN,
      description: "브랜드 컬러(마젠타·지정 팔레트 등) 규정 검토가 필요한 색 사용이 있으면 true",
    },
    hasIcon2D: {
      type: SchemaType.BOOLEAN,
      description: "플랫/2D UI 아이콘·심볼(단순 선·면)이 있으면 true",
    },
    hasIcon3D: {
      type: SchemaType.BOOLEAN,
      description: "3D·클레이·입체감 있는 아이콘/오브젝트가 있으면 true",
    },
    hasPictogram: {
      type: SchemaType.BOOLEAN,
      description: "픽토그램·단순 안내 심볼(경고·정보 등)이 있으면 true",
    },
    hasImagePeople: {
      type: SchemaType.BOOLEAN,
      description: "인물이 등장하는 실사·사진 이미지가 있으면 true",
    },
    hasImageBackground: {
      type: SchemaType.BOOLEAN,
      description: "인물 없이 배경·풍경·추상·텍스처 등 히어로/배경 이미지가 있으면 true",
    },
    hasLogo: {
      type: SchemaType.BOOLEAN,
      description: "CI/BI/U+ 로고·슬로건 로고 등 브랜드 로고 마크가 있으면 true",
    },
    badgeType: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["circle", "tube", "roundbox", "none"] as string[],
      description:
        "뱃지/라벨 형태: circle(원형), tube(튜브형), roundbox(라운드 박스). 뱃지가 없으면 none",
    },
  },
  required: [
    "hasText",
    "hasLayout",
    "hasColor",
    "hasIcon2D",
    "hasIcon3D",
    "hasPictogram",
    "hasImagePeople",
    "hasImageBackground",
    "hasLogo",
    "badgeType",
  ],
} as Schema;

function asBool(v: unknown): boolean {
  return v === true;
}

function parseBadgeType(raw: unknown): DesignElementDetection["badgeType"] {
  const s = String(raw ?? "none").toLowerCase();
  if (s === "circle" || s === "tube" || s === "roundbox") return s;
  return null;
}

function normalizeDetection(raw: unknown): DesignElementDetection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    hasText: asBool(o.hasText),
    hasLayout: asBool(o.hasLayout),
    hasColor: asBool(o.hasColor),
    hasIcon2D: asBool(o.hasIcon2D),
    hasIcon3D: asBool(o.hasIcon3D),
    hasPictogram: asBool(o.hasPictogram),
    hasImagePeople: asBool(o.hasImagePeople),
    hasImageBackground: asBool(o.hasImageBackground),
    hasLogo: asBool(o.hasLogo),
    badgeType: parseBadgeType(o.badgeType),
  };
}

function parseDetectionPayload(raw: string): DesignElementDetection | null {
  try {
    return normalizeDetection(JSON.parse(raw));
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return normalizeDetection(JSON.parse(jsonMatch[0]));
    } catch {
      return null;
    }
  }
}

const DETECTION_PROMPT = `역할: LG U+ 브랜드 디자인 QA의 **구성 요소 분류** 전문가입니다.

작업: 첨부 디자인 이미지(포스터·배너·캔버스 캡처 등)만 보고, 아래 항목이 **실제로 포함·시각적으로 인식 가능한지** 판별하세요.
검수·점수·수정 제안은 하지 말고, 존재 여부만 boolean으로 판단합니다.

판별 기준 요약:
- hasText: 타이틀·부제·본문·유의사항·버튼 문구 등 텍스트
- hasLayout: 명확한 블록 배치·그리드·정렬·여백 구조
- hasColor: 브랜드 컬러 검토가 의미 있는 색면/포인트 컬러
- hasIcon2D / hasIcon3D / hasPictogram: 각각 2D 아이콘, 3D/입체 아이콘, 픽토그램
- hasImagePeople: 사람이 보이는 사진
- hasImageBackground: 인물 없는 배경·히어로·텍스처 이미지
- hasLogo: U+/LG U+ 등 브랜드 로고
- badgeType: 뱃지가 있으면 circle|tube|roundbox 중 가장 가까운 형태, 없으면 none

JSON 스키마 필드만 채워 출력하세요.`;

/**
 * 디자인 이미지 업로드·생성 중간 점검 등에서 공통으로 사용하는 구성 요소 판별.
 * (호출부 연동은 별도 — inspection / design-editor 경로에서 이후 사용)
 */
export async function detectDesignElements(opts: {
  designBase64: string;
  designMime: string;
}): Promise<DesignElementDetection | null> {
  const key = getKey();
  if (!key) return null;

  const mime = opts.designMime.split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("image/")) return null;

  const b64 = opts.designBase64.replace(/^data:image\/\w+;base64,/, "").trim();
  if (!b64) return null;

  const genAI = new GoogleGenerativeAI(key);
  let lastErr: unknown;

  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: designElementDetectionSchema,
      },
    });
    try {
      const result = await model.generateContent([
        DETECTION_PROMPT,
        { inlineData: { mimeType: mime, data: b64 } },
      ]);
      const parsed = parseDetectionPayload(result.response.text());
      if (parsed) return parsed;
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] detectDesignElements model=${modelId} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
      throw e;
    }
  }

  console.warn("[gemini] detectDesignElements failed", lastErr);
  return null;
}
