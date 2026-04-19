import type { DesignContent } from "@/design/types";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export function clampNormRect(r: NormalizedRect): NormalizedRect {
  const x = Math.max(0, Math.min(1 - r.width, r.x));
  const y = Math.max(0, Math.min(1 - r.height, r.y));
  return { ...r, x, y };
}

export function getPosterRectByKey(c: DesignContent, key: string): NormalizedRect | null {
  if (key.startsWith("subtitle:")) {
    const id = key.slice(9);
    return c.posterSubtitleRects?.[id] ?? null;
  }
  if (key.startsWith("body:")) {
    const id = key.slice(5);
    const fromMap = c.posterBodyRects?.[id];
    if (fromMap) return fromMap;
    if (id === "body-1") return c.posterBodyRect ?? null;
    return null;
  }
  switch (key) {
    case "image":
      return c.posterBackgroundImageRect ?? null;
    case "badge":
      return c.posterBadgeRect ?? null;
    case "title":
      return c.posterTitleRect ?? null;
    case "body":
      return c.posterBodyRect ?? (c.posterBodyRects?.["body-1"] ?? null);
    case "footer":
      return c.posterFooterRect ?? null;
    default:
      return null;
  }
}

export function setPosterRectByKey(c: DesignContent, key: string, r: NormalizedRect): DesignContent {
  if (key.startsWith("subtitle:")) {
    const id = key.slice(9);
    const next = { ...(c.posterSubtitleRects ?? {}), [id]: r };
    return { ...c, posterSubtitleRects: next };
  }
  if (key.startsWith("body:")) {
    const id = key.slice(5);
    const nextRects = { ...(c.posterBodyRects ?? {}), [id]: r };
    let next = { ...c, posterBodyRects: nextRects };
    if (id === "body-1") next = { ...next, posterBodyRect: r };
    return next;
  }
  switch (key) {
    case "image":
      return { ...c, posterBackgroundImageRect: r };
    case "badge":
      return { ...c, posterBadgeRect: r };
    case "title":
      return { ...c, posterTitleRect: r };
    case "body":
      return { ...c, posterBodyRect: r, posterBodyRects: { ...(c.posterBodyRects ?? {}), "body-1": r } };
    case "footer":
      return { ...c, posterFooterRect: r };
    default:
      return c;
  }
}

/** 선택된 키(포스터 rect + 에셋)에 동일 이동량 적용. logo 제외 */
export function applyGroupRectDelta(c: DesignContent, keys: string[], dx: number, dy: number): DesignContent {
  let next = { ...c };
  const assets = [...(next.assetLayers ?? [])];
  let assetMut = false;
  for (const key of keys) {
    if (key === "logo") continue;
    if (key.startsWith("asset:")) {
      const id = key.slice(6);
      const idx = assets.findIndex((a) => a.id === id);
      if (idx >= 0) {
        const a = assets[idx];
        assets[idx] = {
          ...a,
          x: Math.max(0, Math.min(1 - a.width, a.x + dx)),
          y: Math.max(0, Math.min(1 - a.height, a.y + dy)),
        };
        assetMut = true;
      }
    } else {
      const r = getPosterRectByKey(next, key);
      if (r) next = setPosterRectByKey(next, key, clampNormRect({ ...r, x: r.x + dx, y: r.y + dy }));
    }
  }
  if (assetMut) next = { ...next, assetLayers: assets };
  return next;
}

const GROUP_RESIZE_MIN = 0.02;

/**
 * 다중 선택 시 한 요소(leader)의 크기·위치 변화를 같은 델타로 나머지에 적용.
 * leader는 `nextLeader`로 정확히 반영하고, 나머지는 각자 이전 rect에 (dx,dy,dw,dh)를 더한다.
 */
export function applyGroupRectLeaderResize(
  c: DesignContent,
  keys: string[],
  leaderKey: string,
  prevLeader: NormalizedRect,
  nextLeader: NormalizedRect
): DesignContent {
  const dx = nextLeader.x - prevLeader.x;
  const dy = nextLeader.y - prevLeader.y;
  const dw = nextLeader.width - prevLeader.width;
  const dh = nextLeader.height - prevLeader.height;

  let next = { ...c };
  const assets = [...(next.assetLayers ?? [])];
  let assetMut = false;

  for (const key of keys) {
    if (key === "logo") continue;

    if (key.startsWith("asset:")) {
      const id = key.slice(6);
      const idx = assets.findIndex((a) => a.id === id);
      if (idx < 0) continue;
      const a = assets[idx];
      if (key === leaderKey) {
        assets[idx] = {
          ...a,
          x: nextLeader.x,
          y: nextLeader.y,
          width: nextLeader.width,
          height: nextLeader.height,
        };
      } else {
        const nw = Math.max(GROUP_RESIZE_MIN, a.width + dw);
        const nh = Math.max(GROUP_RESIZE_MIN, a.height + dh);
        const nx = Math.max(0, Math.min(1 - nw, a.x + dx));
        const ny = Math.max(0, Math.min(1 - nh, a.y + dy));
        assets[idx] = { ...a, x: nx, y: ny, width: nw, height: nh };
      }
      assetMut = true;
      continue;
    }

    const r = getPosterRectByKey(next, key);
    if (!r) continue;

    if (key === leaderKey) {
      next = setPosterRectByKey(next, key, clampNormRect(nextLeader));
    } else {
      const nw = Math.max(GROUP_RESIZE_MIN, r.width + dw);
      const nh = Math.max(GROUP_RESIZE_MIN, r.height + dh);
      next = setPosterRectByKey(
        next,
        key,
        clampNormRect({
          x: r.x + dx,
          y: r.y + dy,
          width: nw,
          height: nh,
        })
      );
    }
  }

  if (assetMut) next = { ...next, assetLayers: assets };
  return next;
}

