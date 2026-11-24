/**
 * One-shot: seed VI-based draft guides for common + all deliverables, then publish.
 * Usage: node scripts/seed-vi-deliverable-guides.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    })
);

const sb = createClient(env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, ""), env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SRC = "U+ VI 가이드라인 요약(초안)";

function rule(id, element, statement, check, severity, extra = {}) {
  return { id, element, statement, check, severity, source: SRC, ...extra };
}

/** Shared VI core — duplicated into each pack as requested */
function coreRules(prefix) {
  const p = (id) => `${prefix}_${id}`;
  return [
    rule(
      p("logo_priority"),
      "logo",
      "로고는 Bright Magenta를 최우선으로 적용한다. 가시성이 부족할 때만 U+ White/Black 로고를 사용한다.",
      "vision",
      "critical"
    ),
    rule(
      p("logo_clearspace"),
      "logo",
      "로고 주변 사방 여백을 최소 0.5X(로고 높이의 절반) 이상 확보한다. 다른 그래픽·텍스트가 침범하지 않는다.",
      "vision",
      "critical"
    ),
    rule(
      p("logo_minsize"),
      "logo",
      "로고 최소 크기를 지킨다. 디지털 20px / 인쇄 3mm 미만으로 축소하지 않는다.",
      "code",
      "major",
      { params: { digital_min_px: 20, print_min_mm: 3 } }
    ),
    rule(
      p("logo_nodistort"),
      "logo",
      "로고 비율·형태 변형, 회전, 윤곽선, 그라데이션, 그림자, 규정 외 색상 적용을 금지한다.",
      "vision",
      "critical"
    ),
    rule(
      p("color_magenta_area"),
      "color",
      "Bright Magenta(#F43182 계열)는 시각 피로를 줄이기 위해 전체 면적의 약 5% 미만으로 사용한다.",
      "judgment",
      "major",
      { params: { max_area_pct: 5, hex: "#F43182" } }
    ),
    rule(
      p("color_no_pure_black"),
      "color",
      "완전 검정(#000000 / K100)을 사용하지 않는다. U+ Black 및 가이드 그레이 스케일로 대체한다.",
      "code",
      "critical",
      { params: { forbidden: ["#000000"] } }
    ),
    rule(
      p("color_base_palette"),
      "color",
      "기본 컬러는 U+ Black / Gray / Light Gray / White 조합을 중심으로 구성한다.",
      "judgment",
      "major"
    ),
    rule(
      p("typo_headline"),
      "typo",
      "헤드라인 영문은 Geist, 국문은 ABC Favorit Hangul을 사용한다.",
      "judgment",
      "major"
    ),
    rule(
      p("typo_numbers"),
      "typo",
      "국문 헤드라인의 숫자·문장부호는 Pretendard로 적용한다.",
      "judgment",
      "minor"
    ),
    rule(
      p("typo_body"),
      "typo",
      "본문(Body)은 Pretendard를 사용한다.",
      "judgment",
      "major"
    ),
    rule(
      p("typo_color"),
      "typo",
      "텍스트 컬러는 Black/White를 기본으로 한다. Light Gray·파스텔 보조색을 본문/헤드라인 텍스트에 쓰지 않는다.",
      "vision",
      "major"
    ),
    rule(
      p("layout_whitespace"),
      "layout",
      "불필요한 장식을 줄이고 충분한 여백을 확보해 심플한 레이아웃을 유지한다.",
      "judgment",
      "major"
    ),
    rule(
      p("motif_shape"),
      "motif",
      "Circle / Tube / Window 모티프 사용 시 가이드의 비율·곡률을 지키며 임의 변형하지 않는다.",
      "vision",
      "major"
    ),
    rule(
      p("motif_layer_limit"),
      "motif",
      "모티프를 겹쳐 쓸 경우 최대 4개 이하로 제한한다.",
      "judgment",
      "minor",
      { params: { max_layers: 4 } }
    ),
    rule(
      p("contrast"),
      "layout",
      "배경과 텍스트의 명도·색상 대비를 충분히 확보해 가독성을 유지한다.",
      "vision",
      "critical"
    ),
    rule(
      p("no_heavy_fx"),
      "image",
      "정보 전달을 방해하는 과도한 그림자·입체·텍스처·장식을 지양한다.",
      "judgment",
      "major"
    ),
  ];
}

