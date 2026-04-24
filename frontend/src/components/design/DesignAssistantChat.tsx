import { useCallback, useState, type ReactNode } from "react";
import html2canvas from "html2canvas";
import { buildDesignCanvasCaptureOptions } from "@/lib/html2canvasDesignCapture";
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

const html2canvasOpts = {
  scale: 2,
  logging: false,
  useCORS: true,
} as const;

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

const AI_TEXT_SECTIONS: { heading: string; items: [DesignEditorTextSuggestionTarget, string][] }[] = [
  { heading: "메인 타이틀", items: [["mainTitle", "제안 받기"]] },
  { heading: "본문", items: [["body", "제안 받기"]] },
];

type AssistantTab = "text" | "inspect" | "correct";

export function DesignAssistantChat({
  content,
  onApplyContent,
  templateId,
  guidelineId = "uplus-brand-guideline",
}: {
  content: DesignContent;
  onApplyContent: (next: DesignContent) => void;
  templateId: string;
  guidelineId?: string;
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
  const [lastCapture, setLastCapture] = useState<{ base64: string; mime: string } | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewViolation, setPreviewViolation] = useState<DesignEditorViolation | null>(null);
  const [previewStaged, setPreviewStaged] = useState<DesignContent | null>(null);

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageStagedUrl, setImageStagedUrl] = useState<string | null>(null);
  const [imageTargetViolation, setImageTargetViolation] = useState<DesignEditorViolation | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const [correctPreviewUrl, setCorrectPreviewUrl] = useState<string | null>(null);
  const [correctCaption, setCorrectCaption] = useState("");
  /** 텍스트 제안 탭 하위(카테고리·미리보기) 접기 */
  const [textSuggestSectionOpen, setTextSuggestSectionOpen] = useState(false);

  const captureCanvas = useCallback(async () => {
    const el = document.getElementById("design-canvas");
    if (!el) throw new Error("canvas_missing");
    const canvas = await html2canvas(
      el,
      buildDesignCanvasCaptureOptions({
        ...html2canvasOpts,
        backgroundColor: "#ffffff",
      }) as Parameters<typeof html2canvas>[1]
    );
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
      toast.success("디자인 검수가 완료되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "검수에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

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
      setCorrectPreviewUrl(url);
      setCorrectCaption(out.caption);
      toast.success("교정 이미지가 생성되었습니다. 미리보기에서 적용하세요.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "교정 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

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
      setCorrectPreviewUrl(url);
      setCorrectCaption(out.caption);
      toast.success("전체 교정 이미지가 생성되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "교정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const applyCorrectedImage = () => {
    if (!correctPreviewUrl) return;
    onApplyContent({
      ...content,
      image: correctPreviewUrl,
      posterBackgroundImageRect: { x: 0, y: 0, width: 1, height: 1 },
      posterImageOpacity: 100,
      posterImagePosX: 50,
      posterImagePosY: 50,
    });
    setCorrectPreviewUrl(null);
    setCorrectCaption("");
    toast.success("교정 이미지를 배경으로 적용했습니다. 필요 시 텍스트 레이어를 조정하세요.");
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
                {AI_TEXT_SECTIONS.map((sec) => (
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
          <p className="text-[11px] text-gray-600">캔버스 캡처를 VI 가이드와 비교해 위반·교정 포인트를 나열합니다.</p>
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
          {inspection && (
            <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/50 p-2 text-[11px]">
              <p className="font-medium text-violet-900">점수 {inspection.score}점</p>
              <p className="whitespace-pre-wrap text-gray-800">{inspection.overallSummary}</p>
              {inspection.violations.length > 0 && (
                <ul className="space-y-1.5 border-t border-violet-100 pt-2">
                  {inspection.violations.map((v, i) => (
                    <li key={i} className="rounded bg-white/90 p-2 text-gray-800">
                      <span className="font-medium">{v.category}</span> · {v.issue}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                size="sm"
                className="mt-1 w-full bg-[#F43182] hover:bg-[#F43182]/90"
                disabled={loading || !inspection}
                onClick={() => void runInspectCorrection()}
              >
                <Wand2 className="mr-2 h-3.5 w-3.5" />
                교정 (검수 반영 이미지)
              </Button>
            </div>
          )}

          {inspection && inspection.violations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-gray-700">항목별 조치</p>
              {inspection.violations.map((v, idx) => (
                <div key={idx} className="rounded border bg-white p-2 text-[10px]">
                  <p className="mb-1 text-gray-800">{v.issue}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px]"
                    disabled={loading || imageBusy}
                    onClick={() => handleFixClick(v)}
                  >
                    {v.fixKind === "image" ? "이미지 수정" : "부분 수정"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "correct" && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-600">
            뱃지·타이틀·본문·유의·이미지·픽토그램·일러스트 등을 VI에 맞게 한 번에 시각 교정합니다.
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

      {correctPreviewUrl && (
        <div className="rounded-lg border border-[#F43182]/20 bg-white p-2">
          <p className="mb-1 text-[10px] font-medium text-gray-800">교정 이미지 미리보기</p>
          <img src={correctPreviewUrl} alt="교정 미리보기" className="max-h-48 w-full rounded object-contain" />
          {correctCaption && <p className="mt-1 text-[10px] text-gray-600">{correctCaption}</p>}
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setCorrectPreviewUrl(null)}>
              닫기
            </Button>
            <Button type="button" size="sm" className="bg-[#F43182]" onClick={applyCorrectedImage}>
              캔버스에 적용
            </Button>
          </div>
        </div>
      )}

      {loading && tab !== "inspect" && (
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          처리 중…
        </div>
      )}

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
