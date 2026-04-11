// Core types for the design automation platform

export type TemplateCategory =
  | 'marketing-banner'
  | 'poster'
  | 'social-media'
  | 'internal-notice'
  | 'signage'
  | 'presentation'
  | 'placard';

export type DesignStyle = 'basic' | 'informational' | 'no-limit';

export type LogoPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center-top'
  | 'center-bottom';

// ── 포스터 카테고리 ──────────────────────────────────────────────────
export type PosterCategory =
  | 'basic'
  | 'service'
  | 'promotion'
  | 'mobile-launch'
  | 'plan-benefit';

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
  date?: string;
  venue?: string;
  rightPanelBg?: 'white' | 'light-grey' | 'ivory' | 'light-pink';
  logoOption?: 'CI' | 'BI' | 'SLOGAN' | null;

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
