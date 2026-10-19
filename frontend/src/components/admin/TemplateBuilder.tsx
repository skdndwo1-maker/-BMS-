import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Box,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Lock,
  Plus,
  Save,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DraggableCanvasOverlay } from "@/components/design/DraggableCanvasOverlay";
import { defaultBI, defaultCI, defaultSLOGAN } from "@/design/defaultLogos";
import {
  computeCanvasLogoHeightPx,
  computeCanvasLogoPositionStyle,
} from "@/design/canvasLogoLayout";
import {
  saveTemplateCatalog,
  upsertCatalogTemplate,
  useTemplateCatalog,
  newCustomTemplateId,
} from "@/design/templateCatalog";
import {
  TEMPLATE_ELEMENT_LABELS,
  TEMPLATE_TEXT_BASE_RATIO,
  canAddLayoutElement,
  clampElementRect,
  createDefaultTemplateLayout,
  createLayoutElement,
} from "@/design/templateLayout";
import type {
  LogoPosition,
  Template,
  TemplateLayout,
  TemplateLayoutElement,
  TemplateLayoutElementKind,
} from "@/design/types";
import { useAuthSession } from "@/contexts/AuthSessionContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { readFileAsDataUrl } from "@/lib/designContentPersistence";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

const ADDABLE: TemplateLayoutElementKind[] = [
  "title",
  "subtitle",
  "body",
  "footer",
  "colorBox",
  "image",
  "asset",
];

const LOGO_POSITIONS: { key: LogoPosition; label: string }[] = [
  { key: "top-left", label: "좌상단" },
  { key: "top-center", label: "상단중앙" },
  { key: "top-right", label: "우상단" },
  { key: "bottom-left", label: "좌하단" },
  { key: "bottom-center", label: "하단중앙" },
  { key: "bottom-right", label: "우하단" },
];

function logoSrc(option: TemplateLayout["logo"]["option"]): string | null {
  if (option === "CI") return defaultCI;
  if (option === "BI") return defaultBI;
  if (option === "SLOGAN") return defaultSLOGAN;
  return null;
}

function cloneLayout(layout: TemplateLayout): TemplateLayout {
  return {
    ...layout,
    grid: { ...layout.grid },
    logo: { ...layout.logo },
    elements: layout.elements.map((e) => ({ ...e })),
  };
}

