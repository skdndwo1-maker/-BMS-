import {
  FONT_FAMILY_PRETENDARD,
} from "@/design/canvasTextTypography";

export const RCS_PRODUCTS = ["요금제", "모바일서비스", "결합", "요금할인", "로밍"] as const;
export const RCS_MESSAGE_TYPES = ["가입안내", "해지안내", "서비스 종료안내", "혜택안내"] as const;

export type RcsProduct = (typeof RCS_PRODUCTS)[number];
export type RcsMessageType = (typeof RCS_MESSAGE_TYPES)[number];
export type RcsWeight = "light" | "standard" | "semi-bold" | "bold";

/** 셀별 기본 문구 (줄바꿈 = \\n) */
export type RcsPresetCell = {
  title: string;
};

/** 템플릿에 저장되는 RCS 문구·타이포 설정 */
export type RcsPresetsConfig = {
  defaults?: {
    titleSize?: number;
    titleWeight?: RcsWeight;
    titleFont?: string;
    titleLineHeight?: number;
  };
  /** 비어 있으면 코드 기본 문구 사용. 키가 있으면 해당 셀만 덮어씀 */
  cells?: Partial<Record<RcsProduct, Partial<Record<RcsMessageType, RcsPresetCell>>>>;
};

export const DEFAULT_RCS_TITLE_MATRIX: Record<RcsProduct, Record<RcsMessageType, string>> = {
  요금제: {
    가입안내: "요금제 가입 환영해요",
    해지안내: "아쉽지만 또 만나요",
    "서비스 종료안내": "요금제 이용이 곧 종료됩니다",
    혜택안내: "함께하면 더 특별한 요금제 혜택",
  },
  모바일서비스: {
    가입안내: "모바일 서비스 가입을 환영해요",
    해지안내: "다음에 또 만나요",
    "서비스 종료안내": "모바일 서비스 이용이 곧 종료됩니다",
    혜택안내: "유플러스 사전예약 혜택 5.14(화)~5.20(화)",
  },
  결합: {
    가입안내: "이제 함께 할인받을 수 있어요",
    해지안내: "아쉽지만 또 만나요",
    "서비스 종료안내": "결합 이용이 곧 종료됩니다",
    혜택안내: "가족과 함께하면 네이버페이 100% 증정!",
  },
  요금할인: {
    가입안내: "요금부담을 덜었어요",
    해지안내: "아쉽지만 또 만나요",
    "서비스 종료안내": "요금할인 이용이 곧 종료됩니다",
    혜택안내: "쓰던 폰 그대로, 가족 모두 할인",
  },
  로밍: {
    가입안내: "로밍 가입을 환영해요",
    해지안내: "안전한 귀국길 되셨나요?",
    "서비스 종료안내": "로밍 이용이 곧 종료됩니다",
    혜택안내: "밝은 여행길을 위해, 데이터 2배 증정 혜택",
  },
};

export const DEFAULT_RCS_TYPO = {
  titleSize: 130,
  titleWeight: "semi-bold" as RcsWeight,
  titleFont: FONT_FAMILY_PRETENDARD,
  titleLineHeight: 1.15,
};

export function resolveRcsTitle(
  config: RcsPresetsConfig | null | undefined,
  product: RcsProduct,
  message: RcsMessageType
): string {
  const override = config?.cells?.[product]?.[message]?.title;
  if (typeof override === "string" && override.length > 0) return override;
  return DEFAULT_RCS_TITLE_MATRIX[product][message];
}

export function resolveRcsTypo(config: RcsPresetsConfig | null | undefined) {
  const d = config?.defaults ?? {};
  return {
    titleSize: typeof d.titleSize === "number" ? d.titleSize : DEFAULT_RCS_TYPO.titleSize,
    titleWeight: (d.titleWeight ?? DEFAULT_RCS_TYPO.titleWeight) as RcsWeight,
    titleFont: d.titleFont?.trim() || DEFAULT_RCS_TYPO.titleFont,
    titleLineHeight:
      typeof d.titleLineHeight === "number" ? d.titleLineHeight : DEFAULT_RCS_TYPO.titleLineHeight,
  };
}

/** Admin 편집용: 모든 셀을 채운 평면 맵 */
export function expandRcsCellsForEdit(
  config: RcsPresetsConfig | null | undefined
): Record<RcsProduct, Record<RcsMessageType, string>> {
  const out = {} as Record<RcsProduct, Record<RcsMessageType, string>>;
  for (const p of RCS_PRODUCTS) {
    out[p] = {} as Record<RcsMessageType, string>;
    for (const m of RCS_MESSAGE_TYPES) {
      out[p][m] = resolveRcsTitle(config, p, m);
    }
  }
  return out;
}

export function buildRcsPresetsConfig(
  cells: Record<RcsProduct, Record<RcsMessageType, string>>,
  defaults: RcsPresetsConfig["defaults"]
): RcsPresetsConfig {
  const nextCells: RcsPresetsConfig["cells"] = {};
  for (const p of RCS_PRODUCTS) {
    const row: Partial<Record<RcsMessageType, RcsPresetCell>> = {};
    for (const m of RCS_MESSAGE_TYPES) {
      const title = (cells[p]?.[m] ?? "").replace(/\r\n/g, "\n");
      const builtin = DEFAULT_RCS_TITLE_MATRIX[p][m];
      if (title !== builtin) row[m] = { title };
    }
    if (Object.keys(row).length) nextCells[p] = row;
  }
  const d = defaults ?? {};
  const cleanedDefaults: RcsPresetsConfig["defaults"] = {};
  if (typeof d.titleSize === "number" && d.titleSize !== DEFAULT_RCS_TYPO.titleSize) {
    cleanedDefaults.titleSize = d.titleSize;
  }
  if (d.titleWeight && d.titleWeight !== DEFAULT_RCS_TYPO.titleWeight) {
    cleanedDefaults.titleWeight = d.titleWeight;
  }
  if (d.titleFont?.trim() && d.titleFont.trim() !== DEFAULT_RCS_TYPO.titleFont) {
    cleanedDefaults.titleFont = d.titleFont.trim();
  }
  if (typeof d.titleLineHeight === "number" && d.titleLineHeight !== DEFAULT_RCS_TYPO.titleLineHeight) {
    cleanedDefaults.titleLineHeight = d.titleLineHeight;
  }
  return {
    defaults: Object.keys(cleanedDefaults).length ? cleanedDefaults : undefined,
    cells: Object.keys(nextCells).length ? nextCells : undefined,
  };
}
