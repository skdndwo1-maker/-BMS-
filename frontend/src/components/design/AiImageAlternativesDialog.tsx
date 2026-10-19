import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Scissors, Sparkles } from "lucide-react";
import { developDesignImage } from "@/lib/designEditorApi";
import { removeImageBackground } from "@/lib/backgroundRemoval";
import { base64ToDataUri } from "@/lib/userGeneratedAssetsApi";

export type AiImageAlternative = {
  name: string;
  src: string;
  mimeType?: string;
  imageBase64?: string;
};

export type AiImageDevelopStep = {
  id: string;
  label: string;
  src: string;
  mimeType: string;
  imageBase64: string;
  developPrompt?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  alternatives: AiImageAlternative[];
  templateLabel?: string;
  creativeTopic?: string;
  onApply: (item: AiImageAlternative, developHistory: AiImageDevelopStep[]) => void;
};

function stripDataUriPrefix(src: string): string {
  return src.replace(/^data:image\/\w+;base64,/, "");
}

function resolveMime(item: AiImageAlternative): string {
  if (item.mimeType?.startsWith("image/")) return item.mimeType;
  const m = /^data:(image\/\w+);base64,/.exec(item.src);
  return m?.[1] ?? "image/png";
}

function resolveBase64(item: AiImageAlternative): string {
  if (item.imageBase64?.trim()) return item.imageBase64.trim();
  return stripDataUriPrefix(item.src);
}

