import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

import {
  buildAuditCategoryGeminiPromptSection,
  buildNamingFriendlyStorylineToneBlock,
  buildTierStorylineToneBlock
} from "../namingCategoryGeminiDirectives.js";
import {
  buildAdditionalNamingSuggestionBlockFromAuditRaw,
  buildNamingGenerationRuleBlockFromAuditRaw
} from "../../shared/categoryNamingRules.js";
import {
  getKey,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";

/** 적법성: 국가법령정보 API + Gemini 사회적 이슈·민감도 (Detail은 두 소제목 필수) */
const NAMING_LEGALITY_SCORE_DESC =
  "적법성 0~100 (법적 적법성 + 사회적 이슈·민감도 통합. 검수: 종합 가중합 미포함, 70 미만이면 Pass/Fail상 Fail·NO-GO). 국가법령정보 요약이 있으면 [법적 적법성]에 반영";

const NAMING_LEGALITY_DETAIL_DESC =
  "적법성 평가 상세 (한국어). 반드시 `[법적 적법성]`과 `[사회적 이슈·민감도]` 두 소제목으로 나누어 각 3줄 이상. [법적 적법성]: 상표법·표시광고법·저작권·국가법령정보 인용(있을 때 출처 명시). [사회적 이슈·민감도]: Gemini 추론으로 혐오·차별·선민·역사·정치·군사·기념일 등 민감 연상, 부적절한 이벤트·캠페인 논란·대외 PR 리스크(유사 브랜드 사례는 확실히 아는 경우에만 유형 참고, 불확실하면 지어내지 말 것)";

const NAMING_LEGALITY_PROMPT_RULES = `- **적법성(legalityScore·legalScore·legalDetail·legalityDetail·detailLogicLegality)**: **(가) 법적 적법성** — [참고 정보]에 **국가법령정보센터 법령 검색** 결과가 있으면 **반드시 인용·요약**(출처 명시). 상표법·표시광고법 위반 가능성·일반명칭·저작권 이슈를 평가. **(나) 사회적 이슈·민감도** — **Gemini 추론**으로 네이밍·슬로건·캠페인 맥락에서 사회편향·혐오발언·차별·선민·역사·정치·군사·기념일 등 **민감 연상**, 부적절한 기념·이벤트로 인한 **대외 PR·여론 리스크**를 **사전 점검**. **대중성**과 역할 구분: 적법성은 **레드라인·NO-GO**, 대중성은 **일반적 수용·톤·세대 fit**. Detail은 **\`[법적 적법성]\`** / **\`[사회적 이슈·민감도]\`** 두 소제목 필수. **0점은 평가 자체가 불가능할 때만**. 평가 가능하면 **10점 이상** + 근거 3줄 이상.`;

export type NamingLanguageMode = "ko" | "en" | "unlimited";

export type NamingFormatMode = "general" | "collaboration";

const COLLABORATION_DISPLAY_SUFFIX = " l ";

function appendCollaborationDisplaySuffix(name: string, partnerBrand: string): string {
  const base = String(name ?? "").trim();
  const partner = String(partnerBrand ?? "").trim();
  if (!base || !partner) return base;
  const suffix = `${COLLABORATION_DISPLAY_SUFFIX}${partner}`;
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix}`;
}

function applyCollaborationDisplaySuffixes(
  r: BrandNamingGeminiResult,
  partnerBrand: string
): BrandNamingGeminiResult {
  const partner = partnerBrand.trim();
  if (!partner) return r;

  const withSuffix = (name: string) => appendCollaborationDisplaySuffix(name, partner);

  if (r.tierNamingAlternatives?.length) {
    const tierNamingAlternatives = r.tierNamingAlternatives.map((alt) => ({
      ...alt,
      tierSteps: alt.tierSteps.map((step) => ({
        ...step,
        name: withSuffix(step.name)
      }))
    }));
    const namingProposals = tierNamingAlternatives.map((alt, i) => {
      const existing = (r.namingProposals ?? [])[i];
      return {
        ...(existing ?? {
          name: "",
          rationale: alt.storyline,
          hierarchyScore: 0,
          originalityDimensionScore: 0,
          pronunciationScore: 0,
          legalityScore: 0,
          publicAppealScore: 0,
          scalabilityScore: 0,
          proposalDetailLogic: {
            hierarchy: "",
            originality: "",
            pronunciationLanguage: "",
            legality: "",
            publicAppeal: "",
            scalability: ""
          }
        }),
        name: `[대안 ${i + 1}] ${alt.tierSteps.map((t) => t.name).join(" → ")}`,
        rationale: existing?.rationale ?? alt.storyline
      };
    });
    return {
      ...r,
      tierNamingAlternatives,
      namingProposals,
      suggestedNames: namingProposals.map((p) => p.name)
    };
  }

  const namingProposals = (r.namingProposals ?? []).map((p) => ({
    ...p,
    name: withSuffix(p.name)
  }));
  return {
    ...r,
    namingProposals,
    suggestedNames: namingProposals.map((p) => p.name)
  };
}

function buildNamingLanguagePromptBlock(mode: NamingLanguageMode, tiered: boolean): string {
  const nameTargets = tiered
    ? "각 대안 패키지(tierNamingAlternatives[i])의 **모든 tierSteps.name**, 그리고 대응하는 **names[i].name**·**namingProposals[i].name**·**suggestedNames[i]**"
    : "4개 네이밍 대안(**names[i].name**, **namingProposals[i].name**, **suggestedNames[i]**)";

  if (mode === "ko") {
    return `【언어 구성 — 필수】
- 사용자 선택: **국문**
- ${nameTargets}은 **모두 순수 국문(한글·한자 허용, 라틴 알파벳·영문 단어 금지)** 으로만 구성하세요.
- 4개 대안 **전부** 순수 국문이어야 합니다. 영문 혼용·로마자 표기 금지.`;
  }
  if (mode === "en") {
    return `【언어 구성 — 필수】
- 사용자 선택: **영문**
- ${nameTargets}은 **모두 순수 영문(Latin alphabet, 숫자·기호 허용)** 으로만 구성하세요.
- 4개 대안 **전부** 순수 영문이어야 합니다. 한글·한자 금지.`;
  }
  return `【언어 구성 — 필수】
- 사용자 선택: **제한없음 (혼합 비율 고정)**
- 4개 대안 중 **정확히** 아래 비율을 지키세요 (슬롯당 1개씩, 순서는 자유):
  1) **순수 국문** 1개 (25%): 한글·한자만, 라틴 알파벳 없음
  2) **순수 영문** 1개 (25%): Latin alphabet만, 한글·한자 없음
  3) **국문+영문 혼용** 2개 (50%): 한글과 영문을 함께 사용 (예: U+플러스, 스마트U+)
