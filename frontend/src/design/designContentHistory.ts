import type { DesignContent } from "./types";

export type DesignHistoryEntry = {
  id: string;
  at: number;
  label: string;
  content: DesignContent;
};

export type DesignHistoryState = {
  entries: DesignHistoryEntry[];
  /** 현재 위치 (entries[idx] === 화면에 보이는 상태) */
  idx: number;
};

export function cloneDesignContent(c: DesignContent): DesignContent {
  return JSON.parse(JSON.stringify(c)) as DesignContent;
}

export function createHistoryEntry(
  content: DesignContent,
  label: string,
  at = Date.now()
): DesignHistoryEntry {
  return {
    id: `h-${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    label,
    content: cloneDesignContent(content),
  };
}

export function createInitialHistory(content: DesignContent): DesignHistoryState {
  return {
    entries: [createHistoryEntry(content, "시작")],
    idx: 0,
  };
}

export function formatHistoryTime(at: number): string {
  return new Date(at).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
