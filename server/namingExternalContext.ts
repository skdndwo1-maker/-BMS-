/**
 * 브랜드 네이밍 검수 시 Gemini 맥락 보강.
 * - 상표 검색: **공공데이터포털 KIPO API** `kipo-api.kipi.or.kr` (XML) 우선.
 *   (구 `plus.kipris.or.kr/openapi/rest` 일부 경로는 404 HTML → 비권장)
 * - 국가법령정보: https://open.law.go.kr/ — LAW_GO_OC
 *
 * 검수(audit) 모드에서만 상표 API를 호출합니다.
 */

/**
 * KIPO 상표 단어검색 (공공데이터포털 명세)
 * 엔드포인트: `{base}/getWordSearch` — base 기본값 `.../trademarkInfoSearchService`
 */
const KIPO_TRADEMARK_SERVICE_BASE =
  process.env.KIPRIS_OPENAPI_BASE?.trim() ||
  "http://kipo-api.kipi.or.kr/openapi/service/trademarkInfoSearchService";

const KIPRIS_LEGACY_REST_BASE = "http://plus.kipris.or.kr/openapi/rest";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * .env에 URL 인코딩된 키(%2F, %3D 등)로 저장된 경우 공공 API에 넘기기 전 디코딩.
 * (이중 인코딩된 경우 최대 2회 시도)
 */
function decodeEnvServiceKey(raw: string): string {
  let t = raw.trim();
  if (!t) return "";
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(t)) break;
    try {
      const next = decodeURIComponent(t);
      if (next === t) break;
      t = next;
    } catch {
      break;
    }
  }
  return t;
}

/** 공공 API 키 — ServiceKey / serviceKey 등 명세에 맞게 전달 (저장값 URL 디코딩 적용) */
export function resolveKiprisServiceKey(): string {
  const raw =
    process.env.KIPRIS_SERVICE_KEY?.trim() ||
    process.env.KIPLUS_API_KEY?.trim() ||
    process.env.KIPLUS_SERVICE_KEY?.trim() ||
    "";
  return decodeEnvServiceKey(raw);
}

/** 콘솔용: 요청 URL에서 serviceKey/ServiceKey 값만 마스킹 */
function redactKiprisKeyInUrl(urlStr: string): string {
  return urlStr.replace(/([?&])(serviceKey|ServiceKey)=([^&]*)/gi, "$1$2=(redacted)");
}

