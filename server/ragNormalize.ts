/**
 * 승인된 run을 RAG에 색인하기 전 type별 표준 MD 양식으로 정제합니다.
 * 지원 타입: naming_audit, naming_generate, inspection, design_editor_text_suggestion, simply_heart.
 * 그 외 타입은 outputText/outputJson 폴백을 그대로 반환합니다.
 */

console.log("[ragNormalize] loaded");

type AnyRec = Record<string, unknown>;

const GUIDELINE_LABELS: Record<string, string> = {
  "uplus-brand-guideline": "U+ 브랜드 가이드라인",
  "uplus-vi-guideline": "U+ VI 가이드라인",
  "design-editor-brand-guideline": "LG U+ B2C Brand Guidelines (디자인 검수·교정)",
  "simply-uplus-guideline": "Simply U+ 가이드라인",
  "simply-uplus-job-guide": "직무별 Simply U+ 실행 가이드",
};

function asObj(v: unknown): AnyRec {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as AnyRec;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("{")) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as AnyRec;
      } catch {
        // ignore
      }
    }
  }
  return {};
}

function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
  }
  return [];
}

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function numStr(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.round(v));
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return String(Math.round(Number(v)));
  return "";
}

function severityKor(sev: string): string {
  const v = sev.toLowerCase();
  if (v === "high" || v === "높음") return "높음";
  if (v === "low" || v === "낮음") return "낮음";
  return "중간";
}

function guidelineLabel(id: string | null | undefined): string {
  const trimmed = (id ?? "").toString().trim();
  if (!trimmed) return "";
  return GUIDELINE_LABELS[trimmed] ?? trimmed;
}

function joinNonEmpty(parts: Array<string | null | undefined>, sep = ", "): string {
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(sep);
}

