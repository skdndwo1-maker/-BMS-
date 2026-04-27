import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { captureDesignCanvas } from "@/lib/designCanvasCapture";
import { toast } from "sonner";
import { Loader2, Type, Scan, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DesignContent } from "@/design/types";
import {
  applyDesignEditorViolation,
  applyImageDataUrl,
  applyViTypographyToContent,
} from "@/design/applyViPatch";
import {
  correctDesignCanvas,
  inspectDesignCanvas,
  replaceDesignImage,
  suggestDesignText,
  type DesignEditorInspectResponse,
  type DesignEditorViolation,
  type DesignEditorTextSuggestionTarget,
  type DesignEditorTextSuggestionResult,
} from "@/lib/designEditorApi";
import {
  DEFAULT_POSTER_SUBTITLE_RECT,
  DEFAULT_POSTER_SUBTITLE_OFFSET_Y,
  DEFAULT_POSTER_BODY_EXTRA_1,
  DEFAULT_POSTER_BODY_EXTRA_2,
} from "@/design/posterDefaults";
import { resolvePosterBodyBlocksForRender } from "@/design/posterBodyDisplay";

function sanitizeDesignContent(c: DesignContent): Record<string, unknown> {
  const o = { ...c } as Record<string, unknown>;
  if (c.image instanceof File) o.image = `(file:${c.image.name})`;
  if (c.logo instanceof File) o.logo = `(file:${c.logo.name})`;
  if (c.ciImage instanceof File) o.ciImage = `(file:${c.ciImage.name})`;
  if (c.biImage instanceof File) o.biImage = `(file:${c.biImage.name})`;
  if (c.sloganImage instanceof File) o.sloganImage = `(file:${c.sloganImage.name})`;
  if (c.partnerLogo instanceof File) o.partnerLogo = `(file:${c.partnerLogo.name})`;
  if (typeof c.image === "string" && c.image.startsWith("data:")) o.image = "[inline-image]";
  if (Array.isArray(c.assetLayers)) {
    o.assetLayers = c.assetLayers.map((a) => ({
      ...a,
      src: typeof a.src === "string" && a.src.startsWith("data:") ? "[data-url]" : a.src,
    }));
  }
  return o;
}

function pickTextForTarget(
  target: DesignEditorTextSuggestionTarget,
  out: DesignEditorTextSuggestionResult
): string {
  switch (target) {
    case "mainTitle":
      return out.mainTitle;
    case "subtitle":
      return out.subtitleLine;
    case "subtitle2":
      return out.subtitleLine2;
    case "subtitle3":
      return out.subtitleLine3;
    case "body":
      return out.bodyText;
    case "body2":
      return out.bodyText2;
    case "body3":
      return out.bodyText3;
    case "footer":
      return out.emphasizedTitle;
    default:
      return "";
  }
}

function labelForTextTarget(t: DesignEditorTextSuggestionTarget): string {
  const m: Record<DesignEditorTextSuggestionTarget, string> = {
    mainTitle: "메인 타이틀",
    subtitle: "부제 1",
    subtitle2: "부제 2",
    subtitle3: "부제 3",
    body: "본문 1",
    body2: "본문 2",
    body3: "본문 3",
    footer: "유의사항",
  };
  return m[t];
}

const SUBTITLE_TARGETS = ["subtitle", "subtitle2", "subtitle3"] as const satisfies readonly DesignEditorTextSuggestionTarget[];
const BODY_TARGETS = ["body", "body2", "body3"] as const satisfies readonly DesignEditorTextSuggestionTarget[];