- ${nameTargets} 각각 위 슬롯에 맞는 언어 규칙을 **반드시** 적용하세요. 4개 중 2개만 혼용·1개만 국문 같은 비율 위반 금지.`;
}

const brandNamingResponseSchema = {
  type: SchemaType.OBJECT,
  description: "브랜드 네이밍 생성 또는 검수 결과",
  properties: {
    overallScore: {
      type: SchemaType.NUMBER,
      description:
        "0~100 종합. 검수 시 서버에서 **창의성×0.3 + 대중성×0.3 + 직관성×0.2 + 확장성×0.2** 로 재계산. 브랜드계층·적법은 미포함",
    },
    hierarchyScore: {
      type: SchemaType.NUMBER,
      description: "브랜드 계층 정렬 0~100 (검수: 종합 가중합 미포함, 70 미만이면 Pass/Fail상 Fail·NO-GO)",
    },
    originalityDimensionScore: {
      type: SchemaType.NUMBER,
      description: "창의성 0~100 (검수: 종합 **30%**). 가이드·요청·참고 정보만으로 Gemini 추론",
    },
    pronunciationScore: {
      type: SchemaType.INTEGER,
      description:
        "발음·언어 전용 점수 0~100. 검수: 검수 대상 네이밍·슬로건에 대해 (1) 한국어·영어로 읽을 때 발음의 자연스러움·호명 용이성 (2) 주요 외국어에서 불쾌·비하·부정 연상·금기 의미 여부. 생성: 제시한 4개 후보 네임 전체를 반영한 종합 점수. 녹음·IPA 불요",
    },
    pronunciationLanguageScore: {
      type: SchemaType.NUMBER,
      description:
        "직관성(발음·언어) 0~100 (검수: 종합 **20%**). **pronunciationScore와 동일한 정수 값**으로 맞출 것",
    },
    legalityScore: {
      type: SchemaType.NUMBER,
      description: NAMING_LEGALITY_SCORE_DESC,
    },
    publicAppealScore: {
      type: SchemaType.INTEGER,
      description:
        "대중성(사회·문화적 수용 가능성) 0~100. 부정 연상·세대·문화권 범용성·특정 집단 편향 여부 등을 Gemini 추론으로 채점 (검수: 종합 **30%**)",
    },
    scalabilityScore: {
      type: SchemaType.INTEGER,
      description:
        "확장성(브랜드 생태계 확장 잠재력) 0~100. 패밀리 네이밍·글로벌 발음·파생·시간 내구성 등을 Gemini 추론으로 채점 (검수: 종합 **20%**)",
    },
    trademarkScore: { type: SchemaType.NUMBER, description: "레거시: 상표 관점. 검수에서는 originalityDimensionScore와 유사 목적으로 채울 수 있음" },
    copyrightScore: { type: SchemaType.NUMBER, description: "레거시: 저작권. 검수에서는 legalityScore 보조로 채울 수 있음" },
    hierarchyStatus: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["aligned", "misaligned", "warning"] as string[],
      description: "브랜드 계층 정렬 상태"
    },
    hierarchyMessage: { type: SchemaType.STRING, description: "계층 정렬 한 줄 요약 (한국어)" },
    hierarchyDetails: { type: SchemaType.STRING, description: "계층 정렬 상세 (한국어)" },
    hierarchyChecklist: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "확인된 체크 항목 한국어 짧은 문장 2~5개"
    },
    trademarkRisk: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["low", "medium", "high"] as string[],
      description: "상표 충돌 위험"
    },
    trademarkConflicts: {
      type: SchemaType.ARRAY,
      description: "유사 상표 후보 (실제 등록 여부와 무관, 분석용)",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          class: { type: SchemaType.STRING, description: "예: 35류 - 광고업" },
          similarity: { type: SchemaType.NUMBER, description: "0~100 유사도" }
        },
        required: ["name", "class", "similarity"]
      }
    },
    trademarkRecommendation: { type: SchemaType.STRING, description: "상표 관점 권고 (한국어)" },
    copyrightOriginality: { type: SchemaType.NUMBER, description: "0~100 독창성" },
    copyrightVerdict: { type: SchemaType.STRING, description: "저작권 관점 한 줄 평가" },
    copyrightRisks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["low", "medium", "high"] as string[]
          },
          description: { type: SchemaType.STRING }
        },
        required: ["type", "severity", "description"]
      }
    },
    detailLogicHierarchy: {
      type: SchemaType.STRING,
      description:
        "검수: 브랜드 계층 정렬 항목 상세 논리(한국어). 가이드라인·업로드·직접입력만 근거로 서술. 생성: 짧은 요약 가능"
    },
    detailLogicOriginality: {
      type: SchemaType.STRING,
      description:
        "검수: 창의성 항목 상세 논리. 가이드·요청·참고 정보만으로 Gemini 추론(외부 상표 DB 연동·출처 언급 금지). 생성: 짧은 요약"
    },
    detailLogicPronunciation: {
      type: SchemaType.STRING,
      description:
        "검수 전용(최소 120자 권장): 직관성(발음·언어) 상세 논리(한국어). 검수 요청의 네이밍·슬로건을 **문자만으로** 분석. (1) 일반 사용자가 읽고 부를 때 **발음하기 쉽고 자연스러운지** (음절·모음·자음 배열, 길이, 외래어 혼용). (2) **언어적으로 긍정적이고 건강한지** — 부정·혐오·불쾌·유해한 연상, 과장·허위 느낌이 없는지. (3) 브랜드 톤과 맞는지. 실제 발음 녹음·발음기호 출력 요구 아님. **비우지 말 것.** 생성 모드: 짧은 요약",
    },
    detailLogicLegality: {
      type: SchemaType.STRING,
      description:
        "검수: 적법성 항목 상세 논리. " + NAMING_LEGALITY_DETAIL_DESC + " 생성: 동일 소제목 구조로 짧게 요약 가능"
    },
    detailLogicPublicAppeal: {
      type: SchemaType.STRING,
      description:
        "대중성 상세 논리(한국어): 부정적 연상·문화권 오해·세대·글로벌 발음/의미·특정 집단 편향 등. 검수 최소 수백 자 권장. 생성: 3줄 이상"
    },
    detailLogicScalability: {
      type: SchemaType.STRING,
      description:
        "확장성 상세 논리(한국어): 패밀리 네이밍(Pro/Lite/+ 등)·글로벌 왜곡·파생·슬로건 확장·시간 내구성. 검수 최소 수백 자 권장. 생성: 3줄 이상"
    },
    finalSummary: {
      type: SchemaType.STRING,
      description: "최종 GO/NO-GO 근거 요약 2~4문장 (한국어)"
    },
    goRecommendation: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["go", "no-go"] as string[],
      description: "70점 이상이면 보통 go"
    },
    suggestedNames: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "생성: names·namingProposals의 name과 동일 순서·개수(일반 4 또는 단계별 **대안 4**). 검수: []"
    },
    names: {
      type: SchemaType.ARRAY,
      description:
        "생성 모드: **일반 4개** 또는 **단계별(요금제) 시 대안 패키지 요약 4개**(상세 N단계는 tierNamingAlternatives). 검수: []",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "제안 네이밍" },
          description: {
            type: SchemaType.STRING,
            description: "네이밍 설명·창작 근거(한국어)"
          },
          hierarchyScore: { type: SchemaType.INTEGER, description: "브랜드 계층 정렬 0~100" },
          hierarchyDetail: {
            type: SchemaType.STRING,
            description: "브랜드 계층 평가 상세 서술 (한국어, 3줄 이상)"
          },
          uniquenessScore: { type: SchemaType.INTEGER, description: "독창성 0~100" },
          uniquenessDetail: {
            type: SchemaType.STRING,
            description: "독창성 평가 상세 서술 (한국어, 3줄 이상)"
          },
          pronunciationScore: { type: SchemaType.INTEGER, description: "발음·언어 0~100" },
          pronunciationDetail: {
            type: SchemaType.STRING,
            description: "발음·언어 평가 상세 서술 (한국어, 3줄 이상)"
          },
          legalScore: { type: SchemaType.INTEGER, description: NAMING_LEGALITY_SCORE_DESC },
          legalDetail: {
            type: SchemaType.STRING,
            description: NAMING_LEGALITY_DETAIL_DESC
          },
          publicAppealScore: { type: SchemaType.INTEGER, description: "대중성 0~100" },
          publicAppealDetail: {
            type: SchemaType.STRING,
            description: "대중성 평가 상세 (한국어, 3줄 이상)"
          },
          scalabilityScore: { type: SchemaType.INTEGER, description: "확장성 0~100" },
          scalabilityDetail: {
            type: SchemaType.STRING,
            description: "확장성 평가 상세 (한국어, 3줄 이상)"
          }
        },
        required: [
          "name",
          "description",
          "hierarchyScore",
          "hierarchyDetail",
          "uniquenessScore",
          "uniquenessDetail",
          "pronunciationScore",
          "pronunciationDetail",
          "legalScore",
          "legalDetail",
          "publicAppealScore",
          "publicAppealDetail",
          "scalabilityScore",
          "scalabilityDetail"
        ]
      }
    },
    namingProposals: {
      type: SchemaType.ARRAY,
      description:
        "생성 모드: names와 동일 개수·동일 내용. 단계별(요금제)일 때는 **4개=대안 패키지 요약** tierNamingAlternatives와 1:1. 검수: []",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "제안 네이밍" },
          description: {
            type: SchemaType.STRING,
            description: "네이밍 설명(한국어). rationale 대신 사용 가능"
          },
          rationale: {
            type: SchemaType.STRING,
            description: "레거시: description과 동일 의미로 채우거나 description을 우선"
          },
          hierarchyScore: { type: SchemaType.INTEGER, description: "브랜드 계층 정렬 0~100" },
          hierarchyDetail: {
            type: SchemaType.STRING,
            description: "브랜드 계층 평가 상세 서술 (한국어, 3줄 이상)"
          },
          uniquenessScore: { type: SchemaType.INTEGER, description: "독창성 0~100" },
          uniquenessDetail: {
            type: SchemaType.STRING,
            description: "독창성 평가 상세 서술 (한국어, 3줄 이상)"
          },
          pronunciationScore: { type: SchemaType.INTEGER, description: "발음·언어 0~100" },
          pronunciationDetail: {
            type: SchemaType.STRING,
            description: "발음·언어 평가 상세 서술 (한국어, 3줄 이상)"
          },
          legalScore: { type: SchemaType.INTEGER, description: NAMING_LEGALITY_SCORE_DESC },
          legalDetail: {
            type: SchemaType.STRING,
            description: NAMING_LEGALITY_DETAIL_DESC
          },
          publicAppealScore: { type: SchemaType.INTEGER, description: "대중성 0~100" },
          publicAppealDetail: {
            type: SchemaType.STRING,
            description: "대중성 평가 상세 (한국어, 3줄 이상)"
          },
          scalabilityScore: { type: SchemaType.INTEGER, description: "확장성 0~100" },
          scalabilityDetail: {
            type: SchemaType.STRING,
            description: "확장성 평가 상세 (한국어, 3줄 이상)"
          }
        },
        required: [
          "name",
          "description",
          "hierarchyScore",
          "hierarchyDetail",
          "uniquenessScore",
          "uniquenessDetail",
          "pronunciationScore",
          "pronunciationDetail",
          "legalScore",
          "legalDetail",
          "publicAppealScore",
          "publicAppealDetail",
          "scalabilityScore",
          "scalabilityDetail"
        ]
      }
    },
    tierNamingAlternatives: {
      type: SchemaType.ARRAY,
      description:
        "**단계별 생성 시 필수: 정확히 4개**. 각 원소 = **대안 1개** = 한 패키지(요청한 N단계 전부 + 세계관 + 패키지 단위 **6대 평가**). 일반 생성(단일 네이밍 4안)에서는 빈 배열 []",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          storyline: {
            type: SchemaType.STRING,
            description:
              "이 대안 패키지 전체가 공유하는 세계관·스토리라인(한국어 3~6문장). Personal이면 커머셜·일상 B2C 맥락, Enterprise이면 진중·신뢰·B2B 무게감. N단계 네이밍이 하나의 서사에서 파생되도록 서술"
          },
          tierSteps: {
            type: SchemaType.ARRAY,
            description: "단계 수 = 요청한 N. 순서는 요청 단계 라벨과 동일",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                tierLabel: { type: SchemaType.STRING, description: "예: 최고가, 고가…" },
                name: { type: SchemaType.STRING, description: "해당 단계 상품·요금제 네이밍" },
                rationale: { type: SchemaType.STRING, description: "해당 단계 이름의 짧은 창작 근거" }
              },
              required: ["tierLabel", "name", "rationale"]
            }
          },
          tierPackageEvaluation: {
            type: SchemaType.OBJECT,
            description: "이 패키지(N단계 전체)에 대한 통합 6대 평가. 창의성 근거에는 storyline 반영 필수",
            properties: {
              hierarchyScore: { type: SchemaType.INTEGER },
              legalityScore: { type: SchemaType.INTEGER, description: NAMING_LEGALITY_SCORE_DESC },
              originalityDimensionScore: { type: SchemaType.INTEGER },
              pronunciationScore: { type: SchemaType.INTEGER },
              publicAppealScore: { type: SchemaType.INTEGER, description: "대중성 0~100" },
              scalabilityScore: { type: SchemaType.INTEGER, description: "확장성 0~100" },
              hierarchyDetail: { type: SchemaType.STRING },
              legalityDetail: { type: SchemaType.STRING, description: NAMING_LEGALITY_DETAIL_DESC },
              originalityDetail: {
                type: SchemaType.STRING,
                description: "창의성: 반드시 storyline과 각 단계 네이밍의 연결을 구체적으로 서술"
              },
              pronunciationDetail: { type: SchemaType.STRING },
              publicAppealDetail: { type: SchemaType.STRING, description: "대중성 근거 3줄 이상" },
              scalabilityDetail: { type: SchemaType.STRING, description: "확장성 근거 3줄 이상" }
            },
            required: [
              "hierarchyScore",
              "legalityScore",
              "originalityDimensionScore",
              "pronunciationScore",
              "publicAppealScore",
              "scalabilityScore",
              "hierarchyDetail",
              "legalityDetail",
              "originalityDetail",
              "pronunciationDetail",
              "publicAppealDetail",
              "scalabilityDetail"
            ]
          }
        },
        required: ["storyline", "tierSteps", "tierPackageEvaluation"]
      }
    },
    tierPackageEvaluation: {
      type: SchemaType.OBJECT,
      description:
        "**레거시·단일 패키지용**. 단계별 4대안 모드에서는 **tierNamingAlternatives**만 사용하고 여기는 생략. 일반 생성(4안)에서는 생략",
      properties: {
        hierarchyScore: { type: SchemaType.INTEGER, description: "패키지 기준 브랜드 계층 정렬 0~100" },
        legalityScore: { type: SchemaType.INTEGER, description: NAMING_LEGALITY_SCORE_DESC },
        originalityDimensionScore: { type: SchemaType.INTEGER, description: "패키지 기준 창의성 0~100" },
        pronunciationScore: { type: SchemaType.INTEGER, description: "패키지 기준 직관성(발음·언어) 0~100" },
        publicAppealScore: { type: SchemaType.INTEGER, description: "패키지 기준 대중성 0~100" },
        scalabilityScore: { type: SchemaType.INTEGER, description: "패키지 기준 확장성 0~100" },
        hierarchyDetail: {
          type: SchemaType.STRING,
          description: "패키지 전체에 대한 브랜드 계층 정렬 근거 한국어 3줄 이상"
        },
        legalityDetail: { type: SchemaType.STRING, description: NAMING_LEGALITY_DETAIL_DESC },
        originalityDetail: { type: SchemaType.STRING, description: "패키지 기준 창의성 근거 3줄 이상" },
        pronunciationDetail: { type: SchemaType.STRING, description: "패키지 기준 직관성 근거 3줄 이상" },
        publicAppealDetail: { type: SchemaType.STRING, description: "패키지 기준 대중성 근거 3줄 이상" },
        scalabilityDetail: { type: SchemaType.STRING, description: "패키지 기준 확장성 근거 3줄 이상" }
      }
    },
    additionalNamingSuggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "검수 필수: 평가 맥락을 반영한 **대안 네이밍 정확히 3개**만 배열로. 검수명·슬로건과 겹치지 않는 실제 후보명(한글·영문 등). 안내 문장·주석·※ 접두어 금지. 생성 모드: 반드시 빈 배열 []"
    }
  },
  required: [
    "overallScore",
    "hierarchyScore",
    "originalityDimensionScore",
    "pronunciationScore",
    "pronunciationLanguageScore",
    "legalityScore",
    "trademarkScore",
    "copyrightScore",
    "hierarchyStatus",
    "hierarchyMessage",
    "hierarchyDetails",
    "hierarchyChecklist",
    "trademarkRisk",
    "trademarkConflicts",
    "trademarkRecommendation",
    "copyrightOriginality",
    "copyrightVerdict",
    "copyrightRisks",
    "detailLogicHierarchy",
    "detailLogicOriginality",
    "detailLogicPronunciation",
    "detailLogicLegality",
    "detailLogicPublicAppeal",
    "detailLogicScalability",
    "publicAppealScore",
    "scalabilityScore",
    "finalSummary",
    "goRecommendation",
    "suggestedNames",
    "names",
    "namingProposals",
    "additionalNamingSuggestions"
  ]
} as Schema;

/** 검수 NO-GO인데 additionalNamingSuggestions가 비었을 때만 쓰는 보조 응답 스키마 */
const auditAlternateNamesSchema = {
  type: SchemaType.OBJECT,
  properties: {
    names: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "검수 대상과 다른 실제 브랜드·서비스 명칭 후보 정확히 3개. 안내 문구·주석·※ 접두어 금지."
    }
  },
  required: ["names"]
} as Schema;

function parseAlternateNamesPayload(raw: string): string[] | null {
  try {
    const p = JSON.parse(raw) as { names?: unknown };
    if (!Array.isArray(p.names)) return null;
    return (p.names as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const p = JSON.parse(m[0]) as { names?: unknown };
      if (!Array.isArray(p.names)) return null;
      return (p.names as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
    } catch {
      return null;
    }
  }
}

function filterPlausibleAlternateNames(names: string[]): string[] {
  const bad = (s: string) =>
    s.length < 2 ||
    s.length > 48 ||
    /^[※•·\-–—*]/.test(s) ||
    /^(안내|참고|주의|예시|※)/i.test(s) ||
    /안내|참고하세요|다음과\s*같/i.test(s);
  return names.filter((s) => !bad(s));
}

/** Gemini 보조 호출 실패 시에도 NO-GO 검수에 최소 한 세트는 채움 */
function fallbackAlternateNamesForAudit(requestText: string): string[] {
  const seed = requestText.replace(/\s+/g, " ").trim().slice(0, 80);
  const suffix = seed ? seed.split(/\s+/).slice(0, 2).join("") : "브랜드";
  const a = suffix.length >= 2 ? `${suffix.slice(0, 6)}엣지` : "큐브엣지";
  const b = suffix.length >= 2 ? `${suffix.slice(0, 4)}라이트` : "루프라이트";
  return filterPlausibleAlternateNames([a, b, "스텔라포인트"]).slice(0, 4);
}

async function generateAlternateNamesForAuditNoGo(
  genAI: InstanceType<typeof GoogleGenerativeAI>,
  ctx: {
    requestText: string;
    guidelineBlock: string;
    referenceNotes: string;
    auditCategoryRaw?: string;
  }
): Promise<string[]> {
  const req = ctx.requestText.trim();
  const guide = ctx.guidelineBlock.slice(0, 40_000);
  const notes = ctx.referenceNotes.trim() || "(없음)";
  const suggestionConditions = buildAdditionalNamingSuggestionBlockFromAuditRaw(ctx.auditCategoryRaw ?? "");
  const prompt = `역할: 브랜드 네이밍 전문가.