function trimTrailingBlankLines(lines: string[]): string[] {
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

export function normalizeRunForRag(args: {
  type: string;
  guidelineId?: string | null;
  outputJson?: unknown;
  outputText?: string | null;
  inputJson?: unknown;
  inputText?: string | null;
}): string {
  const t = (args.type ?? "").toString().trim();
  const out = asObj(args.outputJson);
  const inp = asObj(args.inputJson);

  switch (t) {
    case "naming_audit":
      return formatNamingAudit({ out, inp, guidelineId: args.guidelineId ?? null });
    case "naming_generate":
      return formatNamingGenerate({ out, inp, guidelineId: args.guidelineId ?? null });
    case "inspection":
      return formatInspection({ out, inp, guidelineId: args.guidelineId ?? null });
    case "design_editor_text_suggestion":
      return formatDesignEditorTextSuggestion({ out, inp, guidelineId: args.guidelineId ?? null });
    case "simply_heart":
      return formatSimplyHeart({ out, inp, guidelineId: args.guidelineId ?? null });
    default: {
      const fallback = text(args.outputText);
      if (fallback) return fallback;
      if (Object.keys(out).length) return JSON.stringify(out);
      return "";
    }
  }
}

function formatSimplyHeart(p: { out: AnyRec; inp: AnyRec; guidelineId: string | null }): string {
  const u = text(p.out.unified);
  if (u) {
    return trimTrailingBlankLines([
      "# 심플리 가이드 (통합 분석)",
      `- 가이드라인: ${guidelineLabel(p.guidelineId ?? text((p.inp as AnyRec).guidelineId))}`,
      "",
      u,
    ]).join("\n");
  }
  const lines: string[] = [
    "# 심플리 가이드 (통합·레거시)",
    `- 가이드라인: ${guidelineLabel(p.guidelineId ?? text((p.inp as AnyRec).guidelineId))}`,
    "",
    "## 요청내용 분석 (문제 진단)",
    text(p.out.step1),
    "",
    "## Do & Don't",
    text(p.out.step3),
    "",
    "## Simply U+ 솔루션",
    text(p.out.step4),
  ];
  if (text(p.out.step2)) {
    lines.push("", "## (레거시) 공감 포인트", text(p.out.step2));
  }
  return trimTrailingBlankLines(lines).join("\n");
}

function formatNamingAudit(p: { out: AnyRec; inp: AnyRec; guidelineId: string | null }): string {
  const o = p.out;
  const i = p.inp;
  const hierarchy = asObj(o.hierarchy);
  const trademark = asObj(o.trademark);
  const copyright = asObj(o.copyright);
  const detail = asObj(o.detailLogic);
  const checklist = asArr(hierarchy.checklist).map(text).filter(Boolean);
  const conflicts = asArr(trademark.conflicts)
    .map((c) => {
      const r = asObj(c);
      const name = text(r.name);
      const cls = text(r.class);
      const simRaw = typeof r.similarity === "number" ? r.similarity : Number(r.similarity);
      let simStr = "";
      if (Number.isFinite(simRaw)) {
        const pct = simRaw <= 1 ? simRaw * 100 : simRaw;
        simStr = `유사도 ${Math.round(pct)}%`;
      }
      return joinNonEmpty([name, cls && `class ${cls}`, simStr], " · ");
    })
    .filter(Boolean);
  const risks = asArr(copyright.risks)
    .map((r) => {
      const x = asObj(r);
      const sev = severityKor(text(x.severity));
      const ty = text(x.type);
      const desc = text(x.description);
      return joinNonEmpty([`[${sev}]`, ty, desc], " ");
    })
    .filter(Boolean);
  const additional = asArr(o.additionalNamingSuggestions).map(text).filter(Boolean);
  const suggested = additional.length ? additional : asArr(o.suggestedNames).map(text).filter(Boolean);

  const lines: string[] = [];
  lines.push("[type: naming_audit]", "");
  lines.push("## 네이밍 검수 결과", "");

  lines.push("### 기본 정보");
  lines.push(`- 검수 대상: ${text(i.auditName)}`);
  lines.push(`- 유형: 네이밍 검수 (naming_audit)`);
  lines.push(`- 가이드라인: ${guidelineLabel(p.guidelineId ?? text(i.guidelineId))}`);
  lines.push(`- 최종 판정: 승인`);
  lines.push(`- 종합 점수: ${numStr(o.overallScore)} (창의30%·대중30%·직관20%·확장20% 가중, 계층·적법 미포함)`);
  lines.push("");

  lines.push("### 점수 상세 (순서: 계층→적법→창의→대중→직관→확장)");
  lines.push(`- 브랜드 위계: ${numStr(o.hierarchyScore)}`);
  lines.push(`- 적법성(법적+사회적): ${numStr(o.legalityScore)}`);
  lines.push(`- 독창성: ${numStr(o.originalityDimensionScore)}`);
  lines.push(`- 대중성: ${numStr(o.publicAppealScore)}`);
  lines.push(`- 직관(발음): ${numStr(o.pronunciationScore)}`);
  lines.push(`- 확장성: ${numStr(o.scalabilityScore)}`);
  lines.push(`- (참고) 발음/언어: ${numStr(o.pronunciationLanguageScore)}`);
  lines.push(`- (참고) 상표: ${numStr(o.trademarkScore)}`);
  lines.push(`- (참고) 저작권: ${numStr(o.copyrightScore)}`);
  lines.push("");

  lines.push("### 브랜드 위계 평가");
  lines.push(`- 판정: ${text(hierarchy.status)}`);
  lines.push(`- 브랜드 위계 준수 여부: ${text(hierarchy.message)}`);
  lines.push(`- 작명 룰 준수 여부: ${text(hierarchy.details)}`);
  lines.push(`- 네이밍 방향: ${checklist.join(" / ")}`);
  lines.push("");

  lines.push("### 독창성 평가");
  lines.push(`- 기획 의도 표현: ${text(detail.originality) || text(i.namingIntent)}`);
  lines.push(`- 독창성 수준: ${numStr(copyright.originality) || numStr(o.originalityDimensionScore)}`);
  lines.push(`- 이미지 적합성: `);
  lines.push("");

  lines.push("### 발음 평가");
  lines.push(`- 한국어 발음: ${text(detail.pronunciationLanguage)}`);
  lines.push(`- 어감/뉘앙스: `);
  lines.push(`- 외래어 결합: `);
  lines.push(`- 외국어 발음: `);
  lines.push("");

  lines.push("### 대중성 평가");
  lines.push(`- 사회·문화적 수용: ${text(detail.publicAppeal)}`);
  lines.push("");

  lines.push("### 확장성 평가");
  lines.push(`- 브랜드 생태계·파생: ${text(detail.scalability)}`);
  lines.push("");

  lines.push("### 상표 리스크");
  lines.push(`- 리스크 수준: ${text(trademark.risk)}`);
  lines.push(`- 유사 상표: ${conflicts.join("; ")}`);
  lines.push(`- 상표 등록 가능성: ${numStr(o.trademarkScore)}`);
  lines.push(`- 실무 사용 가능 여부: ${text(trademark.recommendation)}`);
  lines.push("");

  lines.push("### 적법성 (법적 적법성 + 사회적 이슈·민감도)");
  lines.push(`- 상표법·사회적 민감도: ${text(detail.legality)}`);
  lines.push(`- 법적 제한/제재 사례: `);
  lines.push(`- 저작권법: ${text(copyright.verdict)}`);
  lines.push(`- 활용 방향: `);
  lines.push("");

  lines.push("### 저작권 평가");
  lines.push(`- 침해 가능성: ${risks.join("; ")}`);
  lines.push(`- 창작성: ${numStr(copyright.originality)}`);
  lines.push("");

  lines.push("### 최종 요약");
  lines.push(text(o.finalSummary));
  lines.push("");

  lines.push("### 추가 제안 네이밍");
  if (suggested.length) {
    for (const name of suggested) lines.push(`- ${name}`);
  }
  lines.push("");

  lines.push("### 적용 원칙");
  lines.push(`- 브랜드 네이밍 원칙: U+ 마스터 브랜드와 직접 결합 없이 독립 네이밍을 유지한다.`);
  lines.push(`- 요금제 명칭 원칙: B2C 모바일 종속 요금제 작명 룰을 따라 일관된 시리즈를 구성한다.`);
  lines.push(`- 발음 원칙: 한국어와 영어 발음이 모두 자연스럽고 단순해야 한다.`);
  lines.push(`- 상표 원칙: 동일·유사 상표 충돌을 회피하고 등록 가능성을 우선한다.`);
  lines.push(`- 종합 산정: 창의·대중·직관·확장 가중합(30/30/20/20). 브랜드 위계·적법성(법적+사회적)은 Pass/Fail·NO-GO만.`);

  return trimTrailingBlankLines(lines).join("\n");
}

function formatNamingGenerate(p: { out: AnyRec; inp: AnyRec; guidelineId: string | null }): string {
  const o = p.out;
  const i = p.inp;

  const proposals = asArr(o.namingProposals);
  const tierAlts = asArr(o.tierNamingAlternatives);

  const allNames: string[] = [];
  type ProposalRow = {
    name: string;
    rationale: string;
    detail: AnyRec;
    hierarchyScore: string;
    originalityScore: string;
    pronunciationScore: string;
    legalityScore: string;
    publicAppealScore: string;
    scalabilityScore: string;
  };
  const entries: ProposalRow[] = [];

  if (proposals.length) {
    for (const pr of proposals) {
      const r = asObj(pr);
      const name = text(r.name);
      if (!name) continue;
      allNames.push(name);
      entries.push({
        name,
        rationale: text(r.rationale),
        detail: asObj(r.proposalDetailLogic),
        hierarchyScore: numStr(r.hierarchyScore),
        originalityScore: numStr(r.originalityDimensionScore),
        pronunciationScore: numStr(r.pronunciationScore),
        legalityScore: numStr(r.legalityScore),
        publicAppealScore: numStr(r.publicAppealScore),
        scalabilityScore: numStr(r.scalabilityScore),
      });
    }
  } else if (tierAlts.length) {
    for (const a of tierAlts) {
      const alt = asObj(a);
      const pkg = asObj(alt.tierPackageEvaluation);
      const detail = asObj(pkg.proposalDetailLogic);
      const steps = asArr(alt.tierSteps);
      const storyline = text(alt.storyline);
      for (const st of steps) {
        const stp = asObj(st);
        const name = text(stp.name);
        if (!name) continue;
        const tierLabel = text(stp.tierLabel);
        const labeled = tierLabel ? `${name} (${tierLabel})` : name;
        allNames.push(labeled);
        entries.push({
          name: labeled,
          rationale: joinNonEmpty([storyline && `[스토리라인] ${storyline}`, text(stp.rationale)], "\n"),
          detail,
          hierarchyScore: numStr(pkg.hierarchyScore),
          originalityScore: numStr(pkg.originalityDimensionScore),
          pronunciationScore: numStr(pkg.pronunciationScore),
          legalityScore: numStr(pkg.legalityScore),
          publicAppealScore: numStr(pkg.publicAppealScore),
          scalabilityScore: numStr(pkg.scalabilityScore),
        });
      }
    }
  }

  if (!allNames.length) {
    asArr(o.suggestedNames)
      .map(text)
      .filter(Boolean)
      .forEach((nm) => allNames.push(nm));
  }

  const lines: string[] = [];
  lines.push("[type: naming_generate]", "");
  lines.push("## 네이밍 생성 결과", "");

  lines.push("### 기본 정보");
  lines.push(`- 유형: 네이밍 생성 (naming_generate)`);
  lines.push(`- 가이드라인: ${guidelineLabel(p.guidelineId ?? text(i.guidelineId))}`);
  lines.push(`- 최종 판정: 승인`);
  lines.push(`- 추천 네이밍 목록: ${allNames.join(", ")}`);
  lines.push("");

  lines.push("### 제안 네이밍별 평가", "");
  if (entries.length) {
    for (const e of entries) {
      lines.push(`#### ${e.name}`);
      lines.push(`- 핵심 의미: ${e.rationale}`);
      lines.push(`- 브랜드 위계: ${text(e.detail.hierarchy)}`);
      lines.push(`- 적법성(법적+사회적): ${text(e.detail.legality)}`);
      lines.push(`- 독창성: ${text(e.detail.originality)}`);
      lines.push(`- 대중성: ${text(e.detail.publicAppeal)}`);
      lines.push(`- 직관(발음): ${text(e.detail.pronunciationLanguage)}`);
      lines.push(`- 확장성: ${text(e.detail.scalability)}`);
      lines.push(`- 위계 점수: ${e.hierarchyScore}`);
      lines.push(`- 법적 점수: ${e.legalityScore}`);
      lines.push(`- 독창성 점수: ${e.originalityScore}`);
      lines.push(`- 대중성 점수: ${e.publicAppealScore}`);
      lines.push(`- 직관 점수: ${e.pronunciationScore}`);
      lines.push(`- 확장성 점수: ${e.scalabilityScore}`);
      lines.push("");
    }
  }

  lines.push("### 공통 적용 원칙");
  lines.push(`- U+ 마스터 브랜드 직접 결합 없이 독립 네이밍`);
  lines.push(`- B2C 모바일 종속 요금제 작명 룰 준수`);
  lines.push(`- 프리미엄/혜택 중심 직관적 명칭`);
  lines.push(`- 한국어/영어 발음 자연스러움 필수`);
  lines.push(`- 법적 리스크 낮은 명칭 선별`);
  lines.push(`- 종합 산정: 창의30%·대중30%·직관20%·확장20% (계층·적법은 종합 미포함)`);

  return trimTrailingBlankLines(lines).join("\n");
}

function formatInspection(p: { out: AnyRec; inp: AnyRec; guidelineId: string | null }): string {
  const o = p.out;
  const i = p.inp;
  const violations = asArr(o.violations);

  const lines: string[] = [];
  lines.push("[type: inspection]", "");
  lines.push("## 디자인 검수 결과", "");

  lines.push("### 기본 정보");
  lines.push(`- 유형: 디자인 검수 (inspection)`);
  lines.push(`- 가이드라인: ${guidelineLabel(p.guidelineId ?? text(i.guidelineId))}`);
  lines.push(`- 종합 점수: ${numStr(o.score)}`);
  lines.push(`- 최종 판정: 승인`);
  lines.push("");

  lines.push("### 위반 사항");
  if (violations.length === 0) {
    lines.push("위반 없음");
  } else {
    violations.forEach((v, idx) => {
      const r = asObj(v);
      const cat = text(r.category) || "(미분류)";
      const sev = severityKor(text(r.severity));
      const issue = text(r.issue);
      lines.push("");
      lines.push(`#### 위반 ${idx + 1} — ${cat} (심각도: ${sev})`);
      lines.push(`- 카테고리: ${cat}`);
      lines.push(`- 문제: ${issue}`);
      lines.push(`- 원칙: `);
      lines.push(`- 위반 내용: ${issue}`);
    });
  }
  lines.push("");

  lines.push("### 전체 요약");
  lines.push(text(o.overallSummary));
  lines.push("");

  lines.push("### 수정 내용");
  const revisionParts = [text(o.revisionCaption), text(o.revisionNote)].filter(Boolean);
  if (revisionParts.length) lines.push(revisionParts.join("\n\n"));
  lines.push("");

  lines.push("### 적용 원칙");
  lines.push(`- 로고 원칙: U+ 로고 보호 영역과 색상 기준을 준수한다.`);
  lines.push(`- 타이포그래피 원칙: U+ Simple 체계의 위계와 자간·행간 권장값을 따른다.`);
  lines.push(`- 레이아웃 원칙: 여백·정렬·그리드 규칙을 일관되게 유지한다.`);

  // 메타: 사업영역/디자인 그룹/유형/추가 메모가 있으면 보조 컨텍스트로 첨부 (RAG 검색 품질 향상용)
  const businessCategory = text(i.businessCategory);
  const designGroup = text(i.designGroup);
  const designType = text(i.designType);
  const additionalNotes = text(i.additionalNotes);
  const meta = [
    businessCategory && `사업영역: ${businessCategory}`,
    designGroup && `디자인 그룹: ${designGroup}`,
    designType && `디자인 유형: ${designType}`,
    additionalNotes && `추가 메모: ${additionalNotes}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (meta) {
    lines.push("");
    lines.push("### 검수 메타");
    lines.push(meta);
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function formatDesignEditorTextSuggestion(p: { out: AnyRec; inp: AnyRec; guidelineId: string | null }): string {
  const o = p.out;
  const i = p.inp;
  const main = text(o.mainTitle);
  const emp = text(o.emphasizedTitle);
  const sub1 = text(o.subtitleLine);
  const sub2 = text(o.subtitleLine2);
  const sub3 = text(o.subtitleLine3);
  const body1 = text(o.bodyText);
  const body2 = text(o.bodyText2);
  const body3 = text(o.bodyText3);

  const lines: string[] = [];
  lines.push("[type: design_editor_text_suggestion]", "");
  lines.push("## 디자인 텍스트 제안 결과", "");

  lines.push("### 기본 정보");
  lines.push(`- 유형: 디자인 텍스트 제안 (design_editor_text_suggestion)`);
  lines.push(`- 가이드라인: ${guidelineLabel(p.guidelineId ?? text(i.guidelineId))}`);
  lines.push(`- 템플릿: ${text(i.templateLabel)}`);
  lines.push(`- 최종 판정: 승인`);
  lines.push("");

  lines.push("### 제안 텍스트");
  if (main) {
    lines.push("");
    lines.push("#### 메인 타이틀");
    lines.push(`- 내용: ${main}`);
  }
  if (emp) {
    lines.push("");
    lines.push("#### 강조 타이틀");
    lines.push(`- 내용: ${emp}`);
  }
  if (sub1 || sub2 || sub3) {
    lines.push("");
    lines.push("#### 부제");
    if (sub1) lines.push(`- 부제 1: ${sub1}`);
    if (sub2) lines.push(`- 부제 2: ${sub2}`);
    if (sub3) lines.push(`- 부제 3: ${sub3}`);
  }
  if (body1 || body2 || body3) {
    lines.push("");
    lines.push("#### 본문");
    if (body1) lines.push(`- 본문 1: ${body1}`);
    if (body2) lines.push(`- 본문 2: ${body2}`);
    if (body3) lines.push(`- 본문 3: ${body3}`);
  }
  lines.push("");

  lines.push("### 적용 원칙");
  lines.push(`- 메인 타이틀: 핵심 메시지 간결하게, 브랜드 톤 유지`);
  lines.push(`- 부제: 보조 정보 명확하게 전달`);
  lines.push(`- 본문: 상세 내용 자연스러운 문체로 작성`);

  return trimTrailingBlankLines(lines).join("\n");
}

