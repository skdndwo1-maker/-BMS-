// Core types for the design automation platform

export type TemplateCategory =
  | 'marketing-banner'
  | 'poster'
  | 'social-media'
  | 'internal-notice'
  | 'safety-caution'
  | 'presentation'
  | 'placard'
  | 'xbanner'
  | 'rcs';

export type DesignStyle = 'basic' | 'informational' | 'no-limit';

export type LogoPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

// ── 포스터 카테고리 ──────────────────────────────────────────────────
export type PosterCategory =
  | 'basic'
  | 'notice'
  | 'new-product'
  | 'promotion'
  | 'plan-benefit'
  | 'safety-caution';

/** 포스터 캔버스 텍스트 정렬 (양쪽 맞춤 포함) */
export type CanvasTextAlign = 'left' | 'center' | 'right' | 'justify';

/** 캔버스 텍스트 대·소문자 표시 (CSS text-transform) */
export type PosterTextCase = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

/** 요소별 타이포 오버라이드 (캔버스 툴바) */
export interface PosterElementTypography {
  fontFamily?: string;
  /** 자간 (em) */
  letterSpacingEm?: number;
  /** 배수 행간 */
  lineHeight?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textTransform?: PosterTextCase;
}

// ── 에셋 타입 ────────────────────────────────────────────────────────
export type AssetType = 'pictogram' | 'illustration' | 'image' | 'sticker';

// ── 드래그 가능한 에셋 레이어 ────────────────────────────────────────
// 캔버스 위에 자유롭게 배치되는 각 에셋의 상태
export interface AssetLayer {
  id: string;                  // 고유 식별자
  type: AssetType;             // 에셋 종류
  src: string;                 // 이미지 URL (로컬 blob 또는 서버 URL)
  name?: string;               // 에셋 이름 (라이브러리 연동 시 사용)
  libraryId?: string;          // 브랜드 라이브러리 ID (서버 연동 시 사용)

  // ── 캔버스 위 위치/크기 (캔버스 크기 대비 %, 0~1) ──────────────
  // % 기반으로 저장하면 캔버스 크기가 바뀌어도 비율 유지
  x: number;       // 좌측 기준 (0~1)
  y: number;       // 상단 기준 (0~1)
  width: number;   // 너비 (0~1)
  height: number;  // 높이 (0~1)

  // ── 상태 ──────────────────────────────────────────────────────
  visible: boolean;
  locked: boolean;
  opacity: number;   // 0~1
  rotation: number;  // 도(degree)
}

export interface CanvasSize {
  width: number;
  height: number;
  unit: 'px' | 'mm' | 'in';
  name: string;
}

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  size: CanvasSize;
  thumbnail: string;
  description: string;
  mediaType: 'online' | 'offline';
  customizable?: boolean;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
  text: string;
  background: string;
}

export interface BrandFonts {
  heading: string;
  subheading: string;
  body: string;
}

export interface DesignContent {
  title: string;
  subtitle: string;
  bodyText: string;
  image?: File | string;
  logo?: File | string;
  style: DesignStyle;

  // ── 포스터 카테고리 ────────────────────────────────────────────
  posterCategory?: PosterCategory;

  // ── 드래그 가능한 에셋 레이어 목록 ────────────────────────────
  // 픽토그램, 일러스트, 스티커 등 모두 여기서 관리
  // 나중에 브랜드 라이브러리 연동 시 libraryId 필드 활용
  assetLayers?: AssetLayer[];

  // ── Brand Asset 공통 필수 옵션 ─────────────────────────────────
  ciImage?: File | string;
  biImage?: File | string;
  sloganImage?: File | string;
  partnerLogo?: File | string;
  logoPosition?: LogoPosition;

  // ── Placard 전용 필드 ──────────────────────────────────────────
  emphasizedTitle?: string;
  /** 현수막 좌하단 "장소 및 날짜" (예: 2026.00.00 ㅣ 엘지유플러스 상암사옥 1층) */
  placardEventInfo?: string;
  date?: string;
  venue?: string;
  rightPanelBg?: 'white' | 'light-grey' | 'ivory' | 'light-pink';
  logoOption?: 'CI' | 'BI' | 'SLOGAN' | null;
  /** 직접 업로드한 로고의 캔버스 영역(0~1). 프리셋 로고만 쓸 때는 미사용 */
  customUploadedLogoRect?: { x: number; y: number; width: number; height: number };

  // ── 배경 및 텍스트 색상 옵션 ───────────────────────────────────
  backgroundColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  bodyColor?: string;

  // ── 텍스트 상세 옵션 ───────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleAlign?: 'left' | 'center' | 'right';
  titleStyle?: 'normal' | 'italic';
  subtitleFont?: string;
  subtitleSize?: number;
  subtitleAlign?: 'left' | 'center' | 'right';
  subtitleStyle?: 'normal' | 'italic';
  bodyFont?: string;
  bodySize?: number;
  bodyAlign?: 'left' | 'center' | 'right';
  bodyStyle?: 'normal' | 'italic';