검수 결과가 **NO-GO**였고, 사용자에게 제시할 **대체 네이밍 후보**가 비어 있어 보완합니다.

${suggestionConditions ? `${suggestionConditions}\n\n` : ""}규칙:
- [요청 내용]의 서비스·브랜드 맥락을 유지하되, 검수에 올린 **기존 명칭·슬로건과 동일하거나 거의 같은 표기는 넣지 마세요.**
- 실제로 쓸 수 있는 **브랜드·서비스 이름**을 **정확히 3개**, **names** 배열에 넣으세요.
- 한글·영문·혼합 가능. 설명 문장·안내·※·주석 금지.

[U+ 브랜드 가이드라인 및 참고 문맥]
${guide}

[참고 정보]
${notes}

[요청 내용]
${req}

출력: JSON 한 개만. 키는 names 하나.
반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 마세요.`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: auditAlternateNamesSchema
      }
    });
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      const parsed = parseAlternateNamesPayload(raw);
      const cleaned = filterPlausibleAlternateNames(parsed ?? []);
      if (cleaned.length >= 3) return cleaned.slice(0, 3);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[gemini] audit alternate names model=${modelId} → 다음 모델`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
    try {
      const modelPlain = genAI.getGenerativeModel({ model: modelId });
      const result = await modelPlain.generateContent(
        `${prompt}\n\n반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 마세요.\n\n응답: {"names":["…"]} 형태의 JSON만 출력하세요.`
      );
      const parsed = parseAlternateNamesPayload(result.response.text());
      const cleaned = filterPlausibleAlternateNames(parsed ?? []);
      if (cleaned.length >= 3) return cleaned.slice(0, 3);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }
  console.warn("[gemini] audit alternate names: 모든 모델 실패, 폴백 사용", lastErr);
  return [];
}

async function ensureAuditNoGoHasAdditionalSuggestions(
  r: BrandNamingGeminiResult,
  genAI: InstanceType<typeof GoogleGenerativeAI>,
  ctx: {
    requestText: string;
    guidelineBlock: string;
    referenceNotes: string;
    auditCategoryRaw?: string;
  }
): Promise<BrandNamingGeminiResult> {
  if (r.goRecommendation !== "no-go") return r;
  const cur = Array.isArray(r.additionalNamingSuggestions)
    ? r.additionalNamingSuggestions.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (cur.length > 0) return { ...r, additionalNamingSuggestions: cur.slice(0, 3) };

  let next = await generateAlternateNamesForAuditNoGo(genAI, ctx);
  next = filterPlausibleAlternateNames(next);
  if (next.length < 3) {
    next = fallbackAlternateNamesForAudit(ctx.requestText);
  }
  return { ...r, additionalNamingSuggestions: next.slice(0, 3) };
}

export type ProposalDetailLogicGemini = {
  hierarchy: string;
  originality: string;
  pronunciationLanguage: string;
  legality: string;
  /** 대중성(사회·문화적 수용 가능성) 근거 */
  publicAppeal: string;
  /** 확장성(브랜드 생태계 확장) 근거 */
  scalability: string;
};

export type BrandNamingProposalGemini = {
  name: string;
  rationale: string;
  hierarchyScore: number;
  originalityDimensionScore: number;
  pronunciationScore: number;
  legalityScore: number;
  publicAppealScore: number;
  scalabilityScore: number;
  proposalDetailLogic: ProposalDetailLogicGemini;
};

export type BrandNamingGeminiResult = {
  overallScore: number;
  hierarchyScore: number;
  originalityDimensionScore: number;
  /** 발음·언어 단일 점수(0~100). pronunciationLanguageScore와 동기화 */
  pronunciationScore: number;
  pronunciationLanguageScore: number;
  legalityScore: number;
  publicAppealScore: number;
  scalabilityScore: number;
  trademarkScore: number;
  copyrightScore: number;
  detailLogic: {
    hierarchy: string;
    originality: string;
    pronunciationLanguage: string;
    legality: string;
    publicAppeal: string;
    scalability: string;
  };
  hierarchy: {
    status: "aligned" | "misaligned" | "warning";
    message: string;
    details: string;
    checklist: string[];
  };
  trademark: {
    risk: "low" | "medium" | "high";
    conflicts: Array<{ name: string; class: string; similarity: number }>;
    recommendation: string;
  };
  copyright: {
    originality: number;
    risks: Array<{ type: string; severity: "low" | "medium" | "high"; description: string }>;
    verdict: string;
  };
  finalSummary: string;
  goRecommendation: "go" | "no-go";
  suggestedNames: string[];
  namingProposals: BrandNamingProposalGemini[];
  /** 검수: 입력 외 추가 제안 네이밍 */
  additionalNamingSuggestions: string[];
  /** 단계별 생성(구): 단일 패키지 — tierNamingAlternatives 사용 시 무시 */
  tierPackageEvaluation?: TierPackageEvaluationGemini;
  /** 단계별 생성: 대안 4개 × (N단계 패키지 + 세계관 + 통합 평가) */
  tierNamingAlternatives?: TierNamingAlternativeGemini[];
};

export type TierPackageEvaluationGemini = {
  hierarchyScore: number;
  legalityScore: number;
  originalityDimensionScore: number;
  pronunciationScore: number;
  publicAppealScore: number;
  scalabilityScore: number;
  proposalDetailLogic: ProposalDetailLogicGemini;
};

export type TierNamingAlternativeGemini = {
  storyline: string;
  tierSteps: Array<{ tierLabel: string; name: string; rationale: string }>;
  tierPackageEvaluation: TierPackageEvaluationGemini;
};

