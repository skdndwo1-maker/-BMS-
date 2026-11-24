import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuthSession } from "@/contexts/AuthSessionContext";
import {
  CANVAS_FONT_OPTIONS,
  FONT_FAMILY_PRETENDARD,
} from "@/design/canvasTextTypography";
import {
  RCS_MESSAGE_TYPES,
  RCS_PRODUCTS,
  buildRcsPresetsConfig,
  expandRcsCellsForEdit,
  resolveRcsTypo,
  type RcsMessageType,
  type RcsPresetsConfig,
  type RcsProduct,
  type RcsWeight,
} from "@/design/rcsPresets";
import {
  saveTemplateCatalog,
  upsertCatalogTemplate,
  useTemplateCatalog,
} from "@/design/templateCatalog";
import type { Template } from "@/design/types";

const WEIGHTS: { value: RcsWeight; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "semi-bold", label: "Semi-bold" },
  { value: "bold", label: "Bold" },
];

export function RcsPresetEditor() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isReady: adminReady } = useIsAdmin();
  const { session } = useAuthSession();
  const { templates, catalog, loaded } = useTemplateCatalog();

  const existing = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  const [product, setProduct] = useState<RcsProduct>("요금제");
  const [cells, setCells] = useState<Record<RcsProduct, Record<RcsMessageType, string>>>(() =>
    expandRcsCellsForEdit(null)
  );
  const [titleSize, setTitleSize] = useState(130);
  const [titleWeight, setTitleWeight] = useState<RcsWeight>("semi-bold");
  const [titleFont, setTitleFont] = useState(FONT_FAMILY_PRETENDARD);
  const [titleLineHeight, setTitleLineHeight] = useState(1.15);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!existing || hydrated) return;
    const cfg = (existing.rcsPresets ?? null) as RcsPresetsConfig | null;
    setCells(expandRcsCellsForEdit(cfg));
    const typo = resolveRcsTypo(cfg);
    setTitleSize(typo.titleSize);
    setTitleWeight(typo.titleWeight);
    setTitleFont(typo.titleFont);
    setTitleLineHeight(typo.titleLineHeight);
    setHydrated(true);
  }, [existing, hydrated]);

  const updateCell = useCallback((p: RcsProduct, m: RcsMessageType, title: string) => {
    setCells((prev) => ({
      ...prev,
      [p]: { ...prev[p], [m]: title },
    }));
  }, []);

  const save = async () => {
    if (!existing) return;
    const accessToken = session?.access_token ?? null;
    if (!accessToken) {
      toast.error("관리자 로그인이 필요합니다.");
      return;
    }
    setSaving(true);
    try {
      const rcsPresets = buildRcsPresetsConfig(cells, {
        titleSize,
        titleWeight,
        titleFont,
        titleLineHeight,
      });
      const nextTemplate: Template = {
        ...existing,
        rcsPresets: rcsPresets.defaults || rcsPresets.cells ? rcsPresets : undefined,
      };
      await saveTemplateCatalog(upsertCatalogTemplate(catalog, nextTemplate), accessToken);
      toast.success("RCS 문구·폰트 설정을 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!adminReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-600">관리자만 편집할 수 있습니다.</p>
        <Button type="button" onClick={() => navigate("/brand-graphics")}>
          갤러리로
        </Button>
      </div>
    );
  }

  if (loaded && !existing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-600">템플릿을 찾을 수 없습니다.</p>
        <Button type="button" onClick={() => navigate("/brand-graphics")}>
          갤러리로
        </Button>
      </div>
    );
  }

  if (existing && existing.category !== "rcs") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-600">이 화면은 RCS 템플릿 전용입니다.</p>
        <Button type="button" onClick={() => navigate(`/admin/templates/${templateId}/builder`)}>
          레이아웃 편집으로
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-black/5 bg-white px-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/brand-graphics")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 갤러리
        </Button>
        <div className="min-w-0 flex-1">
          <AxisBrandTitle className="text-sm" subtitle={`RCS 문구·폰트 · ${existing?.name ?? templateId}`} />
        </div>
        <Button
          type="button"
          size="sm"
          className="rounded-full bg-black text-white"
          disabled={saving || !hydrated}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          저장
        </Button>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <section className="h-fit space-y-4 rounded-2xl border border-black/5 bg-white p-4">
          <h2 className="text-sm font-semibold">카테고리 적용 시 기본 타이포</h2>
          <p className="text-[11px] text-gray-500">
            상품×메시지 선택 시 문구와 함께 적용됩니다. 줄바꿈은 오른쪽 문구란에서 Enter로 넣으세요.
          </p>
          <div>
            <Label className="text-xs">글꼴</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
              value={titleFont}
              onChange={(e) => setTitleFont(e.target.value)}
            >
              {CANVAS_FONT_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">크기 (%)</Label>
            <Input
              type="number"
              min={80}
              max={200}
              value={titleSize}
              onChange={(e) => setTitleSize(Number(e.target.value) || 100)}
            />
          </div>
          <div>
            <Label className="text-xs">굵기</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
              value={titleWeight}
              onChange={(e) => setTitleWeight(e.target.value as RcsWeight)}
            >
              {WEIGHTS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">행간 (line-height)</Label>
            <Input
              type="number"
              min={1}
              max={2.5}
              step={0.05}
              value={titleLineHeight}
              onChange={(e) => setTitleLineHeight(Number(e.target.value) || 1.15)}
            />
          </div>
          <div
            className="rounded-xl border border-dashed border-gray-200 p-3 text-[13px]"
            style={{
              fontFamily: titleFont,
              fontWeight:
                titleWeight === "light"
                  ? 300
                  : titleWeight === "standard"
                    ? 400
                    : titleWeight === "semi-bold"
                      ? 600
                      : 800,
              lineHeight: titleLineHeight,
              fontSize: `${14 * (titleSize / 100)}px`,
              whiteSpace: "pre-wrap",
            }}
          >
            {cells[product]?.["가입안내"] || "미리보기"}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-black/5 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {RCS_PRODUCTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProduct(p)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  product === p ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {RCS_MESSAGE_TYPES.map((m) => (
              <div key={m} className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">{m}</Label>
                <Textarea
                  rows={3}
                  className="whitespace-pre-wrap"
                  value={cells[product]?.[m] ?? ""}
                  onChange={(e) => updateCell(product, m, e.target.value)}
                  placeholder="Enter로 줄바꿈"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