function pack(summary, focus, extraRules, instructions) {
  return {
    summary,
    rules: [...coreRules("vi"), ...extraRules],
    direction: {
      focus,
      strictness: "normal",
      ignore: [],
      instructions,
      feedback_style: "항목별로 pass/fail/na와 짧은 수정 가이드를 한국어로 제시",
    },
    examples: [
      {
        verdict: "pass",
        description: "로고 보호영역·대비·여백이 확보되고 Magenta가 포인트로만 쓰인 경우",
      },
      {
        verdict: "fail",
        description: "로고 왜곡/#000000 사용/텍스트 대비 부족/Magenta 면적 과다 중 하나라도 있는 경우",
      },
    ],
  };
}

const GUIDES = {
  common: pack(
    "전 제작물 공통 VI 검수 초안. Bright Magenta 로고 우선, 보호영역, 금지 변형, 5% Magenta, #000 금지, 타이포·여백·대비.",
    ["logo", "color", "typography", "whitespace", "contrast"],
    [
      rule(
        "common_brand_consistency",
        "other",
        "단일 화면/인쇄물 안에서 로고·컬러·타이포 체계가 일관되게 유지되는지 확인한다.",
        "judgment",
        "major"
      ),
    ],
    "공통 규칙은 모든 제작물 검수의 바닥 기준이다. 제작물별 규칙과 충돌 시 더 엄격한 쪽을 우선한다."
  ),

  poster: pack(
    "A1/A4 포스터용 초안. 원거리 가독성·인쇄 최소 로고·여백을 강조.",
    ["print", "logo", "readability", "margin"],
    [
      rule("poster_viewing", "layout", "원거리에서도 헤드라인·핵심 메시지가 한눈에 읽히도록 위계를 명확히 한다.", "judgment", "major"),
      rule("poster_edge_margin", "layout", "재단선·가장자리로부터 충분한 안전 여백을 확보한다.", "vision", "major"),
      rule("poster_logo_print", "logo", "인쇄물 로고는 최소 3mm 이상이며 보호영역을 침범하지 않는다.", "code", "critical"),
      rule("poster_image_quality", "image", "저해상도·과도한 왜곡 보정 이미지를 사용하지 않는다.", "vision", "major"),
    ],
    "포스터는 정지·원거리 시인성이 핵심. 장식보다 메시지·로고 가시성을 우선 검수한다."
  ),

  x_banner: pack(
    "X배너(세로형 스탠드) 초안. 상단 시선·세로 위계·하단 스탠드 간섭을 점검.",
    ["vertical", "hierarchy", "logo", "readability"],
    [
      rule("xbanner_top_message", "layout", "상단 1/3에 핵심 헤드라인·브랜드 식별 요소를 배치한다.", "judgment", "major"),
      rule("xbanner_stand_clear", "layout", "하단 스탠드/접힘 영역과 겹치지 않도록 중요 정보·로고를 올린다.", "vision", "critical"),
      rule("xbanner_vertical_gap", "layout", "세로 구간 간 여백을 확보해 정보가 빽빽하지 않게 한다.", "judgment", "major"),
      rule("xbanner_distance", "typo", "수 미터 거리에서도 헤드라인이 식별 가능한 크기·대비를 유지한다.", "vision", "major"),
    ],
    "세로형 매대 시인성 기준으로 검수. 하단 하드웨어 가림을 fail로 본다."
  ),

  placard: pack(
    "현수막(와이드 가로) 초안. 장거리·짧은 메시지·좌우 여백을 강조.",
    ["wide", "distance", "short-copy", "logo"],
    [
      rule("placard_short_copy", "text", "한 줄~두 줄 중심의 짧은 메시지로 구성하고 장문 본문을 지양한다.", "judgment", "major"),
      rule("placard_lr_margin", "layout", "좌우 끝단 재단/고정 영역을 고려한 안전 여백을 확보한다.", "vision", "major"),
      rule("placard_logo_side", "logo", "로고는 한쪽에 안정적으로 두고 보호영역을 유지한다.", "vision", "critical"),
      rule("placard_contrast_outdoor", "layout", "야외·원거리 대비를 위해 저대비 파스텔 텍스트를 쓰지 않는다.", "vision", "critical"),
    ],
    "와이드 현수막은 짧은 카피·강한 대비·로고 안정 배치를 우선한다."
  ),

  web_banner: pack(
    "웹 배너(336x280, Hero 등) 초안. 크롭 세이프·CTA·로고 최소 픽셀을 점검.",
    ["digital", "cta", "crop-safe", "logo"],
    [
      rule("web_logo_px", "logo", "디지털 로고는 높이 20px 미만으로 축소하지 않는다.", "code", "critical"),
      rule("web_crop_safe", "layout", "중요 텍스트·로고·CTA가 가장자리 크롭에 잘리지 않게 안전 영역을 둔다.", "vision", "major"),
      rule("web_cta_contrast", "layout", "CTA/핵심 버튼·문구는 배경 대비를 명확히 한다.", "vision", "major"),
      rule("web_load_clarity", "image", "작은 배너에서도 식별 가능한 단순 구도를 유지하고 세부 패턴 과다를 피한다.", "judgment", "minor"),
      rule("web_hero_focus", "layout", "Hero 배너는 한 가지 핵심 메시지 위주로 구성한다.", "judgment", "major"),
    ],
    "온라인 배너는 작은 면적·크롭을 전제로 로고·CTA 가시성을 엄격히 본다."
  ),

  sns: pack(
    "SNS(피드/스토리/커버 등) 초안. 플랫폼 UI 세이프존·정사각/세로 비율을 고려.",
    ["social", "safe-zone", "logo", "contrast"],
    [
      rule("sns_safe_zone", "layout", "스토리/릴스 등 UI(상단·하단 컨트롤)와 겹치지 않도록 세이프존 안에 핵심 요소를 둔다.", "vision", "critical"),
      rule("sns_ratio", "layout", "템플릿 비율(1:1, 9:16, 커버 등)에 맞게 중요 피사체·텍스트가 중앙 안전하게 배치되었는지 확인한다.", "judgment", "major"),
      rule("sns_text_amount", "text", "피드/스토리에서 텍스트 과밀을 피하고 핵심 문구 위주로 구성한다.", "judgment", "major"),
      rule("sns_logo_corner", "logo", "로고는 코너에 두더라도 보호영역·최소 크기를 지킨다.", "vision", "critical"),
      rule("sns_thumb", "image", "썸네일/축소 미리보기에서도 브랜드·메시지가 식별 가능한지 확인한다.", "judgment", "minor"),
    ],
    "플랫폼 UI 가림과 축소 미리보기 가독성을 중점 검수한다."
  ),

  mms: pack(
    "MMS/RCS(568x338) 초안. 소형 캔버스·짧은 카피·헤더 이미지 가독성.",
    ["rcs", "small-canvas", "short-copy", "logo"],
    [
      rule("rcs_canvas", "layout", "568×338 소형 화면에 맞춰 요소 수를 최소화한다.", "judgment", "major"),
      rule("rcs_copy_short", "text", "긴 문장·다단 텍스트를 피하고 짧은 헤드/서브 위주로 구성한다.", "judgment", "critical"),
      rule("rcs_logo_size", "logo", "작은 화면에서도 로고가 식별되며 20px 미만으로 줄이지 않는다.", "code", "critical"),
      rule("rcs_illustration", "image", "일러스트/픽토는 VI 톤(마젠타 포인트·과도한 장식 금지)을 유지한다.", "judgment", "major"),
      rule("rcs_edge", "layout", "가장자리 잘림을 고려해 중요 요소를 안쪽으로 배치한다.", "vision", "major"),
    ],
    "RCS는 정보 과부하에 취약. 짧은 카피·명확한 한 초점으로 검수한다."
  ),

  presentation: pack(
    "프레젠테이션(16:9/4:3) 초안. 슬라이드 여백·타이틀 위계·가독성.",
    ["slide", "hierarchy", "margin", "typo"],
    [
      rule("slide_margin", "layout", "슬라이드 가장자리에 충분한 여백을 두고 요소가 붙지 않게 한다.", "vision", "major"),
      rule("slide_title_hierarchy", "typo", "타이틀·서브·본문 위계가 명확하고 한 슬라이드에 메시지가 과다하지 않다.", "judgment", "major"),
      rule("slide_logo", "logo", "로고가 들어갈 경우 보호영역·최소 크기를 지키며 장식적으로 왜곡하지 않는다.", "vision", "critical"),
      rule("slide_chart_contrast", "layout", "도표·텍스트는 배경과 충분한 대비를 유지한다.", "vision", "major"),
      rule("slide_clutter", "layout", "불필요한 장식·그림자·텍스처로 본문 가독을 해치지 않는다.", "judgment", "minor"),
    ],
    "발표 화면 가독성·위계를 우선. 장식보다 정보 전달을 본다."
  ),

  office_web: pack(
    "웹 사내공지(3:4) 초안. 정보 명확성·위계·접근성 대비.",
    ["internal", "clarity", "hierarchy", "contrast"],
    [
      rule("office_info_hierarchy", "layout", "제목·일시·본문·행동 유도 등 정보 위계가 위에서 아래로 명확하다.", "judgment", "major"),
      rule("office_readability", "typo", "본문 가독성을 위해 충분한 크기·행간·대비를 유지한다.", "vision", "critical"),
      rule("office_logo", "logo", "사내 채널이라도 VI 로고 규칙(보호영역·색·변형 금지)을 동일하게 적용한다.", "vision", "critical"),
      rule("office_no_clutter", "layout", "장식보다 공지 내용이 우선되도록 여백을 확보한다.", "judgment", "major"),
    ],
    "사내공지는 정보 전달 정확성이 핵심. 대비·위계를 엄격히 본다."
  ),

  safety_caution: pack(
    "안전&주의 안내물 초안. 고대비·경고 위계·오인 방지. VI와 안전 가독성의 균형.",
    ["safety", "high-contrast", "hierarchy", "clarity"],
    [
      rule("safety_contrast", "layout", "경고/주의 문구는 최고 수준의 대비로 즉시 인지 가능하게 한다.", "vision", "critical"),
      rule("safety_hierarchy", "layout", "위험 수준(금지/주의/안내) 위계가 색·아이콘·타이포로 구분된다.", "judgment", "critical"),
      rule("safety_icon_clear", "icon", "안전 아이콘·픽토는 왜곡 없이 명확하고 텍스트와 겹치지 않는다.", "vision", "major"),
      rule("safety_logo_secondary", "logo", "브랜드 로고는 안전 메시지보다 우선하지 않되, 사용 시 VI 보호영역을 지킨다.", "judgment", "major"),
      rule("safety_no_pastel_text", "typo", "저대비 파스텔 텍스트로 주의 문구를 작성하지 않는다.", "vision", "critical"),
    ],
    "안전 정보는 VI 미학보다 가독·오인 방지를 우선한다. 대비 부족은 critical fail."
  ),
};