function parseTierPackageEvaluationObj(raw: unknown): TierPackageEvaluationGemini | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return parseTierPackageEvaluation({ tierPackageEvaluation: raw });
}

function parseTierNamingAlternatives(p: Record<string, unknown>): TierNamingAlternativeGemini[] | undefined {
  const raw = p.tierNamingAlternatives;
  if (!Array.isArray(raw)) return undefined;
  const out: TierNamingAlternativeGemini[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const stepsRaw = Array.isArray(row.tierSteps) ? row.tierSteps : [];
    const tierSteps = stepsRaw
      .map((s) => {
        if (!s || typeof s !== "object" || Array.isArray(s)) return null;
        const t = s as Record<string, unknown>;
        return {
          tierLabel: String(t.tierLabel ?? "").trim(),
          name: String(t.name ?? "").trim(),
          rationale: String(t.rationale ?? "").trim()
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const pkg = parseTierPackageEvaluationObj(row.tierPackageEvaluation);
    if (!pkg) continue;
    const storyline = String(row.storyline ?? "").trim() || "(스토리라인 없음)";
    out.push({ storyline, tierSteps, tierPackageEvaluation: pkg });
  }
  return out.length ? out : undefined;
}

function parseTierPackageEvaluation(p: Record<string, unknown>): TierPackageEvaluationGemini | undefined {
  const raw = p.tierPackageEvaluation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const t = raw as Record<string, unknown>;
  const clamp = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
  const firstStr = (...args: unknown[]) => {
    for (const x of args) {
      const s = String(x ?? "").trim();
      if (s) return s;
    }
    return "";
  };
  const hs = clamp(t.hierarchyScore ?? 0);
  const ls = clamp(t.legalityScore ?? t.legalScore ?? 0);
  const os = clamp(t.originalityDimensionScore ?? t.uniquenessScore ?? 0);
  const ps = clamp(t.pronunciationScore ?? 0);
  const pas = clamp(t.publicAppealScore ?? 0);
  const scs = clamp(t.scalabilityScore ?? 0);
  if (hs + ls + os + ps + pas + scs === 0) return undefined;
  const detail: ProposalDetailLogicGemini = {
    hierarchy:
      firstStr(t.hierarchyDetail, t.detailHierarchy, (t as { proposalDetailLogic?: { hierarchy?: string } }).proposalDetailLogic?.hierarchy) ||
      "(상세 근거 문단 없음)",
    originality:
      firstStr(
        t.originalityDetail,
        t.uniquenessDetail,
        (t as { proposalDetailLogic?: { originality?: string } }).proposalDetailLogic?.originality
      ) || "(상세 근거 문단 없음)",
    pronunciationLanguage:
      firstStr(
        t.pronunciationDetail,
        (t as { proposalDetailLogic?: { pronunciationLanguage?: string } }).proposalDetailLogic?.pronunciationLanguage
      ) || "(상세 근거 문단 없음)",
    legality:
      firstStr(t.legalityDetail, t.legalDetail, (t as { proposalDetailLogic?: { legality?: string } }).proposalDetailLogic?.legality) ||
      "(상세 근거 문단 없음)",
    publicAppeal:
      firstStr(
        t.publicAppealDetail,
        (t as { proposalDetailLogic?: { publicAppeal?: string } }).proposalDetailLogic?.publicAppeal
      ) || "(상세 근거 문단 없음)",
    scalability:
      firstStr(
        t.scalabilityDetail,
        (t as { proposalDetailLogic?: { scalability?: string } }).proposalDetailLogic?.scalability
      ) || "(상세 근거 문단 없음)"
  };
  return {
    hierarchyScore: hs,
    legalityScore: ls,
    originalityDimensionScore: os,
    pronunciationScore: ps,
    publicAppealScore: pas,
    scalabilityScore: scs,
    proposalDetailLogic: detail
  };
}

function weightedTierPackageOverall(tp: TierPackageEvaluationGemini): number {
  return namingOverallWeightedFour(
    tp.originalityDimensionScore,
    tp.publicAppealScore,
    tp.pronunciationScore,
    tp.scalabilityScore
  );
}

function synthesizeTierAlternativePlaceholder(
  altIdx: number,
  nSteps: number,
  labels: string[]
): TierNamingAlternativeGemini {
  const L = labels.slice(0, nSteps);
  const tierSteps = L.map((lb, i) => ({
    tierLabel: lb,
    name: `보완 ${altIdx}-${i + 1}`,
    rationale: "응답이 불완전하여 자동 보완했습니다. 동일 요청으로 재생성해 주세요."
  }));
  return {
    storyline: `【자동 보완】대안 ${altIdx}번 패키지(스토리라인·평가)가 비었습니다. tierNamingAlternatives를 정확히 4개 채워 재시도해 주세요.`,
    tierSteps,
    tierPackageEvaluation: {
      hierarchyScore: 50,
      legalityScore: 50,
      originalityDimensionScore: 50,
      pronunciationScore: 50,
      publicAppealScore: 50,
      scalabilityScore: 50,
      proposalDetailLogic: {
        hierarchy: "자동 보완입니다.",
        originality: "자동 보완입니다. 세계관·스토리라인과 단계 네이밍의 연계는 재생성 시 모델 응답에 포함됩니다.",
        pronunciationLanguage: "자동 보완입니다.",
        legality: "자동 보완입니다.",
        publicAppeal: "자동 보완입니다.",
        scalability: "자동 보완입니다."
      }
    }
  };
}

function normalizeTierAlternativeShape(
  alt: TierNamingAlternativeGemini,
  nSteps: number,
  labels: string[],
  altIdx: number
): TierNamingAlternativeGemini {
  const L = labels.slice(0, nSteps);
  const cur = [...alt.tierSteps];
  while (cur.length < nSteps) {
    const i = cur.length;
    cur.push({ tierLabel: L[i] ?? `단계 ${i + 1}`, name: "", rationale: "" });
  }
  const tierSteps = cur.slice(0, nSteps).map((s, i) => ({
    tierLabel: (s.tierLabel || L[i] || `단계 ${i + 1}`).trim(),
    name: (s.name || `보완 ${altIdx}-${i + 1}`).trim(),
    rationale: (s.rationale || "").trim() || "—"
  }));
  let tierPackageEvaluation = alt.tierPackageEvaluation;
  const sumScores =
    (tierPackageEvaluation?.hierarchyScore ?? 0) +
    (tierPackageEvaluation?.legalityScore ?? 0) +
    (tierPackageEvaluation?.originalityDimensionScore ?? 0) +
    (tierPackageEvaluation?.pronunciationScore ?? 0) +
    (tierPackageEvaluation?.publicAppealScore ?? 0) +
    (tierPackageEvaluation?.scalabilityScore ?? 0);
  if (!tierPackageEvaluation || sumScores === 0) {
    tierPackageEvaluation = {
      hierarchyScore: 50,
      legalityScore: 50,
      originalityDimensionScore: 50,
      pronunciationScore: 50,
      publicAppealScore: 50,
      scalabilityScore: 50,
      proposalDetailLogic: {
        hierarchy: "(자동 보완)",
        originality: "(자동 보완) 스토리라인·단계 네이밍 연계 평가가 비었습니다.",
        pronunciationLanguage: "(자동 보완)",
        legality: "(자동 보완)",
        publicAppeal: "(자동 보완)",
        scalability: "(자동 보완)"
      }
    };
  }
  const storyline = (alt.storyline || "").trim() || `【자동 보완】대안 ${altIdx} 스토리라인 없음`;
  return { storyline, tierSteps, tierPackageEvaluation };
}

function parseBrandNamingPayload(raw: string): BrandNamingGeminiResult | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return normalizeBrandNamingResult(p);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const p = JSON.parse(m[0]) as Record<string, unknown>;
      return normalizeBrandNamingResult(p);
    } catch {
      return null;
    }
  }
}