/** 본문 블록 id가 현재 선택에 포함되는지 (`body` 레거시 키 포함) */
export function selectedKeysIncludeBody(keys: string[], bodyId: string): boolean {
  return keys.includes(`body:${bodyId}`) || (bodyId === "body-1" && keys.includes("body"));
}

type AlignItem = { key: string; rect: NormalizedRect; kind: "poster" | "asset"; assetId?: string };

function collectAlignItems(c: DesignContent, keys: string[]): AlignItem[] {
  const out: AlignItem[] = [];
  for (const key of keys) {
    if (key === "logo") continue;
    if (key.startsWith("asset:")) {
      const id = key.slice(6);
      const a = (c.assetLayers ?? []).find((x) => x.id === id);
      if (a) out.push({ key, rect: { x: a.x, y: a.y, width: a.width, height: a.height }, kind: "asset", assetId: id });
    } else {
      const r = getPosterRectByKey(c, key);
      if (r) out.push({ key, rect: { ...r }, kind: "poster" });
    }
  }
  return out;
}

export type AlignMode =
  | "left"
  | "right"
  | "centerH"
  | "top"
  | "bottom"
  | "centerV"
  | "distributeH"
  | "distributeV";

/** @deprecated use applyMultiAlign */
export function applyHorizontalAlign(
  c: DesignContent,
  keys: string[],
  mode: "left" | "right" | "distribute"
): DesignContent {
  const map: Record<string, AlignMode> = { left: "left", right: "right", distribute: "distributeH" };
  return applyMultiAlign(c, keys, map[mode]);
}

export function applyMultiAlign(c: DesignContent, keys: string[], mode: AlignMode): DesignContent {
  const items = collectAlignItems(c, keys);
  if (items.length < 2) return c;
  let next = { ...c };
  let assets = [...(next.assetLayers ?? [])];

  const setPoster = (it: AlignItem, r: NormalizedRect) => {
    if (it.kind === "poster") next = setPosterRectByKey(next, it.key, clampNormRect(r));
    else {
      const idx = assets.findIndex((a) => a.id === it.assetId);
      if (idx >= 0) assets[idx] = { ...assets[idx], ...r };
    }
  };

  if (mode === "left") {
    const minX = Math.min(...items.map((i) => i.rect.x));
    for (const it of items) {
      setPoster(it, { ...it.rect, x: minX });
    }
  } else if (mode === "right") {
    const maxR = Math.max(...items.map((i) => i.rect.x + i.rect.width));
    for (const it of items) {
      const nx = maxR - it.rect.width;
      setPoster(it, { ...it.rect, x: nx });
    }
  } else if (mode === "centerH") {
    const centers = items.map((i) => i.rect.x + i.rect.width / 2);
    const mid = (Math.min(...centers) + Math.max(...centers)) / 2;
    for (const it of items) {
      const nx = mid - it.rect.width / 2;
      setPoster(it, { ...it.rect, x: Math.max(0, Math.min(1 - it.rect.width, nx)) });
    }
  } else if (mode === "top") {
    const minY = Math.min(...items.map((i) => i.rect.y));
    for (const it of items) {
      setPoster(it, { ...it.rect, y: minY });
    }
  } else if (mode === "bottom") {
    const maxB = Math.max(...items.map((i) => i.rect.y + i.rect.height));
    for (const it of items) {
      const ny = maxB - it.rect.height;
      setPoster(it, { ...it.rect, y: ny });
    }
  } else if (mode === "centerV") {
    const centers = items.map((i) => i.rect.y + i.rect.height / 2);
    const mid = (Math.min(...centers) + Math.max(...centers)) / 2;
    for (const it of items) {
      const ny = mid - it.rect.height / 2;
      setPoster(it, { ...it.rect, y: Math.max(0, Math.min(1 - it.rect.height, ny)) });
    }
  } else if (mode === "distributeH") {
    const sorted = [...items].sort((a, b) => a.rect.x + a.rect.width / 2 - (b.rect.x + b.rect.width / 2));
    const leftEdge = sorted[0].rect.x;
    const rightEdge = sorted[sorted.length - 1].rect.x + sorted[sorted.length - 1].rect.width;
    const totalW = sorted.reduce((s, i) => s + i.rect.width, 0);
    const n = sorted.length;
    const gap = n > 1 ? (rightEdge - leftEdge - totalW) / (n - 1) : 0;
    let x = leftEdge;
    for (const it of sorted) {
      setPoster(it, { ...it.rect, x });
      x += it.rect.width + gap;
    }
  } else if (mode === "distributeV") {
    const sorted = [...items].sort((a, b) => a.rect.y + a.rect.height / 2 - (b.rect.y + b.rect.height / 2));
    const topEdge = sorted[0].rect.y;
    const bottomEdge = sorted[sorted.length - 1].rect.y + sorted[sorted.length - 1].rect.height;
    const totalH = sorted.reduce((s, i) => s + i.rect.height, 0);
    const n = sorted.length;
    const gap = n > 1 ? (bottomEdge - topEdge - totalH) / (n - 1) : 0;
    let y = topEdge;
    for (const it of sorted) {
      setPoster(it, { ...it.rect, y });
      y += it.rect.height + gap;
    }
  }

  return { ...next, assetLayers: assets };
}
