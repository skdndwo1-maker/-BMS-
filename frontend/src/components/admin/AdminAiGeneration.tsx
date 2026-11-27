import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  DEFAULT_AI_IMAGE_BASE_PROMPT,
  DEFAULT_AI_NAMING_BASE_PROMPT,
  getAdminAiGenerationSettings,
  getAdminGuidelineDetail,
  NAMING_COMPANY_BRAND_GUIDELINE_ID,
  NAMING_COMPANY_BRAND_GUIDELINE_LABEL,
  saveAdminAiGenerationSettings,
  type AdminGuidelineDetail,
} from "@/lib/adminApi";
import { analyzeGuideline } from "@/lib/guidelineApi";

export function AdminAiGeneration() {
  const navigate = useNavigate();
  const { isAdmin, isReady } = useIsAdmin();
  const [imagePrompt, setImagePrompt] = useState(DEFAULT_AI_IMAGE_BASE_PROMPT);
  const [namingPrompt, setNamingPrompt] = useState(DEFAULT_AI_NAMING_BASE_PROMPT);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyGuide, setCompanyGuide] = useState<AdminGuidelineDetail | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyAnalyzing, setCompanyAnalyzing] = useState(false);

  const loadCompanyGuide = useCallback(async () => {
    setCompanyLoading(true);
    try {
      const detail = await getAdminGuidelineDetail(NAMING_COMPANY_BRAND_GUIDELINE_ID);
      setCompanyGuide(detail);
    } catch (e) {
      console.warn("[AdminAiGeneration] company guide load failed:", e);
      setCompanyGuide(null);
    } finally {
      setCompanyLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getAdminAiGenerationSettings();
      setImagePrompt(settings.imageBasePrompt || DEFAULT_AI_IMAGE_BASE_PROMPT);
      setNamingPrompt(settings.namingBasePrompt || DEFAULT_AI_NAMING_BASE_PROMPT);
      setUpdatedAt(settings.updatedAt);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setImagePrompt(DEFAULT_AI_IMAGE_BASE_PROMPT);
      setNamingPrompt(DEFAULT_AI_NAMING_BASE_PROMPT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    void load();
    void loadCompanyGuide();
  }, [isReady, isAdmin, load, loadCompanyGuide]);

  const save = async () => {
    const nextImage = imagePrompt.trim();
    const nextNaming = namingPrompt.trim();
    if (!nextImage) {
      toast.error("이미지 기본 프롬프트를 입력해 주세요.");
      return;
    }
    if (!nextNaming) {
      toast.error("네이밍 기본 프롬프트를 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAdminAiGenerationSettings({
        imageBasePrompt: nextImage,
        namingBasePrompt: nextNaming,
      });
      setImagePrompt(saved.imageBasePrompt);
      setNamingPrompt(saved.namingBasePrompt);
      setUpdatedAt(saved.updatedAt);
      toast.success("AI 기본 프롬프트를 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const regenerateCompanySummary = async () => {
    setCompanyAnalyzing(true);
    try {
      const result = await analyzeGuideline(NAMING_COMPANY_BRAND_GUIDELINE_ID);
      if (!result.aiSummary?.trim()) {
        toast.error("AI 요약이 비어 있습니다. PDF·API 키를 확인해 주세요.");
      } else {
        toast.success("전사 브랜드 가이드 AI 요약을 생성했습니다.");
      }
      await loadCompanyGuide();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCompanyAnalyzing(false);
    }
  };

  const companySummary =
    companyGuide?.summaries[0]?.summary?.trim() || companyGuide?.localSummary?.trim() || "";
  const companySummaryMeta = companyGuide?.summaries[0];

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center brand-app-shell">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen brand-app-shell px-6 py-8">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <AxisBrandTitle subtitle="AI 생성 설정" />
          <p className="text-sm text-gray-600">관리자만 접근할 수 있습니다.</p>
          <Button type="button" className="rounded-full bg-black text-white" onClick={() => navigate("/options")}>
            옵션으로
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen brand-app-shell px-6 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AxisBrandTitle subtitle="AI 생성 설정" />
            <p className="mt-2 text-sm text-gray-500">
              이미지·네이밍 모두 관리자 기본 지침이 먼저 적용되고, 사용자가 입력한 내용이 이어서 합쳐집니다.
            </p>
            <div className="mt-3">
              <AdminSectionTabs />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-[rgba(0,0,0,0.1)]"
              onClick={() => navigate("/options")}
            >
              옵션으로
            </Button>
            <Button
              type="button"
              className="rounded-full bg-black text-white"
              disabled={saving || loading}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              저장
            </Button>
          </div>
        </div>

        {updatedAt ? (
          <p className="text-[11px] text-gray-400">저장: {new Date(updatedAt).toLocaleString("ko-KR")}</p>
        ) : (
          <p className="text-[11px] text-amber-700">아직 저장 전 — 기본값 표시 중</p>
        )}

        <section className="rounded-2xl border border-black/5 bg-white p-5 space-y-3">
          <Label className="text-sm font-semibold">이미지 생성 기본 프롬프트</Label>
          <p className="text-[12px] text-gray-500">
            제작물 AI 이미지 「생성방향」과 합쳐집니다. (기본 지침 → 사용자 요청)
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
            </div>
          ) : (
            <Textarea
              rows={8}
              className="whitespace-pre-wrap font-mono text-[13px]"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder={DEFAULT_AI_IMAGE_BASE_PROMPT}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={loading || saving}
            onClick={() => setImagePrompt(DEFAULT_AI_IMAGE_BASE_PROMPT)}
          >
            이미지 추천 기본값으로 되돌리기
          </Button>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-5 space-y-3">
          <Label className="text-sm font-semibold">네이밍 기본 프롬프트</Label>
          <p className="text-[12px] text-gray-500">
            브랜드 네이밍 생성·검수 시, 사용자가 채운 카테고리·개요·참고 입력과 합쳐집니다. (기본 지침 → 사용자
            요청) 서버는 이 지침과 함께{" "}
            <strong className="font-medium text-gray-700">{NAMING_COMPANY_BRAND_GUIDELINE_LABEL}</strong>
            ·Simply. U+ Guidebook을 항상 참고합니다.
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
            </div>
          ) : (
            <Textarea
              rows={10}
              className="whitespace-pre-wrap font-mono text-[13px]"
              value={namingPrompt}
              onChange={(e) => setNamingPrompt(e.target.value)}
              placeholder={DEFAULT_AI_NAMING_BASE_PROMPT}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={loading || saving}
            onClick={() => setNamingPrompt(DEFAULT_AI_NAMING_BASE_PROMPT)}
          >
            네이밍 추천 기본값으로 되돌리기
          </Button>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold">{NAMING_COMPANY_BRAND_GUIDELINE_LABEL}</Label>
              <p className="mt-1 text-[12px] text-gray-500">
                네이밍 생성·검수 프롬프트에 AI 요약 → PDF 원문 발췌 → RAG 순으로 항상 포함됩니다. 요약이 비어 있으면
                아래에서 생성하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={companyLoading || companyAnalyzing}
                onClick={() => void loadCompanyGuide()}
              >
                {companyLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                새로고침
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-black text-white"
                disabled={companyAnalyzing || companyLoading}
                onClick={() => void regenerateCompanySummary()}
              >
                {companyAnalyzing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                AI 요약 생성
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full" asChild>
                <Link to="/admin/guidelines">가이드 관리에서 편집</Link>
              </Button>
            </div>
          </div>

          {companyLoading && !companyGuide ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> 가이드 상태 불러오는 중…
            </div>
          ) : companySummary ? (
            <>
              <p className="text-[11px] text-gray-500">
                {companySummary.length.toLocaleString()}자
                {companySummaryMeta
                  ? ` · ${companySummaryMeta.editedAt ? "수정" : "생성"} ${new Date(
                      companySummaryMeta.editedAt ?? companySummaryMeta.createdAt
                    ).toLocaleString("ko-KR")}`
                  : companyGuide?.localSummary
                    ? " · 로컬 캐시"
                    : ""}
                {companySummaryMeta?.model ? ` · ${companySummaryMeta.model}` : ""}
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-gray-100 bg-gray-50 p-3 text-[12px] text-gray-700">
                {companySummary}
              </pre>
            </>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              아직 AI 요약이 없습니다. 「AI 요약 생성」을 실행하면 네이밍 생성·검수에 반영됩니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