/** 종합: 창의 30% · 대중 30% · 직관 20% · 확장 20% (계층·적법은 미포함) */
function namingOverallWeightedFour(originality: number, publicAppeal: number, pronunciation: number, scalability: number): number {
  const o = Math.min(100, Math.max(0, Math.round(Number(originality) || 0)));
  const pa = Math.min(100, Math.max(0, Math.round(Number(publicAppeal) || 0)));
  const pr = Math.min(100, Math.max(0, Math.round(Number(pronunciation) || 0)));
  const sc = Math.min(100, Math.max(0, Math.round(Number(scalability) || 0)));
  const raw = o * 0.3 + pa * 0.3 + pr * 0.2 + sc * 0.2;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** 검수: 발음·언어 상세가 너무 짧거나 비어 있으면 기본 안내 문구 보강 */
const AUDIT_PRONUNCIATION_MIN_CHARS = 90;

function ensureAuditPronunciationDetail(raw: string, requestText: string): string {
  const t = raw.trim();
  if (t.length >= AUDIT_PRONUNCIATION_MIN_CHARS) return t;
  const snippet = requestText.replace(/\s+/g, " ").trim().slice(0, 200);
  const auto =
    "【자동 보완】모델 응답이 짧거나 비어 있어 안내 문구를 덧붙입니다. 검수 요청 네이밍·슬로건을 문자만으로 보고, (1) 읽고 부르기 쉬운지·발음이 자연스러운지, (2) 언어적으로 긍정적이고 건강한 어감인지(부정·유해 연상 없음), (3) 브랜드 맥락에 맞는지를 검토하십시오.";
  const ctx = snippet ? ` 검수 요청 발췌: 「${snippet}」` : "";
  return t.length > 0 ? `${t}\n\n${auto}${ctx}` : `${auto}${ctx}`;
}

function normalizeBrandNamingResult(p: Record<string, unknown>): BrandNamingGeminiResult | null {
  const finite = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  };
  const hsNum = finite(p.hierarchyScore) ?? 0;
  const origNum =
    finite(p.originalityDimensionScore) ?? finite(p.trademarkScore) ?? finite(p.overallScore) ?? 0;
  const pronNum =
    finite(p.pronunciationScore) ?? finite(p.pronunciationLanguageScore) ?? finite(p.overallScore) ?? 70;
  const legNum = finite(p.legalityScore) ?? finite(p.copyrightScore) ?? finite(p.overallScore) ?? 0;
  const paNum = finite(p.publicAppealScore) ?? finite(p.overallScore) ?? 50;
  const scNum = finite(p.scalabilityScore) ?? finite(p.overallScore) ?? 50;
  const tmLegacy = finite(p.trademarkScore) ?? origNum;
  const crLegacy = finite(p.copyrightScore) ?? legNum;
  const overallScore =
    finite(p.overallScore) ?? namingOverallWeightedFour(origNum, paNum, pronNum, scNum);
  const hs = ["aligned", "misaligned", "warning"].includes(String(p.hierarchyStatus))
    ? (String(p.hierarchyStatus) as "aligned" | "misaligned" | "warning")
    : "warning";
  const tr = ["low", "medium", "high"].includes(String(p.trademarkRisk))
    ? (String(p.trademarkRisk) as "low" | "medium" | "high")
    : "medium";
  // Pass/Fail: 브랜드 계층·적법 70 미만 NO-GO(종합 가중합에는 미포함)
  const passHierarchy = hsNum >= 70;
  const passLegality = legNum >= 70;
  const gr =
    !passHierarchy || !passLegality || p.goRecommendation === "no-go"
      ? "no-go"
      : "go";
  const conflicts = Array.isArray(p.trademarkConflicts)
    ? (p.trademarkConflicts as Array<{ name?: string; class?: string; similarity?: number }>).map((c) => ({
        name: String(c?.name ?? ""),
        class: String(c?.class ?? ""),
        similarity: Math.min(100, Math.max(0, Number(c?.similarity) || 0))
      }))
    : [];
  const risks = Array.isArray(p.copyrightRisks)
    ? (p.copyrightRisks as Array<{ type?: string; severity?: string; description?: string }>).map((r) => ({
        type: String(r?.type ?? ""),
        severity: (["low", "medium", "high"].includes(String(r?.severity))
          ? r?.severity
          : "low") as "low" | "medium" | "high",
        description: String(r?.description ?? "")
      }))
    : [];
  const checklist = Array.isArray(p.hierarchyChecklist)
    ? (p.hierarchyChecklist as unknown[]).map((x) => String(x))
    : [];
  const suggested = Array.isArray(p.suggestedNames)
    ? (p.suggestedNames as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const additionalNamingSuggestions = Array.isArray(p.additionalNamingSuggestions)
    ? (p.additionalNamingSuggestions as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 3)
    : [];

  const clampScore = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));

  const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
    for (const k of keys) {
      if (!(k in row)) continue;
      const v = row[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };

  const mapProposalRow = (row: Record<string, unknown>): BrandNamingProposalGemini => {
    const h = clampScore(
      pick(row, ["hierarchyScore", "hierarchy_score", "brandHierarchyScore", "logicScore", "logic_score"])
    );
    const o = clampScore(
      pick(row, [
        "uniquenessScore",
        "uniqueness_score",
        "originalityDimensionScore",
        "originality_dimension_score",
        "originalityScore",
        "creativityScore",
        "creativity_score",
      ])
    );
    const pr = clampScore(
      pick(row, [
        "pronunciationScore",
        "pronunciation_score",
        "pronunciationLanguageScore",
        "pronunciation_language_score",
        "metaphorScore",
      ])
    );
    const leg = clampScore(pick(row, ["legalScore", "legal_score", "legalityScore", "legality_score"]));
    const pa = clampScore(
      pick(row, ["publicAppealScore", "public_appeal_score", "massAppealScore", "popularityScore"])
    );
    const sc = clampScore(pick(row, ["scalabilityScore", "scalability_score", "extensionScore"]));
    const nested =
      row.proposalDetailLogic && typeof row.proposalDetailLogic === "object" && !Array.isArray(row.proposalDetailLogic)
        ? (row.proposalDetailLogic as Record<string, unknown>)
        : {};
    const firstStr = (...args: unknown[]) => {
      for (const x of args) {
        const t = String(x ?? "").trim();
        if (t) return t;
      }
      return "";
    };
    const detail: ProposalDetailLogicGemini = {
      hierarchy: firstStr(
        row.hierarchyDetail,
        row.detailHierarchy,
        row.detail_hierarchy,
        row.detailLogicHierarchy,
        nested.hierarchy,
        nested.detailHierarchy
      ),
      originality: firstStr(
        row.uniquenessDetail,
        row.detailOriginality,
        row.detail_originality,
        row.detailLogicOriginality,
        nested.originality,
        nested.detailOriginality
      ),
      pronunciationLanguage: firstStr(
        row.pronunciationDetail,
        row.detailPronunciationLanguage,
        row.detail_pronunciation_language,
        row.detailLogicPronunciation,
        nested.pronunciationLanguage,
        nested.detailPronunciationLanguage
      ),
      legality: firstStr(
        row.legalDetail,
        row.detailLegality,
        row.detail_legality,
        row.detailLogicLegality,
        nested.legality,
        nested.detailLegality
      ),
      publicAppeal: firstStr(
        row.publicAppealDetail,
        row.detailPublicAppeal,
        row.detailLogicPublicAppeal,
        nested.publicAppeal,
        nested.detailPublicAppeal
      ),
      scalability: firstStr(
        row.scalabilityDetail,
        row.detailScalability,
        row.detailLogicScalability,
        nested.scalability,
        nested.detailScalability
      ),
    };
    return {
      name: String(row?.name ?? "").trim(),
      rationale: firstStr(row?.rationale, row?.description),
      hierarchyScore: h,
      originalityDimensionScore: o,
      pronunciationScore: pr,
      legalityScore: leg,
      publicAppealScore: pa,
      scalabilityScore: sc,
      proposalDetailLogic: detail
    };
  };

  const fromNames = Array.isArray(p.names) ? (p.names as Array<Record<string, unknown>>) : [];
  const fromNp = Array.isArray(p.namingProposals) ? (p.namingProposals as Array<Record<string, unknown>>) : [];
  const proposalSource = fromNames.length > 0 ? fromNames : fromNp;
  const namingProposalsRaw = proposalSource.map((row) => mapProposalRow(row));

  return {
    overallScore,
    hierarchyScore: hsNum,
    originalityDimensionScore: origNum,
    pronunciationScore: pronNum,
    pronunciationLanguageScore: pronNum,
    legalityScore: legNum,
    publicAppealScore: paNum,
    scalabilityScore: scNum,
    trademarkScore: tmLegacy,
    copyrightScore: crLegacy,
    detailLogic: {
      hierarchy: String(p.detailLogicHierarchy ?? ""),
      originality: String(p.detailLogicOriginality ?? ""),
      pronunciationLanguage: String(p.detailLogicPronunciation ?? ""),
      legality: String(p.detailLogicLegality ?? ""),
      publicAppeal: String(p.detailLogicPublicAppeal ?? ""),
      scalability: String(p.detailLogicScalability ?? "")
    },
    hierarchy: {
      status: hs,
      message: String(p.hierarchyMessage ?? ""),
      details: String(p.hierarchyDetails ?? ""),
      checklist: checklist.length ? checklist : ["가이드라인 기준으로 검토됨"]
    },
    trademark: {
      risk: tr,
      conflicts,
      recommendation: String(p.trademarkRecommendation ?? "")
    },
    copyright: {
      originality: Math.min(100, Math.max(0, Number(p.copyrightOriginality) || 0)),
      risks,
      verdict: String(p.copyrightVerdict ?? "")
    },
    finalSummary: String(p.finalSummary ?? ""),
    goRecommendation: gr,
    suggestedNames: suggested,
    namingProposals: namingProposalsRaw,
    additionalNamingSuggestions,
    tierPackageEvaluation: parseTierPackageEvaluation(p),
    tierNamingAlternatives: parseTierNamingAlternatives(p)
  };
}