  /** 포스터 캔버스(DesignCanvas): 메인 타이틀·본문·하단 유의사항·부제 폰트 크기 배율 % (기본 100 = 현재 비례 크기) */
  posterTitleFontScale?: number;
  posterBodyFontScale?: number;
  posterFooterFontScale?: number;
  /** 본문 블록별 크기 배율 % (미지정 시 posterBodyFontScale → 100) */
  posterBodyFontScales?: Record<string, number>;
  /** 부제 블록 공통 크기 배율 (레거시) — 미지정 시 posterSubtitleFontScales → 100 */
  posterSubtitleFontScale?: number;
  /** 부제 블록별 크기 배율 % */
  posterSubtitleFontScales?: Record<string, number>;
  /** 부제 블록별 글자색 */
  posterSubtitleColors?: Record<string, string>;

  /** 포스터: 배경 이미지 / 뱃지 영역 — 캔버스 대비 정규화 좌표 (0~1), 중앙 캔버스에서 드래그·리사이즈 */
  posterBackgroundImageRect?: { x: number; y: number; width: number; height: number };
  /** 이미지 배치: 라운드 박스형(기본) | 배경 전체형 */
  posterImagePlacementMode?: "round-box" | "full-background";
  /** 라운드 박스형 rect — 배경 전체형 전환 시 복원용 */
  posterRoundBoxImageRect?: { x: number; y: number; width: number; height: number };
  /** 포스터: 이미지 투명도(0~100). 기본 100 */
  posterImageOpacity?: number;
  /** 포스터: 이미지 밝기(0~200, CSS brightness %). 기본 100 */
  posterImageBrightness?: number;
  /** 포스터: 이미지 대비(0~200, CSS contrast %). 기본 100 */
  posterImageContrast?: number;
  /** 포스터: 이미지 채도(0~200, CSS saturate %). 기본 100 */
  posterImageSaturation?: number;
  /** 포스터: 이미지 내부 위치(0~100). 기본 50/50 */
  posterImagePosX?: number;
  posterImagePosY?: number;
  /** 포스터: 이미지 박스 이동·리사이즈 잠금 */
  posterImageLocked?: boolean;
  posterBadgeRect?: { x: number; y: number; width: number; height: number };
  /** 뱃지 배경: 마젠타(기본) 또는 블랙 */
  posterBadgeColor?: "magenta" | "black";
  /** 뱃지(최대 3): 텍스트 + 색상 + rect */
  posterBadges?: Array<{ id: string; text: string; color?: "magenta" | "black" }>;
  posterBadgeRects?: Record<string, { x: number; y: number; width: number; height: number }>;

  /** X배너: 현수막처럼 배경 라운드 박스(드래그/리사이즈 가능, 맨 뒤) */
  xbannerBgOnCanvas?: boolean;
  xbannerBgRect?: { x: number; y: number; width: number; height: number };

  /** 모든 템플릿: 라운드 배경 박스(드래그/리사이즈 가능, 맨 뒤) */
  panelBgOnCanvas?: boolean;
  panelBgRect?: { x: number; y: number; width: number; height: number };
  /** 라운드 배경 박스 이동·리사이즈 잠금 */
  panelBgLocked?: boolean;

  /** 포스터: 메인 타이틀/본문/유의사항 박스 — 드래그·리사이즈 */
  posterTitleRect?: { x: number; y: number; width: number; height: number };
  posterBodyRect?: { x: number; y: number; width: number; height: number };

  /** false면 해당 텍스트 영역을 캔버스에 그리지 않음(우측 패널 데이터는 유지). 미설정·true = 표시 */
  posterTitleOnCanvas?: boolean;
  posterBodyOnCanvas?: boolean;
  posterFooterOnCanvas?: boolean;
  /** 사용자가 캔버스에서 유의사항을 삭제한 경우 true — 자동 복구 제외 */
  posterFooterUserDismissed?: boolean;

  /** 부제 (메인 타이틀 외, 최대 3) — 캔버스별 rect */
  posterSubtitles?: Array<{ id: string; text: string }>;
  posterSubtitleRects?: Record<string, { x: number; y: number; width: number; height: number }>;

  /** 본문 블록 (최대 4) — 첫 블록은 bodyText와 동기화 */
  posterBodies?: Array<{ id: string; text: string }>;
  posterBodyRects?: Record<string, { x: number; y: number; width: number; height: number }>;
  /** 본문 블록별 굵게 구간 [start,end) — plain 텍스트 기준 */
  posterBodyBoldRanges?: Record<string, Array<{ start: number; end: number }>>;
  /** 본문 블록별 기울임·밑줄 구간 */
  posterBodyItalicRanges?: Record<string, Array<{ start: number; end: number }>>;
  posterBodyUnderlineRanges?: Record<string, Array<{ start: number; end: number }>>;

