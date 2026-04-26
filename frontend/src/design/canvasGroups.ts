import type { DesignContent } from "./types";

export type CanvasElementGroup = { id: string; keys: string[] };

const GROUP_PREFIX = "group:" as const;

export function isGroupSelectionKey(key: string): boolean {
  return key.startsWith(GROUP_PREFIX);
}

export function groupIdFromSelectionKey(key: string): string | null {
  return isGroupSelectionKey(key) ? key.slice(GROUP_PREFIX.length) : null;
}

export function findGroupContainingKey(
  groups: CanvasElementGroup[] | undefined,
  memberKey: string
): CanvasElementGroup | null {
  if (!groups?.length) return null;
  for (const g of groups) {
    if (g.keys.includes(memberKey)) return g;
  }
  return null;
}

/** `group:<id>` 선택을 멤버 키로 펼친 뒤, 이동·리사이즈·정렬에 사용 */
export function expandKeysForRectOps(c: DesignContent, selectedKeys: string[]): string[] {
  const groups = c.canvasGroups ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of selectedKeys) {
    if (isGroupSelectionKey(k)) {
      const gid = groupIdFromSelectionKey(k);
      const g = gid ? groups.find((x) => x.id === gid) : undefined;
      for (const mk of g?.keys ?? []) {
        if (!seen.has(mk)) {
          seen.add(mk);
          out.push(mk);
        }
      }
    } else if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function filterGroupableKeys(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (isGroupSelectionKey(k)) continue;
    if (k === "logo") continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function canGroupSelection(c: DesignContent, selectedKeys: string[]): boolean {
  const ex = filterGroupableKeys(expandKeysForRectOps(c, selectedKeys));
  return ex.length >= 2;
}

export function canUngroupSelection(c: DesignContent, selectedKeys: string[]): boolean {
  if (selectedKeys.some(isGroupSelectionKey)) return true;
  const ex = expandKeysForRectOps(c, selectedKeys);
  return (c.canvasGroups ?? []).some((g) => g.keys.some((k) => ex.includes(k)));
}

export function addCanvasGroup(
  c: DesignContent,
  memberKeys: string[]
): { content: DesignContent; groupId: string } | null {
  const keys = filterGroupableKeys(memberKeys);
  if (keys.length < 2) return null;
  const kept = (c.canvasGroups ?? [])
    .map((g) => ({ ...g, keys: g.keys.filter((mk) => !keys.includes(mk)) }))
    .filter((g) => g.keys.length >= 2);
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cg-${Date.now()}`;
  kept.push({ id, keys });
  return { content: { ...c, canvasGroups: kept }, groupId: id };
}

export function removeGroupsTouchingKeys(c: DesignContent, touchKeys: string[]): DesignContent {
  const explicitIds = new Set(
    touchKeys
      .filter(isGroupSelectionKey)
      .map((k) => groupIdFromSelectionKey(k))
      .filter((id): id is string => Boolean(id))
  );
  const touch = new Set(touchKeys.filter((k) => !isGroupSelectionKey(k)));
  const next = (c.canvasGroups ?? []).filter((g) => {
    if (explicitIds.has(g.id)) return false;
    if (g.keys.some((mk) => touch.has(mk))) return false;
    return true;
  });
  return { ...c, canvasGroups: next.length ? next : undefined };
}