function stripXmlish(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyKiprisXmlOrJson(body: string): boolean {
  const t = body.trim();
  const head = t.slice(0, 800).toLowerCase();
  if (head.includes("<!doctype html") || head.includes("<html") || head.includes("<title>페이지를 찾을 수 없습니다")) {
    return false;
  }
  if (t.startsWith("<?xml")) return true;
  if (t.startsWith("{")) return true;
  if (/<response\b/i.test(t) || /<items\b/i.test(t) || /<item\b/i.test(t) || /<header\b/i.test(t)) return true;
  if (/<opensearchdescription/i.test(head)) return false;
  return false;
}

function extractXmlTag(chunk: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = chunk.match(re);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** KIPO 응답 헤더 (공통) */
function parseKipoHeader(xml: string): { successYN: string; resultCode: string; resultMsg: string } {
  return {
    successYN: extractXmlTag(xml, "successYN") || extractXmlTag(xml, "SuccessYN"),
    resultCode: extractXmlTag(xml, "resultCode") || extractXmlTag(xml, "ResultCode"),
    resultMsg: extractXmlTag(xml, "resultMsg") || extractXmlTag(xml, "ResultMsg")
  };
}

/** KIPRIS 응답 item 단위에서 흔히 쓰이는 태그 후보 */
function pickTrademarkFields(chunk: string): {
  name: string;
  appNo: string;
  regNo: string;
  applicant: string;
  status: string;
  nice: string;
} {
  const tryTags = (names: string[]) => {
    for (const n of names) {
      const v = extractXmlTag(chunk, n);
      if (v) return v;
    }
    return "";
  };
  return {
    name: tryTags(["titleKr", "TrademarkName", "trademarkName", "tmName", "Title", "한글상표명", "상표명", "applicationTitle"]),
    appNo: tryTags(["ApplicationNumber", "applicationNumber", "appNo", "출원번호"]),
    regNo: tryTags(["RegistrationNumber", "registrationNumber", "regNo", "등록번호"]),
    applicant: tryTags(["ApplicantName", "applicantName", "출원인명", "출원인"]),
    status: tryTags(["RegistrationStatus", "applicationStatus", "법적상태", "상태", "applicationStatus"]),
    nice: tryTags(["NiceClassification", "niceClassification", "지정상품", "지정상품류"])
  };
}

function formatKiprisItemsFromXml(xml: string, searchWord: string): string {
  const items = xml.split(/<item>/i).slice(1).map((s) => s.split(/<\/item>/i)[0]);
  const lines: string[] = [];
  const max = 15;
  let n = 0;
  for (const chunk of items) {
    if (n >= max) break;
    const f = pickTrademarkFields(chunk);
    if (!f.name && !f.appNo && !f.regNo) continue;
    n++;
    const parts = [
      f.name ? `상표명·표장: ${f.name}` : null,
      f.appNo ? `출원번호: ${f.appNo}` : null,
      f.regNo ? `등록번호: ${f.regNo}` : null,
      f.applicant ? `출원(권리)인: ${f.applicant}` : null,
      f.status ? `상태: ${f.status}` : null,
      f.nice ? `분류·지정상품(일부): ${truncate(f.nice, 200)}` : null
    ].filter(Boolean);
    lines.push(`[${n}] ${parts.join(" | ")}`);
  }
  if (lines.length === 0) {
    const plain = stripXmlish(xml);
    return truncate(plain, 8000);
  }
  const header = `검색어 "${searchWord}"에 대한 KIPRIS 상표 검색 결과 요약(최대 ${max}건). 아래 목록을 상표 충돌·유사성 판단의 1차 근거로 활용하세요.`;
  return `${header}\n${lines.join("\n")}`;
}

function parseKiprisJson(body: string): string {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const bodyObj = (j.response as Record<string, unknown> | undefined)?.body ?? j.body ?? j;
    const items = (bodyObj as { items?: unknown[] }).items;
    if (!Array.isArray(items) || items.length === 0) return truncate(JSON.stringify(j), 6000);
    const lines: string[] = [];
    items.slice(0, 15).forEach((it, i) => {
      const row = it as Record<string, unknown>;
      const name = String(row.titleKr ?? row.TrademarkName ?? row.trademarkName ?? "");
      const app = String(row.ApplicationNumber ?? row.applicationNumber ?? "");
      const reg = String(row.RegistrationNumber ?? "");
      const appName = String(row.ApplicantName ?? "");
      lines.push(`[${i + 1}] 상표: ${name || "(없음)"} | 출원: ${app} | 등록: ${reg} | 출원인: ${appName}`);
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}

export type KiprisFetchResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * 사용자 정의 URL이 있으면 우선 사용.
 * 템플릿: KIPRIS_TRADEMARK_SEARCH_URL 에 {key} {query} 가 있으면 치환, 없으면 ServiceKey·검색어 파라미터를 붙임.
 */
export function buildKiprisRequestUrl(searchWord: string): URL | null {
  const key = resolveKiprisServiceKey();
  if (!key || !searchWord.trim()) return null;

  const custom = process.env.KIPRIS_TRADEMARK_SEARCH_URL?.trim();
  const keyParam = process.env.KIPRIS_KEY_PARAM?.trim() || "ServiceKey";
  const wordParam = process.env.KIPRIS_WORD_PARAM?.trim() || "searchString";

  if (custom) {
    let s = custom;
    if (s.includes("{key}")) s = s.replace(/\{key\}/g, encodeURIComponent(key));
    if (s.includes("{query}")) s = s.replace(/\{query\}/g, encodeURIComponent(searchWord.slice(0, 200)));
    const u = new URL(s.startsWith("http") ? s : `http://${s}`);
    if (!custom.includes("{key}")) u.searchParams.set(keyParam, key);
    if (!custom.includes("{query}")) {
      u.searchParams.set(wordParam, searchWord.slice(0, 200));
    }
    if (!u.searchParams.has("numOfRows")) u.searchParams.set("numOfRows", "20");
    if (!u.searchParams.has("pageNo")) u.searchParams.set("pageNo", "1");
    return u;
  }

  const path =
    process.env.KIPRIS_TRADEMARK_OPERATION?.trim() ||
    "trademarkInfoSearchService/getWordSearch";
  const u = new URL(`${KIPRIS_LEGACY_REST_BASE}/${path}`);
  u.searchParams.set(keyParam, key);
  u.searchParams.set(wordParam, searchWord.slice(0, 200));
  u.searchParams.set("numOfRows", "20");
  u.searchParams.set("pageNo", "1");
  return u;
}

/**
 * KIPO 상표 단어검색 getWordSearch
 * 명세: `.../openapi/service/trademarkInfoSearchService/getWordSearch`
 * 필수: serviceKey(또는 ServiceKey), searchString(최대 38자 권장)
 * 선택: numOfRows, pageNo, searchRecentYear 등
 */
function buildKipoWordSearchUrl(q: string, keyParam: "serviceKey" | "ServiceKey"): URL {
  const u = new URL(`${KIPO_TRADEMARK_SERVICE_BASE}/getWordSearch`);
  const key = resolveKiprisServiceKey();
  u.searchParams.set(keyParam, key!);
  /** 명세상 단어 검색 필드명은 searchString */
  u.searchParams.set("searchString", q.slice(0, 38));
  u.searchParams.set("numOfRows", "20");
  u.searchParams.set("pageNo", "1");
  return u;
}

/** 내장 후보(레거시 plus.kipris) — 최후순, 종종 404 HTML */
const KIPRIS_PATH_CANDIDATES = [
  "trademarkInfoSearchService/getWordSearch",
  "trademarkInfoSearchService/trademarkSearch",
  "CmcInfoSearchService/trademarkSearchInfo"
] as const;

async function fetchUrlText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, application/json, */*" },
    signal: AbortSignal.timeout(25_000)
  });
  const body = await res.text();
  return { status: res.status, body };
}

function evidenceFromKipoXml(body: string, q: string): { ok: true; text: string } | { ok: false; reason: string } {
  const trimmed = body.trim();
  if (!isLikelyKiprisXmlOrJson(body)) {
    return { ok: false, reason: "non_xml_json_response" };
  }
  const header = parseKipoHeader(trimmed);
  const success = /^Y$/i.test(header.successYN.trim());

  if (!success) {
    const msg = header.resultMsg || "API 오류";
    const code = header.resultCode || "?";
    const explain = `[KIPO 상표단어검색 API 응답 — kipo-api.kipi.or.kr]\n검색어: ${q}\n처리결과: 실패 (코드 ${code})\n메시지: ${msg}\n※ 공공데이터포털(data.go.kr)에서 본 서비스에 키가 승인·등록되었는지, 일일 트래픽 한도를 확인하세요.`;
    return { ok: true, text: explain };
  }

  if (trimmed.startsWith("{")) {
    const j = parseKiprisJson(body);
    const evidence = j || truncate(stripXmlish(body), 8000);
    return { ok: true, text: evidence };
  }
  return { ok: true, text: formatKiprisItemsFromXml(body, q) };
}

export async function fetchKiprisTrademarkEvidence(searchWord: string): Promise<KiprisFetchResult> {
  const key = resolveKiprisServiceKey();
  if (!key) return { ok: false, reason: "no_api_key" };
  const q = searchWord.trim().slice(0, 200);
  if (!q) return { ok: false, reason: "empty_query" };

  const urls: string[] = [];

  if (process.env.KIPRIS_TRADEMARK_SEARCH_URL?.trim()) {
    const custom = buildKiprisRequestUrl(q);
    if (custom) urls.push(custom.toString());
  } else {
    /** 공공데이터포털 KIPO API를 최우선 (plus.kipris 레거시 REST는 404 HTML인 경우 많음) */
    urls.push(buildKipoWordSearchUrl(q, "serviceKey").toString());
    urls.push(buildKipoWordSearchUrl(q, "ServiceKey").toString());

    const keyParam = process.env.KIPRIS_KEY_PARAM?.trim() || "ServiceKey";
    for (const path of KIPRIS_PATH_CANDIDATES) {
      for (const wordParam of ["searchString", "word"]) {
        const u = new URL(`${KIPRIS_LEGACY_REST_BASE}/${path}`);
        u.searchParams.set(keyParam, key);
        u.searchParams.set(wordParam, q);
        u.searchParams.set("numOfRows", "20");
        u.searchParams.set("pageNo", "1");
        urls.push(u.toString());
      }
    }
  }

  const uniqueUrls = [...new Set(urls)];

  let lastFail = "";
  for (const url of uniqueUrls) {
    const urlForLog = redactKiprisKeyInUrl(url);
    try {
      console.log("[KIPRIS] request:", urlForLog);
      const { status, body } = await fetchUrlText(url);
      console.log("[KIPRIS] response:", { status, bodyLength: body.length, bodyHead: body.slice(0, 400) });

      if (status >= 400) {
        lastFail = `HTTP ${status}`;
        console.warn("[KIPRIS] HTTP 오류 본문:", body.slice(0, 800));
        continue;
      }

      const trimmed = body.trim();
      if (isLikelyKiprisXmlOrJson(body)) {
        const hdr = parseKipoHeader(trimmed);
        if (!/^Y$/i.test(hdr.successYN.trim())) {
          console.warn("[KIPRIS] API 실패 헤더:", {
            successYN: hdr.successYN,
            resultCode: hdr.resultCode,
            resultMsg: hdr.resultMsg,
            url: urlForLog
          });
        }
      }

      const kipo = evidenceFromKipoXml(body, q);
      if (kipo.ok) {
        if (kipo.text.includes("처리결과: 실패") || kipo.text.includes("서비스 키")) {
          console.warn("[KIPRIS] 응답 텍스트에 오류 안내 포함:", { preview: kipo.text.slice(0, 500), url: urlForLog });
        }
        return { ok: true, text: kipo.text };
      }
      lastFail = kipo.reason;
      console.warn("[KIPRIS] XML/JSON이 아닌 응답(엔드포인트·명세 확인):", urlForLog.slice(0, 400));
    } catch (e) {
      lastFail = e instanceof Error ? e.message : String(e);
      console.warn("[KIPRIS] fetch 예외:", lastFail, "| url:", urlForLog);
    }
  }

  console.warn("[KIPRIS] 모든 후보 URL 실패:", lastFail);
  return {
    ok: false,
    reason: lastFail || "fetch_failed"
  };
}

/** 국가법령정보센터 open API — 법령 검색(JSON). OC·신청 절차: https://open.law.go.kr/ */
export async function fetchLawGoLawSnippet(query: string): Promise<string> {
  const oc = process.env.LAW_GO_OC?.trim();
  if (!oc || !query.trim()) return "";

  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "law");
  url.searchParams.set("type", "JSON");
  url.searchParams.set("nw", "1");
  url.searchParams.set("query", query.slice(0, 200));

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json, */*" },
      signal: AbortSignal.timeout(20_000)
    });
    const raw = await res.text();
    if (!res.ok) {
      return `[국가법령정보 응답 ${res.status}] ${truncate(raw, 800)}`;
    }
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const lawSearch = j.LawSearch as Record<string, unknown> | undefined;
      const items = (lawSearch?.law as unknown[]) ?? (j.items as unknown[]) ?? [];
      if (Array.isArray(items) && items.length > 0) {
        const lines = items.slice(0, 15).map((it, i) => {
          const row = it as Record<string, unknown>;
          const nm = String(row.법령명한글 ?? row.lawName ?? row.법령명 ?? row.name ?? "");
          const id = String(row.법령ID ?? row.lawId ?? "");
          return `${i + 1}. ${nm}${id ? ` (ID ${id})` : ""}`;
        });
        return truncate(lines.join("\n"), 5000);
      }
      return truncate(JSON.stringify(j).slice(0, 4000), 4000);
    } catch {
      return truncate(raw, 5000);
    }
  } catch (e) {
    return `[국가법령정보 호출 실패] ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function buildExternalNamingReferences(opts: {
  mode: "generate" | "audit";
  auditName: string;
  namingIntent: string;
  requestText: string;
}): Promise<string> {
  const blocks: string[] = [];

  const q =
    opts.mode === "audit"
      ? opts.auditName.trim() || opts.requestText.trim().slice(0, 120)
      : opts.requestText.trim().slice(0, 120);

  const lawQuery =
    opts.mode === "audit"
      ? `${opts.auditName.trim() || "상표"} ${opts.namingIntent.trim()}`.trim().slice(0, 200) || "상표법"
      : `${opts.requestText.trim().slice(0, 100)}` || "상표법";

  let kiprisBlock = "";
  if (opts.mode === "audit") {
    const searchWord = q || opts.namingIntent.trim().slice(0, 80);
    const k = await fetchKiprisTrademarkEvidence(searchWord);
    if (k.ok) {
      kiprisBlock = `[상표 검색 근거 자료 — KIPRIS/KIPO 상표 API]\n검색어: ${searchWord}\n\n${k.text}`;
    } else if (resolveKiprisServiceKey()) {
      kiprisBlock = `[KIPRIS/KIPO 상표 API]\n상표 XML/JSON을 받지 못했습니다. 공공데이터포털(data.go.kr)에서 발급한 serviceKey인지, KIPRIS_TRADEMARK_SEARCH_URL(또는 KIPRIS_OPENAPI_BASE)를 확인하세요. (${k.reason})`;
    }
  }

  const law = await fetchLawGoLawSnippet(lawQuery);

  if (kiprisBlock) blocks.push(kiprisBlock);
  if (law) {
    blocks.push(`[국가법령정보센터(open.law.go.kr) 법령 검색 참고 — 질의: ${lawQuery}]\n${law}`);
  }

  return blocks.join("\n\n");
}