  /** 메인 타이틀·유의사항·부제: 부분 굵게/기울임/밑줄 (plain 기준) */
  posterTitleBoldRanges?: Array<{ start: number; end: number }>;
  posterTitleItalicRanges?: Array<{ start: number; end: number }>;
  posterTitleUnderlineRanges?: Array<{ start: number; end: number }>;
  posterFooterBoldRanges?: Array<{ start: number; end: number }>;
  posterFooterItalicRanges?: Array<{ start: number; end: number }>;
  posterFooterUnderlineRanges?: Array<{ start: number; end: number }>;
  posterSubtitleBoldRanges?: Record<string, Array<{ start: number; end: number }>>;
  posterSubtitleItalicRanges?: Record<string, Array<{ start: number; end: number }>>;
  posterSubtitleUnderlineRanges?: Record<string, Array<{ start: number; end: number }>>;
  /** 부제·본문 블록별 부분 굵기 (plain 기준) */
  posterSubtitleWeightRanges?: Record<string, Array<{ start: number; end: number; weight: number }>>;
  posterBodyWeightRanges?: Record<string, Array<{ start: number; end: number; weight: number }>>;

  /** 부분 글자색 — plain 기준 [start,end)에 hex 색상을 보관(전체 색상에 우선) */
  posterTitleColorRanges?: Array<{ start: number; end: number; color: string }>;
  posterFooterColorRanges?: Array<{ start: number; end: number; color: string }>;
  posterBodyColorRanges?: Record<string, Array<{ start: number; end: number; color: string }>>;
  posterSubtitleColorRanges?: Record<string, Array<{ start: number; end: number; color: string }>>;

  posterFooterRect?: { x: number; y: number; width: number; height: number };

  /** 텍스트 박스 자동 크기: 사용자가 핸들로 크기 조절하면 해당 플래그로 자동 맞춤 일시 중단 */
  posterTitleRectLocked?: boolean;
  posterFooterRectLocked?: boolean;
  posterBodyRectLocked?: Record<string, boolean>;
  /** 부제 블록별 자동 크기 일시 중단 */
  posterSubtitleRectLocked?: Record<string, boolean>;
  /** 뱃지 블록별 자동 크기·로고 회피 일시 중단 */
  posterBadgeRectLocked?: Record<string, boolean>;

  /** 포스터: 메인 타이틀/본문/하단 유의사항 정렬 */
  posterTitleAlign?: CanvasTextAlign;
  posterBodyAlign?: CanvasTextAlign;
  /** 본문 블록별 정렬 (미지정 시 posterBodyAlign → left) */
  posterBodyAligns?: Record<string, CanvasTextAlign>;
  posterFooterAlign?: CanvasTextAlign;
  /** 부제 블록별 정렬 (미지정 시 메인 타이틀 정렬과 동일하게 취급) */
  posterSubtitleAlign?: Record<string, CanvasTextAlign>;

  /** 하단 유의사항 글자색 (미지정 시 VI 회색 톤) */
  posterFooterColor?: string;
  /** 본문 블록별 글자색 (미지정 시 bodyColor) */
  posterBodyColors?: Record<string, string>;

  /** 캔버스 툴바 타이포 세부 */
  posterTitleTypography?: PosterElementTypography;
  posterFooterTypography?: PosterElementTypography;
  posterBodyTypography?: Record<string, PosterElementTypography>;
  posterSubtitleTypography?: Record<string, PosterElementTypography>;

  /** 비RCS 캔버스: 사용자 정의 그룹(선택 키 기준) */
  canvasGroups?: Array<{ id: string; keys: string[] }>;

  /** AXIS 레이아웃 가이드 기본 배치가 적용됐는지(최초 1회) */
  axisLayoutApplied?: boolean;
  /** 적용된 레이아웃 카테고리 */
  axisLayoutCategory?:
    | "wide"
    | "basic"
    | "square"
    | "live"
    | "wide-event"
    | "sns"
    | "poster-window"
    | "poster-full"
    | "xbanner"
    | "placard-wide";
  /** 적용된 브랜드 레이아웃 프로필 */
  axisLayoutProfile?:
    | "web-wide"
    | "web-basic-model-b"
    | "web-basic-image"
    | "web-square"
    | "web-live"
    | "web-wide-event"
    | "sns-grid"
    | "poster-window"
    | "poster-full-image"
    | "xbanner-stack"
    | "placard-wide";
  /** 가이드 기준 이미지 모서리 R(px) — 캔버스 짧은 변 비례 스케일 */
  axisLayoutImageCornerRadiusPx?: number;
}

export interface ComplianceIssue {
  type: 'color' | 'font' | 'spacing' | 'resolution' | 'contrast';
  severity: 'error' | 'warning';
  message: string;
  location?: string;
}

export interface DesignLayer {
  id: string;
  name: string;
  type: 'text' | 'image' | 'shape' | 'logo';
  visible: boolean;
  locked: boolean;
}