function mockBrandNamingNoKey(
  mode: "generate" | "audit",
  tierPlan?: { stepCount: number; labels: string[] } | null
): BrandNamingGeminiResult {
  const genProposal = (i: number): BrandNamingProposalGemini => ({
    name: `예시 네이밍 ${i}`,
    rationale:
      "GEMINI_API_KEY가 없어 실제 추론 대신 자리 표시입니다. 키를 설정하면 가이드라인·요청·참고자료를 반영한 근거가 채워집니다.",
    hierarchyScore: 65,
    originalityDimensionScore: 60,
    pronunciationScore: 70,
    legalityScore: 68,
    publicAppealScore: 66,
    scalabilityScore: 67,
    proposalDetailLogic: {
      hierarchy: "API 키 미설정 자리 표시입니다.",
      originality: "API 키 미설정 자리 표시입니다.",
      pronunciationLanguage: "API 키 미설정 자리 표시입니다.",
      legality: "API 키 미설정 자리 표시입니다.",
      publicAppeal: "API 키 미설정 자리 표시입니다.",
      scalability: "API 키 미설정 자리 표시입니다."
    }
  });

  if (mode === "generate" && tierPlan) {
    const n = Math.min(6, Math.max(1, tierPlan.stepCount || 3));
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      labels.push((tierPlan.labels[i] ?? "").trim() || `단계 ${i + 1}`);
    }
    const tierNamingAlternatives: TierNamingAlternativeGemini[] = [1, 2, 3, 4].map((alt) => {
      const tierSteps = labels.map((lb, ti) => ({
        tierLabel: lb,
        name: `예시${alt}·${ti + 1}단계`,
        rationale: "GEMINI_API_KEY 미설정 자리 표시입니다."
      }));
      return {
        storyline: `예시 세계관·스토리라인 ${alt}(API 키 없음). ${n}단계 네이밍은 이 서사에서 파생된다고 가정합니다.`,
        tierSteps,
        tierPackageEvaluation: {
          hierarchyScore: 65,
          legalityScore: 64,
          originalityDimensionScore: 60,
          pronunciationScore: 70,
          publicAppealScore: 66,
          scalabilityScore: 67,
          proposalDetailLogic: {
            hierarchy: "API 키 미설정 자리 표시입니다.",
            originality:
              "창의성(예시): 위 스토리라인과 각 단계 네이밍의 연결을 설명하는 자리입니다. 실제 생성 시 본문에 반영됩니다.",
            pronunciationLanguage: "API 키 미설정 자리 표시입니다.",
            legality: "API 키 미설정 자리 표시입니다.",
            publicAppeal: "API 키 미설정 자리 표시입니다.",
            scalability: "API 키 미설정 자리 표시입니다."
          }
        }
      };
    });
    const namingProposals = tierNamingAlternatives.map((a, i) => ({
      name: `[대안 ${i + 1}] ${a.tierSteps.map((t) => t.name).join(" → ")}`,
      rationale: a.storyline,
      hierarchyScore: a.tierPackageEvaluation.hierarchyScore,
      legalityScore: a.tierPackageEvaluation.legalityScore,
      originalityDimensionScore: a.tierPackageEvaluation.originalityDimensionScore,
      pronunciationScore: a.tierPackageEvaluation.pronunciationScore,
      publicAppealScore: a.tierPackageEvaluation.publicAppealScore,
      scalabilityScore: a.tierPackageEvaluation.scalabilityScore,
      proposalDetailLogic: { ...a.tierPackageEvaluation.proposalDetailLogic }
    }));
    return {
      overallScore: 62,
      hierarchyScore: 65,
      originalityDimensionScore: 58,
      pronunciationScore: 72,
      pronunciationLanguageScore: 72,
      legalityScore: 64,
      publicAppealScore: 66,
      scalabilityScore: 67,
      trademarkScore: 58,
      copyrightScore: 64,
      detailLogic: {
        hierarchy: "GEMINI_API_KEY가 없어 상세 논리는 자리 표시입니다.",
        originality: "API 키 설정 후 창의성 추론 근거가 채워집니다.",
        pronunciationLanguage: "API 키 설정 후 발음·언어 분석이 채워집니다.",
        legality: "API 키 설정 후 법령 연동 분석이 채워집니다.",
        publicAppeal: "API 키 설정 후 대중성 분석이 채워집니다.",
        scalability: "API 키 설정 후 확장성 분석이 채워집니다."
      },
      hierarchy: {
        status: "warning",
        message: "GEMINI_API_KEY 없음",
        details:
          "루트 .env에 GEMINI_API_KEY를 설정하고 서버를 재시작하면 U+ 브랜드 가이드라인 PDF와 업로드·입력 자료를 반영한 분석이 실행됩니다.",
        checklist: ["API 키 설정 필요", "가이드 PDF: data/guidelines/U+ 브랜드 가이드라인"]
      },
      trademark: {
        risk: "medium",
        conflicts: [],
        recommendation: "API 키 설정 후 상표 유사도 분석이 가능합니다."
      },
      copyright: {
        originality: 60,
        risks: [{ type: "설정", severity: "low", description: "API 키 미설정으로 모의 결과입니다." }],
        verdict: "실제 분석을 위해 GEMINI_API_KEY가 필요합니다."
      },
      finalSummary:
        "API 키가 없어 네이밍 후보를 생성하지 못했습니다. 키를 설정한 뒤 다시 시도하세요.",
      goRecommendation: "no-go",
      suggestedNames: namingProposals.map((p) => p.name),
      namingProposals,
      tierNamingAlternatives,
      additionalNamingSuggestions: []
    };
  }

  return {
    overallScore: 62,
    hierarchyScore: 65,
    originalityDimensionScore: 58,
    pronunciationScore: 72,
    pronunciationLanguageScore: 72,
    legalityScore: 64,
    publicAppealScore: 66,
    scalabilityScore: 67,
    trademarkScore: 58,
    copyrightScore: 64,
    detailLogic: {
      hierarchy: "GEMINI_API_KEY가 없어 상세 논리는 자리 표시입니다.",
      originality: "API 키 설정 후 창의성 추론 근거가 채워집니다.",
      pronunciationLanguage: "API 키 설정 후 발음·언어 분석이 채워집니다.",
      legality: "API 키 설정 후 법령 연동 분석이 채워집니다.",
      publicAppeal: "API 키 설정 후 대중성 분석이 채워집니다.",
      scalability: "API 키 설정 후 확장성 분석이 채워집니다."
    },
    hierarchy: {
      status: "warning",
      message: "GEMINI_API_KEY 없음",
      details:
        "루트 .env에 GEMINI_API_KEY를 설정하고 서버를 재시작하면 U+ 브랜드 가이드라인 PDF와 업로드·입력 자료를 반영한 분석이 실행됩니다.",
      checklist: ["API 키 설정 필요", "가이드 PDF: data/guidelines/U+ 브랜드 가이드라인"]
    },
    trademark: {
      risk: "medium",
      conflicts: [],
      recommendation: "API 키 설정 후 상표 유사도 분석이 가능합니다."
    },
    copyright: {
      originality: 60,
      risks: [{ type: "설정", severity: "low", description: "API 키 미설정으로 모의 결과입니다." }],
      verdict: "실제 분석을 위해 GEMINI_API_KEY가 필요합니다."
    },
    finalSummary:
      mode === "generate"
        ? "API 키가 없어 네이밍 후보를 생성하지 못했습니다. 키를 설정한 뒤 다시 시도하세요."
        : "API 키가 없어 검수를 수행하지 못했습니다.",
    goRecommendation: "no-go",
    suggestedNames: mode === "generate" ? [1, 2, 3, 4].map((n) => `예시 네이밍 ${n}`) : [],
    namingProposals: mode === "generate" ? [1, 2, 3, 4].map((i) => genProposal(i)) : [],
    /** 검수 NO-GO 시에도 UI·연동 일관성을 위해 대체안 예시(키 설정 시에는 실제 보조 생성으로 대체됨) */
    additionalNamingSuggestions:
      mode === "audit" ? ["루미넌트", "에버그레인", "넥스트웨이브"] : []
  };
}

function finalizeNamingResult(
  mode: "generate" | "audit",
  r: BrandNamingGeminiResult,
  opts?: {
    requestText?: string;
    generateProposalCount?: number;
    tieredPackage?: boolean;
    tierStepCount?: number;
    tierLabels?: string[];
    collaborationBrand?: string;
  }
): BrandNamingGeminiResult {
  const reqCtx = (opts?.requestText ?? "").trim();
  if (mode === "audit") {
    const overallScore = namingOverallWeightedFour(
      r.originalityDimensionScore,
      r.publicAppealScore,
      r.pronunciationLanguageScore,
      r.scalabilityScore
    );
    const additionalNamingSuggestions = Array.isArray(r.additionalNamingSuggestions)
      ? r.additionalNamingSuggestions.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
      : [];
    const pronunciationLanguage = ensureAuditPronunciationDetail(r.detailLogic.pronunciationLanguage, reqCtx);
    return {
      ...r,
      overallScore,
      namingProposals: [],
      suggestedNames: [],
      additionalNamingSuggestions,
      detailLogic: {
        ...r.detailLogic,
        pronunciationLanguage
      }
    };
  }

  /** 생성 전용: 상위 응답에 포함된 검수형 필드는 UI·워크스페이스 혼동을 막기 위해 비움(후보별 proposal만 유효) */
  const emptyHierarchy = {
    status: "aligned" as const,
    message: "",
    details: "",
    checklist: [] as string[]
  };

  /** 단계별(요금제): 대안 4개 × (N단계 + 세계관 + 패키지 6대 평가) */
  if (opts?.tieredPackage) {
    const nSteps = Math.min(6, Math.max(1, opts.tierStepCount ?? 3));
    const labels: string[] = [];
    const fromOpt = opts.tierLabels ?? [];
    for (let i = 0; i < nSteps; i++) {
      labels.push((fromOpt[i] ?? "").trim() || `단계 ${i + 1}`);
    }

    let alts: TierNamingAlternativeGemini[] = Array.isArray(r.tierNamingAlternatives)
      ? [...r.tierNamingAlternatives]
      : [];

    const rawProps = (r.namingProposals ?? []).filter((p) => p.name.trim().length > 0);
    if (alts.length === 0 && r.tierPackageEvaluation && rawProps.length === nSteps) {
      alts = [
        {
          storyline:
            "(이전 단일 패키지 응답 형식이었습니다. 네 가지 서로 다른 세계관·대안을 얻으려면 재생성해 주세요.)",
          tierSteps: rawProps.map((p, i) => ({
            tierLabel: labels[i] ?? `단계 ${i + 1}`,
            name: p.name,
            rationale: p.rationale || ""
          })),
          tierPackageEvaluation: r.tierPackageEvaluation
        }
      ];
    }

    while (alts.length < 4) {
      alts.push(synthesizeTierAlternativePlaceholder(alts.length + 1, nSteps, labels));
    }
    alts = alts
      .slice(0, 4)
      .map((alt, i) => normalizeTierAlternativeShape(alt, nSteps, labels, i + 1));

    const proposals = alts.map((alt, i) => ({
      name: `[대안 ${i + 1}] ${alt.tierSteps.map((t) => t.name).join(" → ")}`,
      rationale: alt.storyline,
      hierarchyScore: alt.tierPackageEvaluation.hierarchyScore,
      legalityScore: alt.tierPackageEvaluation.legalityScore,
      originalityDimensionScore: alt.tierPackageEvaluation.originalityDimensionScore,
      pronunciationScore: alt.tierPackageEvaluation.pronunciationScore,
      publicAppealScore: alt.tierPackageEvaluation.publicAppealScore,
      scalabilityScore: alt.tierPackageEvaluation.scalabilityScore,
      proposalDetailLogic: { ...alt.tierPackageEvaluation.proposalDetailLogic }
    }));

    const overallScore = Math.round(
      alts.reduce((s, a) => s + weightedTierPackageOverall(a.tierPackageEvaluation), 0) / 4
    );

    return applyCollaborationDisplaySuffixes(
      {
        ...r,
        overallScore,
        hierarchyScore: 0,
        originalityDimensionScore: 0,
        pronunciationScore: 0,
        pronunciationLanguageScore: 0,
        legalityScore: 0,
        trademarkScore: 0,
        copyrightScore: 0,
        detailLogic: {
          hierarchy: "",
          originality: "",
          pronunciationLanguage: "",
          legality: "",
          publicAppeal: "",
          scalability: ""
        },
        hierarchy: emptyHierarchy,
        trademark: { risk: "low" as const, conflicts: [], recommendation: "" },
        copyright: { originality: 0, risks: [], verdict: "" },
        finalSummary: "",
        goRecommendation: "go",
        namingProposals: proposals,
        suggestedNames: proposals.map((p) => p.name),
        additionalNamingSuggestions: [],
        tierNamingAlternatives: alts,
        tierPackageEvaluation: undefined
      },
      opts?.collaborationBrand ?? ""
    );
  }

  const expected =
    typeof opts?.generateProposalCount === "number" && opts.generateProposalCount >= 1
      ? Math.min(6, Math.max(1, Math.floor(opts.generateProposalCount)))
      : 4;
  let proposals = (r.namingProposals ?? []).filter((p) => p.name.trim().length > 0);
  const filler = (idx: number): BrandNamingProposalGemini => ({
    name: `보완 후보 ${idx}`,
    rationale:
      "모델 응답에서 항목 수가 부족해 자리를 채웠습니다. 동일 요청으로 다시 생성해 보세요.",
    hierarchyScore: 50,
    originalityDimensionScore: 50,
    pronunciationScore: 50,
    legalityScore: 50,
    publicAppealScore: 50,
    scalabilityScore: 50,
    proposalDetailLogic: {
      hierarchy: "자동 보완 항목입니다.",
      originality: "자동 보완 항목입니다.",
      pronunciationLanguage: "자동 보완 항목입니다.",
      legality: "자동 보완 항목입니다.",
      publicAppeal: "자동 보완 항목입니다.",
      scalability: "자동 보완 항목입니다."
    }
  });
  while (proposals.length < expected) {
    proposals.push(filler(proposals.length + 1));
  }
  proposals = proposals.slice(0, expected);
  const names = proposals.map((p) => p.name);

  return applyCollaborationDisplaySuffixes(
    {
      ...r,
      overallScore: 0,
      hierarchyScore: 0,
      originalityDimensionScore: 0,
      pronunciationScore: 0,
      pronunciationLanguageScore: 0,
      legalityScore: 0,
      trademarkScore: 0,
      copyrightScore: 0,
      detailLogic: {
        hierarchy: "",
        originality: "",
        pronunciationLanguage: "",
        legality: "",
        publicAppeal: "",
        scalability: ""
      },
      hierarchy: emptyHierarchy,
      trademark: { risk: "low" as const, conflicts: [], recommendation: "" },
      copyright: { originality: 0, risks: [], verdict: "" },
      finalSummary: "",
      goRecommendation: "go",
      namingProposals: proposals,
      suggestedNames: names,
      additionalNamingSuggestions: [],
      tierPackageEvaluation: undefined,
      tierNamingAlternatives: undefined
    },
    opts?.collaborationBrand ?? ""
  );
}

