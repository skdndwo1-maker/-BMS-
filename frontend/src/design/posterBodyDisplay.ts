import type { CanvasTextAlign, DesignContent, PosterElementTypography } from "./types";

type BodyBlock = { id: string; text: string };

/** 캔버스·텍스트 옵션에서 동일 블록 id로 타이포를 읽고 쓰기 위한 해석 */
export function resolvePosterBodyTypographyBlockId(
  c: DesignContent,
  preferredId?: string
): string {
  const blocks = resolvePosterBodyBlocksForRender(c);
  const primaryId = blocks[0]?.id ?? "body-1";
  if (!preferredId) return primaryId;
  if (blocks.some((b) => b.id === preferredId)) return preferredId;
  if (preferredId === "body-1" && blocks.length === 1) return primaryId;
  return preferredId;
}

export function getPosterBodyBlockTypography(
  c: DesignContent,
  blockId: string
): PosterElementTypography {
  const map = c.posterBodyTypography ?? {};
  const resolvedId = resolvePosterBodyTypographyBlockId(c, blockId);
  const direct = map[resolvedId];
  if (direct) return direct;
  if (resolvedId !== "body-1" && map["body-1"]) return map["body-1"];
  if (resolvedId !== blockId && map[blockId]) return map[blockId];
  return {};
}

export function getPosterBodyFontScale(c: DesignContent, blockId: string): number {
  const resolvedId = resolvePosterBodyTypographyBlockId(c, blockId);
  return (
    c.posterBodyFontScales?.[resolvedId] ??
    c.posterBodyFontScales?.[blockId] ??
    c.posterBodyFontScale ??
    100
  );
}

export function getPosterBodyAlign(c: DesignContent, blockId: string): CanvasTextAlign {
  const resolvedId = resolvePosterBodyTypographyBlockId(c, blockId);
  return (
    c.posterBodyAligns?.[resolvedId] ??
    c.posterBodyAligns?.[blockId] ??
    c.posterBodyAlign ??
    "left"
  );
}

export function getPosterBodyColor(c: DesignContent, blockId: string): string {
  const resolvedId = resolvePosterBodyTypographyBlockId(c, blockId);
  return (
    c.posterBodyColors?.[resolvedId] ??
    c.posterBodyColors?.[blockId] ??
    c.bodyColor ??
    "#5A5A5A"
  );
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