/** 우측 패널의 부제·본문 슬롯 수와 동일한 개수의 제안 행 (부제 0~3, 본문 1~3, 유의사항 1) */
function buildPanelSyncedTextSections(content: DesignContent): {
  heading: string;
  items: [DesignEditorTextSuggestionTarget, string][];
}[] {
  const sections: { heading: string; items: [DesignEditorTextSuggestionTarget, string][] }[] = [
    { heading: "메인 타이틀", items: [["mainTitle", "제안 받기"]] },
  ];
  const subs = content.posterSubtitles ?? [];
  for (let i = 0; i < subs.length; i++) {
    const key = SUBTITLE_TARGETS[i];
    if (key) sections.push({ heading: `부제 ${i + 1}`, items: [[key, "제안 받기"]] });
  }
  const bodies = resolvePosterBodyBlocksForRender(content);
  for (let i = 0; i < bodies.length; i++) {
    const key = BODY_TARGETS[i];
    if (key) sections.push({ heading: `본문 ${i + 1}`, items: [[key, "제안 받기"]] });
  }
  sections.push({ heading: "유의사항", items: [["footer", "제안 받기"]] });
  return sections;
}

function ensureSubtitleSlot(c: DesignContent, index: number): DesignContent {
  const subs = [...(c.posterSubtitles ?? [])];
  const rects = { ...(c.posterSubtitleRects ?? {}) };
  while (subs.length <= index) {
    const id = `sub-${Date.now()}-${subs.length}`;
    const si = subs.length;
    subs.push({ id, text: "" });
    rects[id] = {
      ...DEFAULT_POSTER_SUBTITLE_RECT,
      y: Math.min(0.78, DEFAULT_POSTER_SUBTITLE_RECT.y + si * DEFAULT_POSTER_SUBTITLE_OFFSET_Y),
    };
  }
  return { ...c, posterSubtitles: subs, posterSubtitleRects: rects };
}

function ensureBodySlot(c: DesignContent, index: number): DesignContent {
  const bodies = c.posterBodies?.length
    ? [...c.posterBodies]
    : [{ id: "body-1", text: c.bodyText ?? "" }];
  const rects = { ...(c.posterBodyRects ?? {}) };
  while (bodies.length <= index) {
    const idx = bodies.length;
    const id = `body-${Date.now()}-${idx}`;
    const rect = idx === 1 ? DEFAULT_POSTER_BODY_EXTRA_1 : DEFAULT_POSTER_BODY_EXTRA_2;
    bodies.push({ id, text: "" });
    rects[id] = rect;
  }
  return { ...c, posterBodies: bodies, posterBodyRects: rects };
}

/** RCS 등: 패널과 슬롯 동기 없이 고정 구성 */
const AI_TEXT_SECTIONS_RCS: { heading: string; items: [DesignEditorTextSuggestionTarget, string][] }[] = [
  { heading: "메인 타이틀", items: [["mainTitle", "제안 받기"]] },
  { heading: "본문", items: [["body", "제안 받기"]] },
];

type AssistantTab = "text" | "inspect" | "correct";

