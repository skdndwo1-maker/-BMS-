import { computeBrandLayoutRects } from "./axisLayoutGuide";

/** Basic(Image) 비율(466×262) 기준 기본 배치 — 폴백·AI 리셋용 */
const BASIC = computeBrandLayoutRects("web-basic-image", { width: 466, height: 262 });

/** 포스터 캔버스 기본 배치 (정규화 0~1) */
export const DEFAULT_POSTER_BG_RECT = BASIC.imageRect;
export const DEFAULT_POSTER_BADGE_RECT = BASIC.badgeRect;
export const DEFAULT_POSTER_TITLE_RECT = BASIC.titleRect;
export const DEFAULT_POSTER_BODY_RECT = BASIC.bodyRect;
export const DEFAULT_POSTER_FOOTER_RECT = BASIC.footerRect;
export const DEFAULT_POSTER_SUBTITLE_RECT = BASIC.subtitleRect;

/** 추가 부제 블록 세로 간격(캔버스 높이 대비) */
export const DEFAULT_POSTER_SUBTITLE_OFFSET_Y = 0.065;

/** 추가 본문 블록 기본 위치 — 본문 영역 하단 분할 */
export const DEFAULT_POSTER_BODY_EXTRA_1 = {
  x: BASIC.bodyRect.x,
  y: Math.min(0.78, BASIC.bodyRect.y + BASIC.bodyRect.height * 0.55),
  width: BASIC.bodyRect.width,
  height: BASIC.bodyRect.height * 0.45,
};
export const DEFAULT_POSTER_BODY_EXTRA_2 = {
  x: BASIC.bodyRect.x,
  y: Math.min(0.88, BASIC.bodyRect.y + BASIC.bodyRect.height * 0.78),
  width: BASIC.bodyRect.width,
  height: BASIC.bodyRect.height * 0.22,
};
