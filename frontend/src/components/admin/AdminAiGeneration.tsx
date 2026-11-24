import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  DEFAULT_AI_IMAGE_BASE_PROMPT,
  getAdminAiGenerationSettings,
  saveAdminAiGenerationSettings,
} from "@/lib/adminApi";

export function AdminAiGeneration() {
  const navigate = useNavigate();
  const { isAdmin, isReady } = useIsAdmin();
  const [prompt, setPrompt] = useState(DEFAULT_AI_IMAGE_BASE_PROMPT);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getAdminAiGenerationSettings();
      setPrompt(settings.imageBasePrompt || DEFAULT_AI_IMAGE_BASE_PROMPT);
      setUpdatedAt(settings.updatedAt);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setPrompt(DEFAULT_AI_IMAGE_BASE_PROMPT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    void load();
  }, [isReady, isAdmin, load]);

  const save = async () => {
    const next = prompt.trim();
    if (!next) {
      toast.error("기본 프롬프트를 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAdminAiGenerationSettings(next);
      setPrompt(saved.imageBasePrompt);
      setUpdatedAt(saved.updatedAt);
      toast.success("AI 이미지 기본 프롬프트를 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center brand-app-shell">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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
              제작물 생성에서 AI 이미지를 만들 때, 여기에 적은 기본 지침이 먼저 적용되고 사용자가 입력한 프롬프트가
              이어서 붙습니다.
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

        <section className="rounded-2xl border border-black/5 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-semibold">이미지 생성 기본 프롬프트</Label>
            {updatedAt ? (
              <span className="text-[11px] text-gray-400">
                저장: {new Date(updatedAt).toLocaleString("ko-KR")}
              </span>
            ) : (
              <span className="text-[11px] text-amber-700">아직 저장 전 — 기본값 표시 중</span>
            )}
          </div>
          <p className="text-[12px] text-gray-500">
            사용자가 「생성방향」에 적은 내용과 합쳐집니다. (기본 지침 → 사용자 요청)
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
            </div>
          ) : (
            <Textarea
              rows={8}
              className="whitespace-pre-wrap font-mono text-[13px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={DEFAULT_AI_IMAGE_BASE_PROMPT}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={loading || saving}
            onClick={() => setPrompt(DEFAULT_AI_IMAGE_BASE_PROMPT)}
          >
            추천 기본값으로 되돌리기
          </Button>
        </section>
      </div>
    </div>
  );
}