export async function runBrandNamingWithGemini(opts: {
  mode: "generate" | "audit";
  requestText: string;
  referenceNotes: string;
  guidelineBlock: string;
  /** 검수: 클라이언트가 보낸 auditCategory 전문 — Gemini 전용 지시(`namingCategoryGeminiDirectives`)와 결합 */
  auditCategoryRaw?: string;
  /** 생성: 국문 / 영문 / 제한없음(혼합 비율) */
  languageMode?: NamingLanguageMode;
  /** 생성: 일반 vs Collaboration(표기만 결합) */
  namingFormat?: NamingFormatMode;
  /** Collaboration 선택 시 타사 브랜드명 — name 뒤 ` l {brand}` 자동 부착 */
  collaborationBrand?: string;
  /** 생성: 일반(4안) vs 단계별 요금제 N안(1~6) */
  generatePlan?: { kind: "general" } | { kind: "tiered"; stepCount: number; labels: string[] };
}): Promise<BrandNamingGeminiResult> {
  const req = opts.requestText.trim();
  const tierPlan = opts.generatePlan?.kind === "tiered" ? opts.generatePlan : null;
  const stepCountForTier = tierPlan ? Math.min(6, Math.max(1, tierPlan.stepCount || 3)) : 0;
  /** 생성: names/namingProposals 길이 — 일반 4안 / 단계별은 대안 패키지 요약 4개 */
  const genCount = opts.mode === "generate" ? 4 : 4;
  const genProposalFinalizeCount = opts.mode === "generate" ? 4 : undefined;
  const finalizeOpts = {
    requestText: req,
    generateProposalCount: genProposalFinalizeCount,
    tieredPackage: Boolean(tierPlan),
    tierStepCount: tierPlan?.stepCount,
    tierLabels: tierPlan?.labels,
    collaborationBrand:
      opts.namingFormat === "collaboration" ? (opts.collaborationBrand ?? "").trim() : undefined
  };

  const key = getKey();
  if (!key) {
    return finalizeNamingResult(opts.mode, mockBrandNamingNoKey(opts.mode, tierPlan), finalizeOpts);
  }

  const genAI = new GoogleGenerativeAI(key);
  const guide = opts.guidelineBlock.slice(0, 75_000);
  const notes = opts.referenceNotes.trim() || "(없음)";

  const auditCategoryPromptSection = opts.auditCategoryRaw?.trim()
    ? buildAuditCategoryGeminiPromptSection(opts.auditCategoryRaw.trim())
    : "";

  /** 단계별 생성: Personal·Enterprise 등에 따른 스토리라인 톤 전용 지시 */
  const tierStorylineToneBlock =
    opts.mode === "generate" && tierPlan ? buildTierStorylineToneBlock(opts.auditCategoryRaw?.trim() ?? "") : "";

  /** 생성 공통: 친근·생활 밀착 세계관·스토리라인 톤 (단계별은 tier 블록에 포함) */
  const friendlyStorylineToneBlock =
    opts.mode === "generate" ? buildNamingFriendlyStorylineToneBlock() : "";
  const storylineToneSection =
    opts.mode === "generate"
      ? tierPlan
        ? tierStorylineToneBlock
        : friendlyStorylineToneBlock
      : "";

  const finishWithAuditNoGoFill = async (base: BrandNamingGeminiResult): Promise<BrandNamingGeminiResult> => {
    const r = finalizeNamingResult(opts.mode, base, finalizeOpts);
    if (opts.mode === "audit") {
      return ensureAuditNoGoHasAdditionalSuggestions(r, genAI, {
        requestText: opts.requestText,
        guidelineBlock: opts.guidelineBlock,
        referenceNotes: opts.referenceNotes,
        auditCategoryRaw: opts.auditCategoryRaw
      });
    }
    return r;
  };

  const modeIntro =
    opts.mode === "generate"
      ? tierPlan
        ? `작업 유형: **생성 (단계별·요금제 라인업)**.
- **필수 — tierNamingAlternatives**: 배열 길이 **정확히 4**. 각 원소 = **서로 다른 대안 패키지 1개**(서로 다른 세계관·스토리라인).
  - **storyline**: 이 대안에서 ${stepCountForTier}개 단계 네이밍이 **공유하는 하나의 세계관·스토리라인**(한국어 3~6문장). 모든 단계 이름이 이 서사에서 **일관되게 파생**되도록 서술(기본 전제). 아래 **【세계관·스토리라인 톤】** 블록을 **반드시** 따를 것.
${tierStorylineToneBlock ? `\n${tierStorylineToneBlock}\n` : ""}
  - **tierSteps**: 길이 **정확히 ${stepCountForTier}**, 순서는 [요청 내용] **[단계별 생성]** 단계 라벨과 동일. 각 원소: tierLabel, name, rationale.
  - **tierPackageEvaluation**: 이 대안 패키지 전체에 대한 통합 **6대 평가**(0~100) 및 hierarchyDetail·legalityDetail·originalityDetail·pronunciationDetail·**publicAppealDetail**·**scalabilityDetail**(각 한국어 3줄 이상). **창의성(originalityDetail)**에는 반드시 **storyline과 각 단계 name의 연결**을 구체적으로 서술. **대중성**은 부정 연상·문화권 오해·세대·글로벌 발음/의미·특정 집단 편향을, **확장성**은 패밀리 네이밍(Pro/Lite/+ 등)·글로벌 왜곡·파생·내구성을 반영.
- **names**·**namingProposals**·**suggestedNames**: 각각 **정확히 4**. i번째 항목은 **tierNamingAlternatives[i]의 요약 행**(name은 대안 식별 제목, description/rationale은 storyline 요약 또는 동일 복제). 후보별 점수·Detail은 **tierNamingAlternatives[i].tierPackageEvaluation**과 **일치**시킬 것.
- 루트 **tierPackageEvaluation**은 **쓰지 말 것**(레거시 단일 패키지용). 일반 생성과 혼동 금지.
- **additionalNamingSuggestions**: [].
- **적법성** 등은 각 대안의 **tierPackageEvaluation**에 반영. [참고 정보]에 국가법령정보가 있으면 **[법적 적법성]**에 인용하고, **[사회적 이슈·민감도]**는 Gemini 추론으로 병행 점검.
${NAMING_LEGALITY_PROMPT_RULES}
- 아래 [종합 검토 필드]는 생성 맥락 요약으로 채웁니다.${
            auditCategoryPromptSection
              ? `\n- **브랜드 계층 컨텍스트**: 아래 **[브랜드 계층 컨텍스트]** 블록이 있으면 4개 대안 패키지를 만들 때 **반드시** 그 계층·접두·독립 작명 룰을 따를 것.`
              : ""
          }`
        : `작업 유형: **생성 (일반 4안)**.
- **고정 응답 형식(반드시 준수)**: 루트에 **names** 배열과 **namingProposals** 배열을 **각각 정확히 ${genCount}개**로 채웁니다. 두 배열의 ${genCount}개 항목은 **동일한 네이밍·동일 순서**이며, 각 원소는 아래 키를 **모두** 채웁니다(빈 문자열·생략 금지):
  \`name\`, \`description\` (네이밍 설명·창작 근거, 한국어 3문장 이상 — 아래 **【세계관·스토리라인 톤】** 을 따를 것),
  \`hierarchyScore\`, \`hierarchyDetail\` (브랜드 계층 평가 상세, **한국어 3줄 이상**),
  \`uniquenessScore\`, \`uniquenessDetail\` (창의성 상세, **3줄 이상** — 가이드·요청·참고 정보만으로 유사·식별력 관점을 **Gemini 추론**으로 서술. 외부 상표 DB·연동 여부는 **언급하지 말 것**),
  \`pronunciationScore\`, \`pronunciationDetail\` (직관성·발음·언어 상세, **3줄 이상**),
  \`legalScore\`, \`legalDetail\` (적법성 상세 — **\`[법적 적법성]\`** / **\`[사회적 이슈·민감도]\`** 소제목, 각 **3줄 이상**),
  \`publicAppealScore\`, \`publicAppealDetail\` (**대중성**: 부정 연상·문화권 오해·세대·글로벌 발음/의미·편향 — **3줄 이상**),
  \`scalabilityScore\`, \`scalabilityDetail\` (**확장성**: 패밀리 네이밍·글로벌 왜곡·파생·내구성 — **3줄 이상**).
- **namingProposals**의 각 원소에도 위와 동일한 값을 넣되, 스키마상 **description** 필드는 **반드시** 채우고, **rationale**이 있으면 **description과 동일 문자열**로 맞추어도 됩니다.
- **tierNamingAlternatives**는 일반 생성에서 **빈 배열 []**.
${NAMING_LEGALITY_PROMPT_RULES}
- **후보별·루트 종합 해석**: **창의성×30% + 대중성×30% + 직관성×20% + 확장성×20%** (합 100%). 브랜드계층·적법 점수는 **종합 가중합에 넣지 않음**(Pass/Fail·NO-GO만). 루트 **pronunciationLanguageScore**는 **pronunciationScore와 동일 정수**로 맞출 것.
- **직관성·대중성·확장성**: 각 후보마다 호명 용이성·사회문화 수용·브랜드 생태계 확장을 반영해 점수·Detail을 채웁니다.
- **suggestedNames**는 **names** 또는 **namingProposals**의 **name**과 같은 순서·같은 ${genCount}개 문자열 배열.
- **additionalNamingSuggestions**는 생성 모드에서 **반드시 빈 배열 []**.
- 아래 [종합 검토 필드](overallScore, hierarchy, trademark, copyright 등)는 생성 맥락 요약으로 채웁니다.${
            auditCategoryPromptSection
              ? `\n- **브랜드 계층 컨텍스트**: 아래 **[브랜드 계층 컨텍스트]** 블록이 있으면 ${genCount}개 네이밍 제안을 만들 때 **반드시** 그 계층·접두·독립 작명 룰을 따를 것. 룰과 충돌하는 상위 브랜드 접두를 임의로 붙이지 말 것.`
              : ""
          }`
      : `작업 유형: **검수**. [요청 내용]의 네이밍·슬로건을 아래 **6개 항목**(표시·서술 순서)으로 채점합니다. 각 항목은 0~100점입니다. **종합 overallScore는 서버에서 창의성×0.3 + 대중성×0.3 + 직관성×0.2 + 확장성×0.2 로 재계산**합니다. **브랜드 계층 정렬·적법성은 종합 가중합에 포함하지 않으며**, 70점 미만이면 Fail·NO-GO 조건에 반드시 포함합니다.
- **(1) hierarchyScore 브랜드 계층 정렬** — 오직 [U+ 브랜드 가이드라인 및 참고 문맥] 안의 **가이드라인 PDF 요약** + [참고 정보]의 **업로드 파일 요약** + **참고 정보 직접 입력**만 근거로 분석·채점. 법령 검색 블록은 이 항목에 **넣지 마세요**. (**Pass/Fail 전용 · 종합 미포함**, 70 미만 NO-GO)
- **(2) legalityScore 적법성** — **(가) 법적 적법성**: 참고 정보에 **국가법령정보·법령 검색** 요약이 있으면 인용·출처를 밝히고 상표법·저작권법·표시광고법 관점을 채점. 없으면 일반론으로 보완. **(나) 사회적 이슈·민감도**: **Gemini 추론**으로 혐오·차별·선민·역사·정치·군사·기념일 등 민감 연상, 부적절한 이벤트·캠페인 논란·대외 PR 리스크를 **사전 점검**(유사 브랜드 사례는 확실히 아는 경우에만 유형 참고). **detailLogicLegality**는 **\`[법적 적법성]\`** / **\`[사회적 이슈·민감도]\`** 소제목 필수. (**Pass/Fail 전용 · 종합 미포함**, 70 미만 NO-GO)
- **(3) originalityDimensionScore 창의성** — **오직 Gemini 추론**으로 가이드·요청·참고 정보를 바탕으로 유사·식별력 관점에서 채점. **외부 데이터베이스 연동·조회 여부는 결과에 절대 언급하지 말 것.** trademarkConflicts는 분석 보조용 추론 결과로만 채움. (**종합 30%**)
- **(4) publicAppealScore 대중성(사회·문화적 수용 가능성)** — **Gemini 추론**으로 (가) 특정 문화권·언어에서 **오해·불쾌·부정적 연상** (나) **세대 범용성** (다) **글로벌 발음·의미** 문제 (라) **특정 집단·계층 편향** 여부를 평가. **사회적 레드라인**(혐오·차별·선민·정치·역사 민감 등)은 **적법성**에서 NO-GO로 판단하고, 대중성은 **일반적 수용·톤·세대 fit**에 집중. **detailLogicPublicAppeal**에 근거를 최소 수백 자 한국어로. (**종합 30%**)
- **(5) pronunciationScore / pronunciationLanguageScore 직관성(발음·언어)** — 검수 대상 네이밍·슬로건에 대해 (가) 한국어·영어로 읽을 때 **발음의 자연스러움·호명 용이성** (나) 주요 외국어에서 **부정·비하·불쾌·금기 의미** 연상 여부를 평가하세요. **pronunciationLanguageScore**는 **pronunciationScore와 동일한 정수**로 맞추세요. **detailLogicPronunciation**에는 위 근거·보완·유의사항을 최소 수백 자 한국어로 서술. 녹음·발음기호 출력 불요. (**종합 20%**)
- **(6) scalabilityScore 확장성(브랜드 생태계)** — **Gemini 추론**으로 (가) **하위/상위·패밀리 네이밍**(Pro, Lite, + 등) 연동 가능성 (나) 글로벌 확장 시 **발음·의미 왜곡** (다) **파생 네이밍·슬로건·캠페인**으로의 확장 (라) **시간이 지나도 촌스럽지 않은 내구성**을 평가. **detailLogicScalability**에 근거를 최소 수백 자 한국어로. (**종합 20%**)
- **names**·**namingProposals**·**suggestedNames**는 모두 빈 배열 [].
- **additionalNamingSuggestions** (검수 필수): 위 평가 맥락(가이드·작명 의도·검토 결과)을 반영한 **대안 네이밍을 정확히 3개**, 배열로만 제시하세요. 검수명·슬로건과 **다른** 실제 후보명(한글·영문 등). 안내 문구·주석·※ 같은 비이름 문자열 금지. 빈 배열 금지.
- **detailLogicHierarchy** ~ **detailLogicScalability**: 각 항목에 대해 **상세 논리**를 한국어로 길게 서술. **detailLogicHierarchy**에는 외부 상표 DB·연동 출처를 **넣지 말 것**(가이드·업로드·직접입력만). **detailLogicOriginality**에는 외부 API 연동·조회 성공/실패를 **절대 넣지 말 것.** **detailLogicLegality**는 **\`[법적 적법성]\`** / **\`[사회적 이슈·민감도]\`** 두 소제목으로 작성. 국가법령정보 요약을 썼다면 **출처를 문장 안에 명시**할 수 있음. trademark·copyright 하위 필드는 요약·충돌 목록용으로 유지.${
        auditCategoryPromptSection
          ? "\n- **브랜드 계층 컨텍스트 우선**: 아래 **[브랜드 계층 컨텍스트]** 블록이 있으면 계층 정렬·마스터브랜드(U+) 해석에 그 룰을 가이드 PDF 요약과 함께 적용하고, 룰·마지막 불릿이 허용하는 독립 네이밍은 **U+ 미포함만으로** 위반·감점·NO-GO로 연결하지 말 것."
          : ""
      }`;

  const generateExtraRule =
    opts.mode === "generate"
      ? tierPlan
        ? `\n5) **tierNamingAlternatives** 길이는 반드시 **4**입니다.\n6) 각 대안의 **tierSteps** 길이는 **${stepCountForTier}**입니다.\n7) 각 **tierPackageEvaluation**의 여섯 Detail은 **한국어 3줄 이상**(legalityDetail은 **[법적 적법성]**/**[사회적 이슈·민감도]** 소제목).\n8) **names·namingProposals·suggestedNames** 길이는 각각 **4**(대안 패키지 요약).\n9) **additionalNamingSuggestions**는 [].\n10) 루트 **tierPackageEvaluation**은 출력하지 마세요.`
        : `\n5) **names**·**namingProposals** 길이는 각각 반드시 ${genCount}입니다.\n6) 각 후보의 hierarchyDetail·uniquenessDetail·pronunciationDetail·legalDetail·publicAppealDetail·scalabilityDetail은 **한국어 3줄 이상**(legalDetail은 **[법적 적법성]**/**[사회적 이슈·민감도]** 소제목).\n7) **additionalNamingSuggestions**는 반드시 빈 배열 [].\n8) **tierNamingAlternatives**는 빈 배열 [].`
      : "";

  const jsonOnlyFooter = "\n\n반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 마세요.";

  const namingGenerationRuleSection =
    opts.mode === "generate"
      ? buildNamingGenerationRuleBlockFromAuditRaw(opts.auditCategoryRaw?.trim() ?? "")
      : "";

  const languageMode: NamingLanguageMode =
    opts.languageMode === "ko" || opts.languageMode === "en" ? opts.languageMode : "unlimited";
  const namingLanguageSection =
    opts.mode === "generate" ? buildNamingLanguagePromptBlock(languageMode, Boolean(tierPlan)) : "";

  const collaborationFormatSection =
    opts.mode === "generate" && opts.namingFormat === "collaboration"
      ? `【Collaboration 표기 — 생성 규칙】
- **name** 필드에는 **U+ 측 네이밍만** 출력하세요.
- \` l \` 접미사·타사 브랜드명은 **서버에서 자동 부착**하므로 name·tierSteps.name에 **포함하지 마세요**.`
      : "";

  const prompt = `역할: 브랜드 네이밍 전략가이자 지식재산 검토 보조입니다.
${modeIntro}${
    namingGenerationRuleSection
      ? `\n\n【네이밍 생성 규칙 — 선택 카테고리】\n${namingGenerationRuleSection}\n`
      : ""
  }${
    namingLanguageSection ? `\n\n${namingLanguageSection}\n` : ""
  }${
    collaborationFormatSection ? `\n\n${collaborationFormatSection}\n` : ""
  }${
    storylineToneSection ? `\n\n${storylineToneSection}\n` : ""
  }

[U+ 브랜드 가이드라인 및 참고 문맥]
${guide}

${auditCategoryPromptSection ? `${auditCategoryPromptSection}\n\n` : ""}[사용자가 추가로 입력한 참고 정보·업로드 요약 등]
${notes}

[요청 내용 — 반드시 이 텍스트를 분석의 중심에 둘 것]
${req}

규칙:
1) 점수는 0~100 정수. 검수 시 **hierarchyScore, legalityScore, originalityDimensionScore, publicAppealScore, pronunciationScore, pronunciationLanguageScore(=pronunciationScore와 동일), scalabilityScore**를 채우고, trademarkScore·copyrightScore는 레거시 호환용으로 맞게 채웁니다. **종합 overallScore**는 창의·대중·직관·확장 가중합으로 서버가 재계산합니다.
2) 상표법·저작권은 **참고 수준**이며 법률 자문이 아님.
3) 국가법령정보 블록이 있으면 **적법성**의 **[법적 적법성]** 서술에 반영합니다. **[사회적 이슈·민감도]**는 Gemini 추론으로 병행합니다. **창의성**은 국가법령정보와 무관하게 가이드·요청·Gemini 추론만으로 서술합니다. 창의성 보완은 trademarkConflicts 등 **추론 결과**로만 합니다.
4) 출력은 JSON 한 개만. 스키마 키 이름을 정확히 맞추세요.${generateExtraRule}${jsonOnlyFooter}`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: brandNamingResponseSchema
      }
    });
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      console.log("[gemini] brand naming raw response:", raw);
      const parsed = parseBrandNamingPayload(raw);
      if (parsed) return finishWithAuditNoGoFill(parsed);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[gemini] brand naming model=${modelId} → 다음 모델 시도`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
    try {
      const modelPlain = genAI.getGenerativeModel({ model: modelId });
      const result = await modelPlain.generateContent(
        `${prompt}\n\n응답: 위 필드를 모두 포함한 JSON만 출력하세요.`
      );
      const rawPlain = result.response.text();
      console.log("[gemini] brand naming raw response (plain):", rawPlain);
      const parsed = parseBrandNamingPayload(rawPlain);
      if (parsed) return finishWithAuditNoGoFill(parsed);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }

  const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const failBase = mockBrandNamingNoKey(opts.mode, tierPlan);
  return finishWithAuditNoGoFill({
    ...failBase,
    overallScore: 55,
    hierarchy: {
      ...failBase.hierarchy,
      message: "분석 실패",
      details: errMsg.slice(0, 800)
    },
    finalSummary: `Gemini 호출 실패: ${errMsg.slice(0, 400)}`
  });
}