export function AiImageAlternativesDialog({
  open,
  onOpenChange,
  title = "AI 이미지 대안",
  alternatives,
  templateLabel,
  creativeTopic,
  onApply,
}: Props) {
  const [selectedAltIdx, setSelectedAltIdx] = useState<number | null>(null);
  const [developSteps, setDevelopSteps] = useState<AiImageDevelopStep[]>([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [developPrompt, setDevelopPrompt] = useState("");
  const [developBusy, setDevelopBusy] = useState(false);
  const [developError, setDevelopError] = useState<string | null>(null);
  const [bgRemoveBusy, setBgRemoveBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedAltIdx(null);
      setDevelopSteps([]);
      setActiveStepIdx(0);
      setDevelopPrompt("");
      setDevelopBusy(false);
      setDevelopError(null);
      setBgRemoveBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !developBusy && !bgRemoveBusy) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, developBusy, bgRemoveBusy, onOpenChange]);

  if (!open || alternatives.length === 0) return null;

  const activeStep = developSteps[activeStepIdx] ?? null;

  const selectAlternative = (idx: number) => {
    const item = alternatives[idx];
    if (!item) return;
    const mimeType = resolveMime(item);
    const imageBase64 = resolveBase64(item);
    setSelectedAltIdx(idx);
    setDevelopSteps([
      {
        id: "0",
        label: `대안 ${idx + 1}`,
        src: item.src,
        mimeType,
        imageBase64,
      },
    ]);
    setActiveStepIdx(0);
    setDevelopPrompt("");
    setDevelopError(null);
  };

  const runRemoveBackground = async () => {
    if (bgRemoveBusy || developBusy || !activeStep) return;
    setBgRemoveBusy(true);
    setDevelopError(null);
    try {
      const inputDataUrl = activeStep.src.startsWith("data:")
        ? activeStep.src
        : base64ToDataUri(activeStep.mimeType, activeStep.imageBase64);
      const out = await removeImageBackground(inputDataUrl);
      const nextStep: AiImageDevelopStep = {
        id: String(developSteps.length),
        label: "배경제거",
        src: out.dataUrl,
        mimeType: out.mimeType,
        imageBase64: out.base64,
        developPrompt: "AI 배경제거",
      };
      setDevelopSteps((prev) => {
        const next = [...prev, nextStep];
        setActiveStepIdx(next.length - 1);
        return next;
      });
    } catch (e) {
      setDevelopError(e instanceof Error ? e.message : "배경 제거에 실패했습니다.");
    } finally {
      setBgRemoveBusy(false);
    }
  };

  const runDevelop = async () => {
    const prompt = developPrompt.trim();
    if (!prompt || developBusy || !activeStep) return;
    setDevelopBusy(true);
    setDevelopError(null);
    try {
      const out = await developDesignImage({
        imageBase64: activeStep.imageBase64,
        imageMime: activeStep.mimeType,
        developPrompt: prompt,
        templateLabel,
        creativeTopic,
      });
      const src = base64ToDataUri(out.mimeType, out.base64);
      const nextStep: AiImageDevelopStep = {
        id: String(developSteps.length),
        label: `디벨롭 ${developSteps.length}`,
        src,
        mimeType: out.mimeType,
        imageBase64: out.base64,
        developPrompt: prompt,
      };
      setDevelopSteps((prev) => {
        const next = [...prev, nextStep];
        setActiveStepIdx(next.length - 1);
        return next;
      });
      setDevelopPrompt("");
    } catch (e) {
      setDevelopError(e instanceof Error ? e.message : "디벨롭에 실패했습니다.");
    } finally {
      setDevelopBusy(false);
    }
  };

  const handleApply = () => {
    if (!activeStep) return;
    onApply(
      {
        name: activeStep.label,
        src: activeStep.src,
        mimeType: activeStep.mimeType,
        imageBase64: activeStep.imageBase64,
      },
      developSteps
    );
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!developBusy && !bgRemoveBusy) onOpenChange(false);
        }}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              대안을 선택한 뒤 추가 프롬프트로 디벨롭하거나 바로 적용할 수 있습니다
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={developBusy || bgRemoveBusy}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {alternatives.map((item, idx) => {
              const selected = selectedAltIdx === idx;
              return (
                <button
                  key={`${item.name}-${idx}`}
                  type="button"
                  onClick={() => selectAlternative(idx)}
                  className={`group flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                    selected
                      ? "border-[#FF7F66] bg-[#FF7F66]/8 ring-2 ring-[#FF7F66]/30"
                      : "border-gray-200 bg-white hover:border-[#FF7F66] hover:bg-[#FF7F66]/5"
                  }`}
                >
                  <span className="flex h-28 w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50">
                    <img src={item.src} alt={item.name} className="h-full w-full object-cover" />
                  </span>
                  <span
                    className={`w-full truncate text-[11px] font-semibold ${
                      selected ? "text-[#FF7F66]" : "text-gray-700 group-hover:text-[#FF7F66]"
                    }`}
                  >
                    대안 {idx + 1} · {item.name}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedAltIdx != null && developSteps.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <div className="flex items-start gap-3">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <img
                    src={activeStep?.src}
                    alt="현재 선택"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">추가 프롬프트로 디벨롭하기</p>
                  <Textarea
                    value={developPrompt}
                    onChange={(e) => setDevelopPrompt(e.target.value)}
                    placeholder='예: "배경을 더 어둡게", "인물 표정을 미소로"'
                    className="min-h-[56px] resize-none bg-white text-xs"
                    disabled={developBusy}
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 text-[12px]"
                      disabled={developBusy || bgRemoveBusy || !developPrompt.trim()}
                      onClick={() => void runDevelop()}
                    >
                      {developBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      디벨롭하기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-[12px]"
                      disabled={developBusy || bgRemoveBusy}
                      onClick={() => void runRemoveBackground()}
                      title="주요 개체만 남기고 배경을 투명하게 지웁니다"
                    >
                      {bgRemoveBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Scissors className="h-3.5 w-3.5" />
                      )}
                      AI배경제거
                    </Button>
                  </div>
                  {developError ? <p className="text-[10px] text-red-500">{developError}</p> : null}
                  {developBusy ? (
                    <p className="text-[10px] text-gray-500">디벨롭 중… 1~3분 걸릴 수 있습니다.</p>
                  ) : null}
                  {bgRemoveBusy ? (
                    <p className="text-[10px] text-gray-500">배경 제거 중… 1~2분 걸릴 수 있습니다.</p>
                  ) : null}
                </div>
              </div>

              {developSteps.length > 1 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-gray-600">디벨롭 히스토리</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {developSteps.map((step, i) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setActiveStepIdx(i)}
                        className={`shrink-0 rounded-lg border p-1 transition-colors ${
                          activeStepIdx === i
                            ? "border-[#FF7F66] ring-2 ring-[#FF7F66]/25"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        title={step.developPrompt ?? step.label}
                      >
                        <img
                          src={step.src}
                          alt={step.label}
                          className="h-14 w-14 rounded object-cover"
                        />
                        <span className="mt-0.5 block max-w-[56px] truncate text-[9px] text-gray-500">
                          {step.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-[11px] text-gray-400">위 대안 중 하나를 선택하세요</p>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 py-3">
          <Button
            type="button"
            className="h-9 w-full text-[13px]"
            disabled={!activeStep || developBusy || bgRemoveBusy}
            onClick={handleApply}
          >
            {activeStep ? "선택한 이미지 적용" : "대안을 먼저 선택하세요"}
          </Button>
        </div>
      </div>
    </div>
  );
}
