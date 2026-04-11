/**
 * 국가법령정보센터 Open API 연동 (적법성·브랜드 네이밍 맥락 보강)
 * - 신청·명세: https://open.law.go.kr/
 * - 검색 엔드포인트: DRF lawSearch (JSON)
 */

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** OC 인증키 — LAW_API_OC 우선, 기존 LAW_GO_OC 호환 */
export function resolveLawApiOc(): string {
  return (
    process.env.LAW_API_OC?.trim() ||
    process.env.LAW_GO_OC?.trim() ||
    ""
  );
}

const LAW_SEARCH_JSON_URL = "https://www.law.go.kr/DRF/lawSearch.do";

/** 로그용: URL의 OC 파라미터만 마스킹 */
function redactLawSearchUrl(urlStr: string): string {
  return urlStr.replace(/([?&]OC=)[^&]*/i, "$1(redacted)");
}

export type LawSearchSingleResult =
  | { ok: true; query: string; text: string }
  | { ok: false; query: string; error: string };

function parseLawSearchJson(raw: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const lawSearch = j.LawSearch as Record<string, unknown> | undefined;
    const items = (lawSearch?.law as unknown[]) ?? (j.items as unknown[]) ?? [];
    if (Array.isArray(items)) {
      for (const it of items) {
        const row = it as Record<string, unknown>;
        const nm = String(row.법령명한글 ?? row.lawName ?? row.법령명 ?? row.name ?? "").trim();
        const id = String(row.법령ID ?? row.lawId ?? "").trim();
        const key = id || nm;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        lines.push(`${lines.length + 1}. ${nm}${id ? ` (법령 ID ${id})` : ""}`);
      }
    }
  } catch {
    /* ignore */
  }
  return lines;
}

/**
 * 단일 질의로 법령 검색(JSON). OC 미설정·HTTP 오류·파싱 실패 시 ok: false.
 */
export async function searchLawsJson(query: string): Promise<LawSearchSingleResult> {
  const q = query.trim().slice(0, 200);
  const oc = resolveLawApiOc();
  if (!oc) {
    console.warn("[LAW] skip: OC 미설정 — .env에 LAW_API_OC 또는 LAW_GO_OC");
    return { ok: false, query: q, error: "OC 미설정: .env에 LAW_API_OC 또는 LAW_GO_OC 필요" };
  }
  if (!q) {
    console.warn("[LAW] skip: 검색어 비어 있음");
    return { ok: false, query: q, error: "검색어가 비어 있음" };
  }

  const url = new URL(LAW_SEARCH_JSON_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "law");
  url.searchParams.set("type", "JSON");
  url.searchParams.set("nw", "1");
  url.searchParams.set("query", q);

  const urlSafe = redactLawSearchUrl(url.toString());
  console.log("[LAW] request:", urlSafe);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json, */*" },
      signal: AbortSignal.timeout(20_000)
    });
    const raw = await res.text();
    if (!res.ok) {
      console.warn("[LAW] HTTP 오류:", { query: q, status: res.status, bodyHead: raw.slice(0, 500) });
      return {
        ok: false,
        query: q,
        error: `HTTP ${res.status}: ${truncate(raw, 400)}`
      };
    }
    const lines = parseLawSearchJson(raw);
    console.log("[LAW] response:", {
      query: q,
      status: res.status,
      bodyLength: raw.length,
      parsedLawCount: lines.length,
      bodyHead: raw.slice(0, 400).replace(/\s+/g, " ")
    });
    if (lines.length > 0) {
      return { ok: true, query: q, text: lines.join("\n") };
    }
    console.warn("[LAW] 파싱된 법령 목록 없음 — 원문 일부를 텍스트로 전달합니다.", {
      query: q,
      bodyHead: raw.slice(0, 400)
    });
    return {
      ok: true,
      query: q,
      text: truncate(raw.length > 800 ? `[원문 일부]\n${raw.slice(0, 800)}` : raw, 4000)
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[LAW] fetch 예외:", msg, "| query:", q);
    return {
      ok: false,
      query: q,
      error: msg
    };
  }
}

/**
 * 브랜드 네이밍 생성/검수용: 상표법·표시광고법 중심 다중 검색 후 Gemini 컨텍스트 문자열 생성.
 * 일부 호출 실패 시에도 성공한 결과와 오류 메시지를 함께 반환합니다.
 */
export async function fetchLawsForBrandNamingLegality(opts: {
  mode: "generate" | "audit";
  auditName: string;
  namingIntent: string;
  requestText: string;
}): Promise<string> {
  const oc = resolveLawApiOc();
  if (!oc) {
    console.warn("[LAW] fetchLawsForBrandNamingLegality: OC 없음 — 법령 API 호출 생략");
    return `[국가법령정보 API]\nOC 인증키가 없습니다. .env에 LAW_API_OC(또는 LAW_GO_OC)를 설정하세요.\n참고: https://open.law.go.kr/`;
  }

  const contextual =
    opts.mode === "audit"
      ? `${opts.auditName.trim()} ${opts.namingIntent.trim()}`.trim().slice(0, 60)
      : opts.requestText.trim().slice(0, 60);

  /** 상표법·표시광고법 위주 + 브랜드·광고 맥락 보조 질의 */
  const queries: string[] = [
    "상표법",
    "표시광고법",
    "부정경쟁방지법 상표",
    contextual ? `${contextual} 광고`.slice(0, 100) : ""
  ].filter((x) => x.length > 0);

  const uniqueQueries = [...new Set(queries)];

  console.log("[LAW] fetchLawsForBrandNamingLegality 시작:", {
    mode: opts.mode,
    검색횟수: uniqueQueries.length,
    검색어: uniqueQueries
  });

  const parts: string[] = [
    "[국가법령정보센터 open.law.go.kr — 적법성 평가용 법령 검색]",
    "Gemini는 아래 검색 결과를 참고하여 legalityScore·legalDetail·적법성 관련 서술을 작성하세요.",
    ""
  ];

  for (const query of uniqueQueries) {
    const r = await searchLawsJson(query);
    parts.push(`【검색어: ${query}】`);
    if (r.ok) {
      parts.push(r.text.trim() || "(본문 없음)");
    } else {
      parts.push(`[검색 실패] ${r.error}`);
    }
    parts.push("");
  }

  const out = truncate(parts.join("\n"), 12_000);
  console.log("[LAW] fetchLawsForBrandNamingLegality 완료:", {
    mode: opts.mode,
    검색횟수: uniqueQueries.length,
    결과문자수: out.length
  });
  return out;
}