export function DesignAssistantChat({
  content,
  onApplyContent,
  templateId,
  guidelineId = "uplus-brand-guideline",
  /** false: RCS 고정(메인·본문 1) · true: 우측 패널 부제·본문 슬롯 수와 동기(최대 각 3) */
  panelSyncedTextSuggest = false,
}: {
  content: DesignContent;
  onApplyContent: (next: DesignContent) => void;
  templateId: string;
  guidelineId?: string;
  panelSyncedTextSuggest?: boolean;
}) {
  const [tab, setTab] = useState<AssistantTab>("text");
  const [loading, setLoading] = useState(false);
  /** 제작물 주제 — VI 가이드와 함께 모든 AI 제안·검수·교정에 반영 */
  const [creativeTopic, setCreativeTopic] = useState("");

  const [textBusy, setTextBusy] = useState<DesignEditorTextSuggestionTarget | null>(null);
  const [textPreview, setTextPreview] = useState<{
    target: DesignEditorTextSuggestionTarget;
    text: string;
  } | null>(null);

  const [inspection, setInspection] = useState<DesignEditorInspectResponse | null>(null);
  /** 검수 결과를 별도 팝업으로 보여줌 */
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [lastCapture, setLastCapture] = useState<{ base64: string; mime: string } | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewViolation, setPreviewViolation] = useState<DesignEditorViolation | null>(null);
  const [previewStaged, setPreviewStaged] = useState<DesignContent | null>(null);

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageStagedUrl, setImageStagedUrl] = useState<string | null>(null);
  const [imageTargetViolation, setImageTargetViolation] = useState<DesignEditorViolation | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  /** 텍스트 제안 탭 하위(카테고리·미리보기) 접기 */
  const [textSuggestSectionOpen, setTextSuggestSectionOpen] = useState(false);

  const textSuggestSections = useMemo(() => {
    if (panelSyncedTextSuggest) return buildPanelSyncedTextSections(content);
    return AI_TEXT_SECTIONS_RCS;
  }, [panelSyncedTextSuggest, content]);

  useEffect(() => {
    if (!textPreview) return;
    const valid = new Set(textSuggestSections.flatMap((s) => s.items.map((x) => x[0])));
    if (!valid.has(textPreview.target)) setTextPreview(null);
  }, [textPreview, textSuggestSections]);

  const captureCanvas = useCallback(async () => {
    const el = document.getElementById("design-canvas");
    if (!el) throw new Error("canvas_missing");
    const canvas = await captureDesignCanvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const cap = { base64, mime: "image/png" as const };
    setLastCapture(cap);
    return cap;
  }, []);

  const runSuggestText = async (target: DesignEditorTextSuggestionTarget) => {
    setTextBusy(target);
    setLoading(true);
    try {
      const out = await suggestDesignText({
        contentJson: JSON.stringify(sanitizeDesignContent(content)),
        templateLabel: templateId,
        targets: [target],
        guidelineId,
        creativeTopic: creativeTopic.trim() || undefined,
      });
      const text = pickTextForTarget(target, out);
      if (!text?.trim()) {
        toast.error("제안 문구가 비어 있습니다. GEMINI_API_KEY와 가이드 등록을 확인해 주세요.");
        return;
      }
      setTextPreview({ target, text: text.trim() });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "문구 제안에 실패했습니다.");
    } finally {
      setTextBusy(null);
      setLoading(false);
    }
  };

  const applyTextSuggestion = () => {
    if (!textPreview) return;
    const t = textPreview.target;
    const txt = textPreview.text;
    let next: DesignContent = { ...content };

    if (t === "mainTitle") next.title = txt;
    else if (t === "footer") next.emphasizedTitle = txt;
    else if (t === "body") {
      next = ensureBodySlot(next, 0);
      const bodies = [...(next.posterBodies ?? [])];
      if (bodies[0]) bodies[0] = { ...bodies[0], text: txt };
      next = { ...next, posterBodies: bodies };
      if (bodies[0]?.id === "body-1") next.bodyText = txt;
    } else if (t === "body2") {
      next = ensureBodySlot(next, 1);
      const bodies = [...(next.posterBodies ?? [])];
      if (bodies[1]) bodies[1] = { ...bodies[1], text: txt };
      next = { ...next, posterBodies: bodies };
    } else if (t === "body3") {
      next = ensureBodySlot(next, 2);
      const bodies = [...(next.posterBodies ?? [])];
      if (bodies[2]) bodies[2] = { ...bodies[2], text: txt };
      next = { ...next, posterBodies: bodies };
    } else if (t === "subtitle") {
      next = ensureSubtitleSlot(next, 0);
      const subs = [...(next.posterSubtitles ?? [])];
      if (subs[0]) subs[0] = { ...subs[0], text: txt };
      next = { ...next, posterSubtitles: subs };
    } else if (t === "subtitle2") {
      next = ensureSubtitleSlot(next, 1);
      const subs = [...(next.posterSubtitles ?? [])];
      if (subs[1]) subs[1] = { ...subs[1], text: txt };
      next = { ...next, posterSubtitles: subs };
    } else if (t === "subtitle3") {
      next = ensureSubtitleSlot(next, 2);
      const subs = [...(next.posterSubtitles ?? [])];
      if (subs[2]) subs[2] = { ...subs[2], text: txt };
      next = { ...next, posterSubtitles: subs };
    }

    next = applyViTypographyToContent(next);
    onApplyContent(next);
    setTextPreview(null);
    toast.success("캔버스에 적용했습니다.");
  };

  const runInspect = async () => {
    setLoading(true);
    try {
      const { base64, mime } = await captureCanvas();
      const res = await inspectDesignCanvas({
        imageBase64: base64,
        imageMime: mime,
        designContent: sanitizeDesignContent(content),
        templateId,
        guidelineId,
        creativeTopic: creativeTopic.trim() || undefined,
      });
      setInspection(res);
      setInspectDialogOpen(true);
      toast.success("디자인 검수가 완료되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "검수에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** 검수 후 후속 교정: 결과 이미지를 즉시 캔버스에 적용 (사용자는 그대로 추가 편집 가능) */
  const runInspectCorrection = async () => {
    if (!inspection) {
      toast.error("먼저 캔버스 검수를 실행해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const cap = lastCapture ?? (await captureCanvas());
      const out = await correctDesignCanvas({
        designBase64: cap.base64,
        designMime: cap.mime,
        guidelineId,
        mode: "inspection_followup",
        overallSummary: inspection.overallSummary,
        creativeTopic: creativeTopic.trim() || undefined,
        violations:
          inspection.violations.length > 0
            ? inspection.violations.map((v) => ({
                category: v.category,
                issue: v.issue,
                severity: v.severity,
              }))
            : undefined,
      });
      const url = `data:${out.mimeType};base64,${out.data}`;
      onApplyContent({
        ...content,
        image: url,
        posterBackgroundImageRect: { x: 0, y: 0, width: 1, height: 1 },
        posterImageOpacity: 100,
        posterImagePosX: 50,
        posterImagePosY: 50,
      });
      setInspectDialogOpen(false);
      toast.success("교정안을 캔버스에 적용했습니다. 필요 시 추가 편집이 가능합니다.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "교정 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** 전체 VI 교정: 결과 이미지를 즉시 캔버스에 적용 */
  const runHolisticCorrection = async () => {
    setLoading(true);
    try {
      const { base64, mime } = await captureCanvas();
      const out = await correctDesignCanvas({
        designBase64: base64,
        designMime: mime,
        guidelineId,
        mode: "holistic",
        creativeTopic: creativeTopic.trim() || undefined,
      });
      const url = `data:${out.mimeType};base64,${out.data}`;
      onApplyContent({
        ...content,
        image: url,
        posterBackgroundImageRect: { x: 0, y: 0, width: 1, height: 1 },
        posterImageOpacity: 100,
        posterImagePosX: 50,
        posterImagePosY: 50,
      });
      toast.success("전체 VI 교정안을 캔버스에 적용했습니다. 필요 시 추가 편집이 가능합니다.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "교정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const openTextPreview = (v: DesignEditorViolation) => {
    const staged = applyDesignEditorViolation(content, v);
    setPreviewViolation(v);
    setPreviewStaged(staged);
    setPreviewOpen(true);
  };

  const applyPreview = () => {
    if (!previewStaged) return;
    onApplyContent(previewStaged);
    setPreviewOpen(false);
    setPreviewViolation(null);
    setPreviewStaged(null);
    toast.success("변경을 적용했습니다.");
  };

  const handleImageFix = async (v: DesignEditorViolation) => {
    const brief = v.imageReplacementBrief?.trim();
    if (!brief) {
      toast.error("이미지 교체 지시가 비어 있습니다.");
      return;
    }
    setImageBusy(true);
    try {
      const cap = lastCapture ?? (await captureCanvas());
      const out = await replaceDesignImage({
        designBase64: cap.base64,
        designMime: cap.mime,
        imageBrief: brief,
        guidelineId,
        creativeTopic: creativeTopic.trim() || undefined,
      });
      const url = `data:${out.mimeType};base64,${out.data}`;
      setImageStagedUrl(url);
      setImageTargetViolation(v);
      setImageDialogOpen(true);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "이미지 생성에 실패했습니다.");
    } finally {
      setImageBusy(false);
    }
  };

  const applyImageStaged = () => {
    if (!imageStagedUrl || !imageTargetViolation) return;
    onApplyContent(applyImageDataUrl(content, imageStagedUrl, imageTargetViolation.targetAssetLayerId));
    setImageDialogOpen(false);
    setImageStagedUrl(null);
    setImageTargetViolation(null);
    toast.success("이미지를 적용했습니다.");
  };

  const handleFixClick = (v: DesignEditorViolation) => {
    if (v.fixKind === "image") {
      void handleImageFix(v);
      return;
    }
    openTextPreview(v);
  };

  const tabBtn = (id: AssistantTab, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => {
        setTab(id);
        if (id === "text") setTextSuggestSectionOpen(true);
      }}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors ${
        tab === id ? "bg-white text-[#F43182] shadow-sm" : "text-gray-600 hover:bg-white/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-snug text-gray-500">
        모든 AI 기능은 서버의 <span className="font-medium text-gray-700">브랜드 VI 가이드라인</span>(등록된 참조
        가이드)과 Gemini API를 사용합니다.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="design-creative-topic" className="text-[11px] font-medium text-gray-700">
          주제
        </Label>
        <Textarea
          id="design-creative-topic"
          value={creativeTopic}
          onChange={(e) => setCreativeTopic(e.target.value)}
          placeholder={"예) 5G 가입 프로모션 안내. 메인 타이틀/본문 톤·길이를 주제에 적으면 제안에 반영됩니다."}
          rows={2}
          className="min-h-[52px] resize-y text-[11px]"
        />
        <p className="text-[10px] text-gray-400">텍스트 제안·검수·교정에 함께 넘깁니다.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-gray-100/90 p-1">
        {tabBtn("text", "텍스트 제안", <Type className="h-3.5 w-3.5" />)}
        {tabBtn("inspect", "디자인 검수", <Scan className="h-3.5 w-3.5" />)}
        {tabBtn("correct", "디자인 교정", <Wand2 className="h-3.5 w-3.5" />)}
      </div>

      {tab === "text" && (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5">
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-gray-600">
              전체 문맥·목적을 반영한 U+ Simple 톤 문안을 제안합니다.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-gray-500 hover:text-gray-800"
              title={textSuggestSectionOpen ? "접기" : "펼치기"}
              aria-expanded={textSuggestSectionOpen}
              onClick={() => setTextSuggestSectionOpen((o) => !o)}
            >
              {textSuggestSectionOpen ? (
                <ChevronUp className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
          {textSuggestSectionOpen ? (
            <div className="space-y-3">
              <div className="space-y-2.5">
                {textSuggestSections.map((sec) => (
                  <div
                    key={sec.heading}
                    className="rounded-lg border border-gray-200 bg-white/90 p-2 shadow-sm"
                  >
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {sec.heading}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {sec.items.map(([key, label]) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px]"
                          disabled={loading}
                          onClick={() => void runSuggestText(key)}
                        >
                          {textBusy === key ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {textPreview && (
                <div className="rounded-lg border border-[#F43182]/25 bg-white p-2 text-[11px]">
                  <p className="mb-1 font-medium text-gray-800">제안 ({labelForTextTarget(textPreview.target)})</p>
                  <p className="whitespace-pre-wrap text-gray-700">{textPreview.text}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setTextPreview(null)}>
                      취소
                    </Button>
                    <Button type="button" size="sm" className="h-7 bg-[#F43182] text-[11px]" onClick={applyTextSuggestion}>
                      적용
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {tab === "inspect" && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-600">
            캔버스 캡처를 VI 가이드와 비교해 위반·교정 포인트를 검수합니다. 결과는 팝업으로 표시됩니다.
          </p>
          <Button
            type="button"
            size="sm"
            className="w-full bg-violet-600 hover:bg-violet-700"
            disabled={loading}
            onClick={() => void runInspect()}
          >
            {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Scan className="mr-2 h-3.5 w-3.5" />}
            캔버스 검수 실행
          </Button>
          {inspection ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setInspectDialogOpen(true)}
            >
              직전 검수 결과 다시 보기
            </Button>
          ) : null}
        </div>
      )}

      {tab === "correct" && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-600">
            뱃지·타이틀·본문·유의·이미지·픽토그램·일러스트 등을 VI에 맞게 한 번에 시각 교정해 캔버스에 즉시 반영합니다. 적용 후 추가 편집이 가능합니다.
          </p>
          <Button
            type="button"
            size="sm"
            className="w-full bg-gradient-to-r from-[#F43182] to-purple-600"
            disabled={loading}
            onClick={() => void runHolisticCorrection()}
          >
            {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
            전체 VI 교정 실행
          </Button>
        </div>
      )}

      {loading && tab !== "inspect" && (
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          처리 중…
        </div>
      )}

      <Dialog open={inspectDialogOpen} onOpenChange={setInspectDialogOpen}>
        <DialogContent
          className="w-[min(96vw,920px)] max-h-[88vh] overflow-y-auto sm:!max-w-[920px] p-5 !grid-cols-1"
          style={{ backgroundColor: "#f3f4f6", isolation: "isolate", zIndex: 1001 }}
        >
          <DialogHeader className="!text-left">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <DialogTitle className="text-base">디자인 검수 결과</DialogTitle>
              {inspection ? (
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                  점수 {inspection.score}점
                </span>
              ) : null}
            </div>
          </DialogHeader>

          {inspection ? (
            <div className="flex flex-col gap-4 text-sm text-gray-800">
              <div
                className="w-full rounded-lg border border-gray-200 p-4 text-[13px] leading-relaxed whitespace-pre-wrap shadow-sm"
                style={{ backgroundColor: "#ffffff" }}
              >
                {inspection.overallSummary || "요약 정보가 없습니다."}
              </div>

              {inspection.violations.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-700">검수 항목 ({inspection.violations.length})</p>
                  <ul
                    className="!grid !grid-cols-1 gap-3 md:!grid-cols-2"
                    style={{ display: "grid" }}
                  >
                    {inspection.violations.map((v, i) => (
                      <li
                        key={i}
                        className="flex flex-col rounded-lg border border-gray-200 p-3 text-[12px] leading-relaxed shadow-sm"
                        style={{ backgroundColor: "#ffffff" }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            {v.category}
                          </span>
                          {v.severity ? (
                            <span className="text-[11px] text-gray-500">[{v.severity}]</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-[12px] text-gray-800">{v.issue}</p>
                        <div className="mt-auto pt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            disabled={loading || imageBusy}
                            onClick={() => handleFixClick(v)}
                          >
                            {v.fixKind === "image" ? "이미지 수정" : "부분 수정"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  className="rounded-lg border border-gray-200 p-4 text-xs text-gray-500 shadow-sm"
                  style={{ backgroundColor: "#ffffff" }}
                >
                  중요한 위반 사항이 발견되지 않았습니다.
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500">검수 결과가 없습니다.</p>
          )}

          <DialogFooter className="!flex !flex-row !justify-center gap-3 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-w-[120px]"
              onClick={() => setInspectDialogOpen(false)}
            >
              닫기
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-w-[200px] bg-[#F43182] hover:bg-[#F43182]/90"
              disabled={loading || !inspection}
              onClick={() => void runInspectCorrection()}
            >
              {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
              검수 반영해 캔버스 교정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">부분 수정 미리보기</DialogTitle>
          </DialogHeader>
          {previewViolation && previewStaged && (
            <div className="space-y-2 text-xs text-gray-700">
              <p>{previewViolation.issue}</p>
              <div className="rounded border bg-gray-50 p-2">
                {previewStaged.title !== content.title && (
                  <p>
                    <span className="text-gray-500">타이틀:</span> {previewStaged.title}
                  </p>
                )}
                {previewStaged.bodyText !== content.bodyText && (
                  <p>
                    <span className="text-gray-500">본문:</span> {previewStaged.bodyText}
                  </p>
                )}
                {previewStaged.emphasizedTitle !== content.emphasizedTitle && (
                  <p>
                    <span className="text-gray-500">유의:</span> {previewStaged.emphasizedTitle}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              닫기
            </Button>
            <Button type="button" size="sm" className="bg-[#F43182]" onClick={applyPreview}>
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">이미지 교체</DialogTitle>
          </DialogHeader>
          {imageStagedUrl && <img src={imageStagedUrl} alt="" className="w-full rounded border" />}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setImageDialogOpen(false)}>
              닫기
            </Button>
            <Button type="button" size="sm" className="bg-[#F43182]" onClick={applyImageStaged}>
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