function hashContent(content) {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function nextVersion(deliverableId) {
  let q = sb.from("deliverable_guides").select("version").order("version", { ascending: false }).limit(1);
  q = deliverableId === null ? q.is("deliverable_id", null) : q.eq("deliverable_id", deliverableId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const max = data?.[0]?.version;
  return typeof max === "number" ? max + 1 : 1;
}

async function upsertAndPublish({ deliverableId, key, content }) {
  // Prefer updating existing draft if present; else insert new draft version.
  let dq = sb.from("deliverable_guides").select("id,version,status").eq("status", "draft").limit(1);
  dq = deliverableId === null ? dq.is("deliverable_id", null) : dq.eq("deliverable_id", deliverableId);
  const { data: drafts, error: dErr } = await dq;
  if (dErr) throw new Error(dErr.message);

  let guideId;
  if (drafts?.[0]?.id) {
    const { data, error } = await sb
      .from("deliverable_guides")
      .update({
        content,
        content_hash: hashContent(content),
        note: `VI seed draft (${key}) — review & edit in Admin`,
      })
      .eq("id", drafts[0].id)
      .select("id,version")
      .single();
    if (error) throw new Error(error.message);
    guideId = data.id;
    console.log(`updated draft ${key} v${data.version} ${guideId}`);
  } else {
    const version = await nextVersion(deliverableId);
    const { data, error } = await sb
      .from("deliverable_guides")
      .insert({
        deliverable_id: deliverableId,
        version,
        status: "draft",
        content,
        content_hash: hashContent(content),
        note: `VI seed draft (${key}) — review & edit in Admin`,
        published_at: null,
      })
      .select("id,version")
      .single();
    if (error) throw new Error(error.message);
    guideId = data.id;
    console.log(`created draft ${key} v${data.version} ${guideId}`);
  }

  const { data: pub, error: pErr } = await sb.rpc("publish_deliverable_guide", { p_guide_id: guideId });
  if (pErr) throw new Error(`publish ${key}: ${pErr.message}`);
  console.log(`published ${key}`, pub ?? "ok");
}

async function main() {
  const { data: deliverables, error } = await sb
    .from("deliverables")
    .select("id,key,name")
    .eq("status", "active")
    .order("sort_order");
  if (error) throw new Error(error.message);

  await upsertAndPublish({ deliverableId: null, key: "common", content: GUIDES.common });

  for (const d of deliverables) {
    const content = GUIDES[d.key];
    if (!content) {
      console.warn(`skip ${d.key}: no seed pack`);
      continue;
    }
    await upsertAndPublish({ deliverableId: d.id, key: d.key, content });
  }

  // verify
  const { data: active } = await sb
    .from("deliverable_guides")
    .select("id,deliverable_id,version,status,content")
    .eq("status", "active");
  for (const g of active ?? []) {
    const rules = g.content?.rules?.length ?? 0;
    const label = g.deliverable_id ? deliverables.find((d) => d.id === g.deliverable_id)?.key : "common";
    console.log(`ACTIVE ${label} v${g.version} rules=${rules}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
