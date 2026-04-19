/**
 * 국가법령정보센터 Open API 연동 (적법성·브랜드 네이밍 맥락 보강)
 * - 신청·명세: https://open.law.go.kr/
 * - 검색 엔드포인트: DRF lawSearch (JSON)
 */

import { setDefaultResultOrder } from "node:dns";
import * as https from "node:https";

/** Node 기본 fetch(Undici)가 IPv6 우선으로 law.go.kr 연결에 실패하는 경우가 있어 IPv4 우선 */
setDefaultResultOrder("ipv4first");

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

const LAW_FETCH_TIMEOUT_MS = 20_000;

/** 일부 환경에서 기본 fetch UA가 거절되는 경우가 있어 브라우저에 가깝게 지정 */
const LAW_API_FETCH_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (compatible; U-Layer1-BrandNaming/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.law.go.kr/"
};

/** undici fetch 실패 시 동일 URL을 node:https로 재시도 (TLS·DNS 환경 차이 대응) */
function lawSearchViaHttps(urlStr: string): Promise<{ status: number; raw: string }> {
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: { ...LAW_API_FETCH_HEADERS, Host: u.hostname },
        timeout: LAW_FETCH_TIMEOUT_MS,
        servername: u.hostname
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("https timeout"));
    });
    req.end();
  });
}

async function fetchLawSearchResponse(urlStr: string): Promise<{ status: number; raw: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(urlStr, {
        headers: LAW_API_FETCH_HEADERS,
        signal: AbortSignal.timeout(LAW_FETCH_TIMEOUT_MS)
      });
      const raw = await res.text();
      return { status: res.status, raw };
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        console.warn("[LAW] fetch 실패, 300ms 후 1회 재시도:", e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  console.warn(
    "[LAW] fetch 2회 실패, node:https 폴백. 마지막 오류:",
    lastErr instanceof Error ? lastErr.message : lastErr
  );
  return lawSearchViaHttps(urlStr);
}

/** 로그용: URL의 OC 파라미터만 마스킹 */
function redactLawSearchUrl(urlStr: string): string {
  return urlStr.replace(/([?&]OC=)[^&]*/i, "$1(redacted)");
}

export type LawSearchSingleResult =
  | { ok: true; query: string; text: string }
  | { ok: false; query: string; error: string };

/** API가 오류일 때 JSON에 `msg`만 있고 `LawSearch`가 없는 경우가 많음 */
function lawSearchApiErrorMessage(j: Record<string, unknown>): string | null {
  if (j.LawSearch != null && typeof j.LawSearch === "object") return null;
  const msg = j.msg;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  const result = j.result;
  if (typeof result === "string" && /실패|오류|검증/i.test(result)) return result.trim();
  return null;
}

function enrichLawApiErrorHint(err: string): string {
  if (/IP|도메인|등록|검증/i.test(err)) {
    return `${err}\n→ open.law.go.kr 에서 OC 발급 계정으로 서버 공인 IP(또는 도메인)를 등록한 뒤, 백엔드를 재시작하세요. 로컬 PC에서는 해당 PC의 공인 IP가 등록된 경우에만 성공합니다.`;
  }
  return err;
}

function normalizeLawRows(lawField: unknown): unknown[] {
  if (Array.isArray(lawField)) return lawField;
  if (lawField && typeof lawField === "object") return [lawField];
  return [];
}

function parseLawSearchJson(raw: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const err = lawSearchApiErrorMessage(j);
    if (err) return [];

    const lawSearch = j.LawSearch as Record<string, unknown> | undefined;
    let items = normalizeLawRows(lawSearch?.law);
    if (items.length === 0) items = normalizeLawRows(j.items);
    if (items.length === 0) items = normalizeLawRows(j.law);
    if (Array.isArray(items)) {
      for (const it of items) {
        const row = it as Record<string, unknown>;
        const nm = String(
          row.법령명한글 ??
            row["법령명_한글"] ??
            row.lawName ??
            row.법령명 ??
            row.name ??
            ""
        ).trim();
        const id = String(row.법령ID ?? row.법령일련번호 ?? row.lawId ?? "").trim();
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

export type SearchLawsJsonOptions = {
  /** 1~100, 기본 20 (open.law.go.kr 명세) */
  display?: number;
  /** 1: 법령명, 2: 본문검색 */
  search?: 1 | 2;
};

/**
 * 단일 질의로 법령 검색(JSON). OC 미설정·HTTP 오류·파싱 실패 시 ok: false.
 * @see https://open.law.go.kr/ — OC 발급 후 서버 IP/도메인 등록 필요
 */
export async function searchLawsJson(
  query: string,
  opts?: SearchLawsJsonOptions
): Promise<LawSearchSingleResult> {
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
  const display =
    opts?.display != null && Number.isFinite(opts.display)
      ? Math.min(100, Math.max(1, Math.floor(Number(opts.display))))
      : 20;
  url.searchParams.set("display", String(display));
  url.searchParams.set("page", "1");
  /** 명세: 1=법령명, 2=본문 — 브랜드 네이밍 보조 검색은 기본 법령명 검색 */
  const searchMode = opts?.search === 2 ? 2 : 1;
  url.searchParams.set("search", String(searchMode));

  const urlSafe = redactLawSearchUrl(url.toString());
  console.log("[LAW] request:", urlSafe);

  try {
    const { status: httpStatus, raw } = await fetchLawSearchResponse(url.toString());
    if (httpStatus < 200 || httpStatus >= 300) {
      console.warn("[LAW] HTTP 오류:", { query: q, status: httpStatus, bodyHead: raw.slice(0, 500) });
      return {
        ok: false,
        query: q,
        error: enrichLawApiErrorHint(`HTTP ${httpStatus}: ${truncate(raw, 400)}`)
      };
    }

    let envelope: Record<string, unknown> | null = null;
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      envelope = null;
    }
    if (envelope) {
      const apiErr = lawSearchApiErrorMessage(envelope);
      if (apiErr) {
        const hint = enrichLawApiErrorHint(apiErr);
        console.warn("[LAW] API 응답 오류:", { query: q, apiErr: hint });
        return { ok: false, query: q, error: hint };
      }
    }

    const lines = parseLawSearchJson(raw);
    console.log("[LAW] response:", {
      query: q,
      status: httpStatus,
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
    let detail = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.cause != null) {
      const c = e.cause;
      detail += ` | cause: ${c instanceof Error ? c.message : String(c)}`;
    }
    if (typeof AggregateError !== "undefined" && e instanceof AggregateError && e.errors?.length) {
      detail += ` | ${e.errors.map((x) => (x instanceof Error ? x.message : String(x))).join("; ")}`;
    }
    console.warn("[LAW] fetch 예외:", detail, "| query:", q);
    const short = detail.length > 800 ? `${detail.slice(0, 800)}…` : detail;
    return {
      ok: false,
      query: q,
      error: enrichLawApiErrorHint(short)
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
    const useBodySearch = query.length > 14 || /\s/.test(query);
    const r = await searchLawsJson(query, { search: useBodySearch ? 2 : 1, display: 15 });
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
