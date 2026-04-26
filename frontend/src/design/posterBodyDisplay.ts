import type { DesignContent } from "./types";
import {
  DEFAULT_POSTER_BODY_RECT,
  DEFAULT_POSTER_BODY_EXTRA_1,
  DEFAULT_POSTER_BODY_EXTRA_2,
} from "./posterDefaults";

type BodyBlock = { id: string; text: string };

export type NormalizedBodyRect = { x: number; y: number; width: number; height: number };

const NORM_HI = 1.02;

/** 캔버스 오버레이는 0~1 정규화 rect만 사용. 예전 버그로 px 값이 저장된 경우 무시한다. */
export function isValidNormalizedRect(
  r: { x: number; y: number; width: number; height: number } | undefined | null
): r is NormalizedBodyRect {
  if (r == null) return false;
  const { x, y, width, height } = r;
  if (![x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (width <= 0 || height <= 0) return false;
  if (x < -0.02 || y < -0.02) return false;
  if (x > NORM_HI || y > NORM_HI) return false;
  if (width > NORM_HI || height > NORM_HI) return false;
  return true;
}

export function coerceNormalizedRect(
  stored: { x: number; y: number; width: number; height: number } | undefined | null,
  fallback: NormalizedBodyRect
): NormalizedBodyRect {
  return isValidNormalizedRect(stored) ? stored : fallback;
}

/**
 * 본문 박스 rect — 저장값이 없을 때 블록 순번별 기본(겹침 방지).
 */
export function resolvePosterBodyBlockRect(c: DesignContent, id: string): NormalizedBodyRect {
  const from = c.posterBodyRects?.[id];
  if (isValidNormalizedRect(from)) return from;
  if (id === "body-1" && isValidNormalizedRect(c.posterBodyRect)) return c.posterBodyRect;
  const bodies = resolvePosterBodyBlocksForRender(c);
  const bi = Math.max(0, bodies.findIndex((b) => b.id === id));
  if (bi === 0) {
    return isValidNormalizedRect(c.posterBodyRect) ? c.posterBodyRect : DEFAULT_POSTER_BODY_RECT;
  }
  if (bi === 1) return DEFAULT_POSTER_BODY_EXTRA_1;
  return DEFAULT_POSTER_BODY_EXTRA_2;
}

/**
 * 본문 블록 표시용: 첫 블록(body-1)은 항상 `bodyText`와 동일하게 보이게 병합합니다.
 * (우측 패널은 bodyText 위주, 캔버스는 posterBodies 위주로 쓰이던 불일치 방지)
 */
export function resolvePosterBodyBlocksForRender(c: DesignContent): BodyBlock[] {
  const raw: BodyBlock[] =
    c.posterBodies && c.posterBodies.length > 0
      ? c.posterBodies.map((b) => ({ id: b.id, text: b.text ?? "" }))
      : [{ id: "body-1", text: c.bodyText ?? "" }];
  return raw.map((blk) =>
    blk.id === "body-1" ? { ...blk, text: c.bodyText ?? blk.text ?? "" } : blk
  );
}

/** 우측 패널·인라인 편집에서 본문 블록 텍스트를 한 경로로 반영 */
export function applyBodyBlockTextEdit(
  c: DesignContent,
  blockId: string,
  text: string
): DesignContent {
  const base: BodyBlock[] =
    c.posterBodies && c.posterBodies.length > 0
      ? c.posterBodies.map((b) => ({ id: b.id, text: b.text ?? "" }))
      : [{ id: "body-1", text: c.bodyText ?? "" }];
  const nextBodies = base.map((bb) => (bb.id === blockId ? { ...bb, text } : bb));
  const locked = { ...(c.posterBodyRectLocked ?? {}), [blockId]: false };
  if (blockId === "body-1") {
    return { ...c, bodyText: text, posterBodies: nextBodies, posterBodyRectLocked: locked };
  }
  const b1 = nextBodies.find((x) => x.id === "body-1");
  return {
    ...c,
    posterBodies: nextBodies,
    bodyText: b1 ? b1.text : c.bodyText,
    posterBodyRectLocked: locked,
  };
}