export function TemplateBuilder() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isReady } = useIsAdmin();
  const { session } = useAuthSession();
  const { catalog, templates, loaded } = useTemplateCatalog();

  const isNew = templateId === "new";
  const existing = useMemo(
    () => (isNew ? undefined : templates.find((t) => t.id === templateId)),
    [isNew, templates, templateId],
  );

  const [meta, setMeta] = useState<Pick<Template, "name" | "description" | "category" | "mediaType" | "size">>(() => ({
    name: "새 템플릿",
    description: "",
    category: "marketing-banner",
    mediaType: "online",
    size: { width: 1080, height: 1080, unit: "px", name: "1:1" },
  }));
  const [layout, setLayout] = useState<TemplateLayout>(() => createDefaultTemplateLayout());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const historyRef = useRef<TemplateLayout[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 640, h: 640 });
  const assetInputRef = useRef<HTMLInputElement>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!loaded || bootedRef.current) return;
    if (isNew) {
      bootedRef.current = true;
      return;
    }
    if (!existing) return;
    bootedRef.current = true;
    setMeta({
      name: existing.name,
      description: existing.description,
      category: existing.category,
      mediaType: existing.mediaType,
      size: existing.size,
    });
    setLayout(existing.layout ? cloneLayout(existing.layout) : createDefaultTemplateLayout());
  }, [loaded, isNew, existing]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 48;
      const aw = Math.max(200, el.clientWidth - pad);
      const ah = Math.max(200, el.clientHeight - pad);
      const ar = meta.size.width / Math.max(1, meta.size.height);
      let w = aw;
      let h = w / ar;
      if (h > ah) {
        h = ah;
        w = h * ar;
      }
      setStageSize({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [meta.size.width, meta.size.height]);

  const updateLayout = useCallback((updater: (prev: TemplateLayout) => TemplateLayout) => {
    setLayout((prev) => {
      historyRef.current = [...historyRef.current.slice(-29), cloneLayout(prev)];
      setDirty(true);
      return updater(prev);
    });
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setLayout(prev);
    setDirty(true);
  }, []);

  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;

  const patchElement = (id: string, patch: Partial<TemplateLayoutElement>) => {
    updateLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.id === id ? clampElementRect({ ...e, ...patch }) : e)),
    }));
  };

  const addElement = (kind: TemplateLayoutElementKind) => {
    if (!canAddLayoutElement(layout, kind)) {
      toast.error(`${TEMPLATE_ELEMENT_LABELS[kind]}은(는) 더 이상 추가할 수 없습니다.`);
      return;
    }
    const el = createLayoutElement(kind);
    updateLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  };

  const removeElement = (id: string) => {
    updateLayout((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const reorderElement = (id: string, dir: -1 | 1) => {
    updateLayout((prev) => {
      const idx = prev.elements.findIndex((e) => e.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.elements.length) return prev;
      const elements = [...prev.elements];
      [elements[idx], elements[j]] = [elements[j], elements[idx]];
      return { ...prev, elements };
    });
  };

  const onAssetFile = async (file: File | undefined) => {
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    const el = createLayoutElement("asset", { x: 0.6, y: 0.55, width: 0.25, height: 0.25 });
    el.src = src;
    el.name = file.name;
    updateLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  };

  const shortSide = Math.min(stageSize.w, stageSize.h);
  const snapPx = layout.grid.snap
    ? Math.max(1, Math.round(shortSide / Math.max(layout.grid.columns, layout.grid.rows)))
    : 1;

  const save = async () => {
    if (!session?.access_token) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    setSaving(true);
    try {
      const id = isNew || !existing ? newCustomTemplateId() : existing.id;
      const template: Template = {
        id,
        name: meta.name.trim() || "이름 없는 템플릿",
        description: meta.description,
        category: meta.category,
        mediaType: meta.mediaType,
        size: meta.size,
        thumbnail: existing?.thumbnail ?? "",
        customizable: true,
        isCustom: existing ? existing.isCustom ?? !templates.some((t) => t.id === id && !t.isCustom) : true,
        layout: cloneLayout(layout),
      };
      // builtin override: keep isCustom false when editing builtin id
      if (existing && !existing.isCustom) template.isCustom = false;

      await saveTemplateCatalog(
        { ...upsertCatalogTemplate(catalog, template), updatedAt: new Date().toISOString() },
        session.access_token,
      );
      setDirty(false);
      toast.success("템플릿이 저장되었습니다.");
      if (isNew || templateId !== id) {
        navigate(`/admin/templates/${id}/builder`, { replace: true });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedId) {
        e.preventDefault();
        const src = layout.elements.find((x) => x.id === selectedId);
        if (!src) return;
        const dup = { ...src, id: createLayoutElement(src.kind).id, x: Math.min(0.9, src.x + 0.03), y: Math.min(0.9, src.y + 0.03) };
        updateLayout((prev) => ({ ...prev, elements: [...prev.elements, dup] }));
        setSelectedId(dup.id);
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeElement(selectedId);
        return;
      }
      if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = (e.shiftKey ? snapPx * 4 : snapPx) / Math.max(stageSize.w, 1);
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const el = layout.elements.find((x) => x.id === selectedId);
        if (!el || el.locked) return;
        patchElement(selectedId, { x: el.x + dx, y: el.y + dy });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!isReady || !loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <AxisBrandTitle subtitle="템플릿 빌더" />
        <p className="text-sm text-gray-600">관리자만 접근할 수 있습니다.</p>
        <Button type="button" onClick={() => navigate("/brand-graphics")}>
          갤러리로
        </Button>
      </div>
    );
  }

  if (!isNew && loaded && !existing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-600">템플릿을 찾을 수 없습니다.</p>
        <Button type="button" onClick={() => navigate("/brand-graphics")}>
          갤러리로
        </Button>
      </div>
    );
  }

  if (existing?.category === "rcs") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-gray-600">RCS 템플릿은 레이아웃 편집을 지원하지 않습니다.</p>
        <Button type="button" onClick={() => navigate("/brand-graphics")}>
          갤러리로
        </Button>
      </div>
    );
  }

  const logoUrl = logoSrc(layout.logo.option);
  const logoH = computeCanvasLogoHeightPx(stageSize.w, stageSize.h);
  const logoStyle = computeCanvasLogoPositionStyle(layout.logo.position, stageSize.w, stageSize.h);

  return (
    <div className="flex h-screen flex-col bg-[#F5F3F0] overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white px-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/brand-graphics")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 갤러리
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="min-w-0 flex-1">
          <Input
            value={meta.name}
            onChange={(e) => {
              setMeta((m) => ({ ...m, name: e.target.value }));
              setDirty(true);
            }}
            className="h-8 max-w-xs border-none bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-0"
          />
          <p className="px-1 text-[11px] text-gray-400">
            {meta.size.width}×{meta.size.height}
            {meta.size.unit}
            {dirty ? " · 저장되지 않음" : ""}
          </p>
        </div>
        {existing?.id || (!isNew && templateId && templateId !== "new") ? (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={`/create/${existing?.id ?? templateId}`} target="_blank" rel="noreferrer">
              사용해보기
            </Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled title="먼저 저장해 주세요">
            사용해보기
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          저장
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: add + layers */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-black/5 bg-white">
          <div className="space-y-2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">요소 추가</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ADDABLE.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!canAddLayoutElement(layout, kind) && kind !== "asset" && kind !== "colorBox"}
                  onClick={() => {
                    if (kind === "asset") {
                      assetInputRef.current?.click();
                      return;
                    }
                    addElement(kind);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-left text-[11px] font-medium hover:border-[#FF7F66] hover:bg-[#FF7F66]/5 disabled:opacity-40"
                >
                  {kind === "colorBox" ? <Box className="h-3.5 w-3.5" /> : kind === "image" || kind === "asset" ? <ImageIcon className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                  {TEMPLATE_ELEMENT_LABELS[kind]}
                </button>
              ))}
            </div>
            <input
              ref={assetInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onAssetFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">레이어</p>
            <ul className="space-y-1">
              {[...layout.elements].reverse().map((el) => (
                <li key={el.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(el.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                      selectedId === el.id ? "bg-[#FF7F66]/15 text-[#c23d5a]" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{el.name || TEMPLATE_ELEMENT_LABELS[el.kind]}</span>
                    {el.locked ? <Lock className="h-3 w-3 shrink-0" /> : null}
                    <button
                      type="button"
                      className="shrink-0 text-gray-400 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeElement(el.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>
                  {selectedId === el.id ? (
                    <div className="mt-0.5 flex gap-1 pl-2">
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => reorderElement(el.id, 1)}>
                        앞으로
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => reorderElement(el.id, -1)}>
                        뒤로
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1 text-[10px]"
                        onClick={() => patchElement(el.id, { locked: !el.locked })}
                      >
                        {el.locked ? "잠금해제" : "잠금"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Center canvas */}
        <main
          ref={stageRef}
          className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <div
            className="relative shadow-xl"
            style={{
              width: stageSize.w,
              height: stageSize.h,
              background: layout.backgroundColor,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            {layout.grid.visible ? (
              <div
                data-canvas-export-exclude="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(244,49,130,0.12) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(244,49,130,0.12) 1px, transparent 1px)
                  `,
                  backgroundSize: `${100 / layout.grid.columns}% ${100 / layout.grid.rows}%`,
                  backgroundPosition: `${layout.grid.marginPct}% ${layout.grid.marginPct}%`,
                }}
              />
            ) : null}

            {layout.elements.map((el, i) => {
              const fontPx =
                (TEMPLATE_TEXT_BASE_RATIO[el.kind] ?? 0.04) *
                shortSide *
                ((el.fontScale ?? 100) / 100);
              return (
                <DraggableCanvasOverlay
                  key={el.id}
                  rect={el}
                  canvasW={stageSize.w}
                  canvasH={stageSize.h}
                  onRectChange={(next) => patchElement(el.id, next)}
                  isSelected={selectedId === el.id}
                  onSelect={() => setSelectedId(el.id)}
                  zIndex={10 + i}
                  label={TEMPLATE_ELEMENT_LABELS[el.kind]}
                  locked={el.locked}
                  borderRadiusMode="square"
                  snapStepPx={snapPx}
                  onToggleLock={() => patchElement(el.id, { locked: !el.locked })}
                  onRequestDelete={() => removeElement(el.id)}
                >
                  {el.kind === "colorBox" ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: el.color ?? "#FFF0F5",
                        opacity: el.opacity ?? 1,
                        borderRadius: `${(Math.min(el.width * stageSize.w, el.height * stageSize.h) * (el.radiusPct ?? 0)) / 100}px`,
                      }}
                    />
                  ) : el.kind === "image" ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "2px dashed rgba(244,49,130,0.5)",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        color: "rgba(244,49,130,0.8)",
                        background: "rgba(244,49,130,0.04)",
                      }}
                    >
                      이미지 영역
                    </div>
                  ) : el.kind === "asset" && el.src ? (
                    <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: el.opacity ?? 1 }} draggable={false} />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        color: el.color ?? "#1A1A1A",
                        fontSize: fontPx,
                        textAlign: el.align ?? "left",
                        lineHeight: 1.25,
                        whiteSpace: "pre-wrap",
                        overflow: "hidden",
                        fontWeight: el.kind === "title" ? 700 : 500,
                      }}
                    >
                      {el.text || TEMPLATE_ELEMENT_LABELS[el.kind]}
                    </div>
                  )}
                </DraggableCanvasOverlay>
              );
            })}

            {logoUrl ? (
              <img
                src={logoUrl}
                alt="logo"
                draggable={false}
                style={{
                  position: "absolute",
                  height: logoH,
                  width: "auto",
                  maxWidth: "28%",
                  objectFit: "contain",
                  zIndex: 50,
                  pointerEvents: "none",
                  opacity: layout.logo.locked ? 1 : 0.95,
                  outline: layout.logo.locked ? "1px dashed rgba(244,49,130,0.5)" : undefined,
                  ...logoStyle,
                }}
              />
            ) : null}
          </div>
        </main>

        {/* Right: properties */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-black/5 bg-white p-4 space-y-4">
          {selected ? (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">선택 요소</p>
                <p className="mt-1 text-sm font-semibold">{TEMPLATE_ELEMENT_LABELS[selected.kind]}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => patchElement(selected.id, { locked: !selected.locked })}
                >
                  {selected.locked ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
                  {selected.locked ? "잠금 해제" : "사용자 잠금"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => removeElement(selected.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {["title", "subtitle", "body", "footer"].includes(selected.kind) ? (
                <>
                  <div className="space-y-1.5">
                    <Label>텍스트</Label>
                    <textarea
                      className="min-h-[72px] w-full rounded-md border border-input px-3 py-2 text-sm"
                      value={selected.text ?? ""}
                      onChange={(e) => patchElement(selected.id, { text: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>색상</Label>
                    <Input
                      type="color"
                      value={selected.color ?? "#1A1A1A"}
                      onChange={(e) => patchElement(selected.id, { color: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>크기 배율 (%)</Label>
                    <Input
                      type="number"
                      min={40}
                      max={200}
                      value={selected.fontScale ?? 100}
                      onChange={(e) => patchElement(selected.id, { fontScale: Number(e.target.value) || 100 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>정렬</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input px-3 text-sm"
                      value={selected.align ?? "left"}
                      onChange={(e) =>
                        patchElement(selected.id, {
                          align: e.target.value as TemplateLayoutElement["align"],
                        })
                      }
                    >
                      <option value="left">왼쪽</option>
                      <option value="center">가운데</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </div>
                </>
              ) : null}
              {selected.kind === "colorBox" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>채움 색</Label>
                    <Input
                      type="color"
                      value={selected.color ?? "#FFF0F5"}
                      onChange={(e) => patchElement(selected.id, { color: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>라운드 (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={selected.radiusPct ?? 0}
                      onChange={(e) => patchElement(selected.id, { radiusPct: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>투명도 (0–1)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selected.opacity ?? 1}
                      onChange={(e) => patchElement(selected.id, { opacity: Number(e.target.value) })}
                    />
                  </div>
                </>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                <span>x {(selected.x * 100).toFixed(1)}%</span>
                <span>y {(selected.y * 100).toFixed(1)}%</span>
                <span>w {(selected.width * 100).toFixed(1)}%</span>
                <span>h {(selected.height * 100).toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">템플릿 설정</p>
              <div className="space-y-1.5">
                <Label>배경색</Label>
                <Input
                  type="color"
                  value={layout.backgroundColor}
                  onChange={(e) => updateLayout((p) => ({ ...p, backgroundColor: e.target.value }))}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label>그리드</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateLayout((p) => ({ ...p, grid: { ...p.grid, visible: !p.grid.visible } }))
                  }
                >
                  {layout.grid.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">열</Label>
                  <Input
                    type="number"
                    min={2}
                    max={24}
                    value={layout.grid.columns}
                    onChange={(e) =>
                      updateLayout((p) => ({
                        ...p,
                        grid: { ...p.grid, columns: Math.max(2, Number(e.target.value) || 12) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">행</Label>
                  <Input
                    type="number"
                    min={2}
                    max={24}
                    value={layout.grid.rows}
                    onChange={(e) =>
                      updateLayout((p) => ({
                        ...p,
                        grid: { ...p.grid, rows: Math.max(2, Number(e.target.value) || 12) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">여백 %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={layout.grid.marginPct}
                    onChange={(e) =>
                      updateLayout((p) => ({
                        ...p,
                        grid: { ...p.grid, marginPct: Number(e.target.value) || 0 },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">간격 %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={layout.grid.gutterPct}
                    onChange={(e) =>
                      updateLayout((p) => ({
                        ...p,
                        grid: { ...p.grid, gutterPct: Number(e.target.value) || 0 },
                      }))
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={layout.grid.snap}
                  onChange={(e) =>
                    updateLayout((p) => ({ ...p, grid: { ...p.grid, snap: e.target.checked } }))
                  }
                />
                그리드 스냅
              </label>
              <Separator />
              <p className="text-xs font-semibold text-gray-500">로고 기본값</p>
              <div className="space-y-1.5">
                <Label>종류</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input px-3 text-sm"
                  value={layout.logo.option ?? "none"}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateLayout((p) => ({
                      ...p,
                      logo: {
                        ...p.logo,
                        option: v === "none" ? null : (v as "CI" | "BI" | "SLOGAN"),
                      },
                    }));
                  }}
                >
                  <option value="CI">CI</option>
                  <option value="BI">BI</option>
                  <option value="SLOGAN">SLOGAN</option>
                  <option value="none">없음</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>위치</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {LOGO_POSITIONS.map((pos) => (
                    <button
                      key={pos.key}
                      type="button"
                      onClick={() =>
                        updateLayout((p) => ({ ...p, logo: { ...p.logo, position: pos.key } }))
                      }
                      className={`rounded-md border px-2 py-1.5 text-xs ${
                        layout.logo.position === pos.key
                          ? "border-[#FF7F66] bg-[#FF7F66]/10 text-[#c23d5a]"
                          : "border-gray-200"
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={layout.logo.locked}
                  onChange={(e) =>
                    updateLayout((p) => ({ ...p, logo: { ...p.logo, locked: e.target.checked } }))
                  }
                />
                사용자 로고 위치 고정
              </label>
              <Separator />
              <div className="space-y-1.5">
                <Label>캔버스 너비</Label>
                <Input
                  type="number"
                  value={meta.size.width}
                  onChange={(e) => {
                    setMeta((m) => ({ ...m, size: { ...m.size, width: Number(e.target.value) || 1 } }));
                    setDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>캔버스 높이</Label>
                <Input
                  type="number"
                  value={meta.size.height}
                  onChange={(e) => {
                    setMeta((m) => ({ ...m, size: { ...m.size, height: Number(e.target.value) || 1 } }));
                    setDirty(true);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  if (window.confirm("레이아웃을 기본값으로 되돌릴까요?")) {
                    updateLayout(() => createDefaultTemplateLayout());
                    setSelectedId(null);
                  }
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> 레이아웃 초기화
              </Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
