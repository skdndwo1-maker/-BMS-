import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTemplateCatalog } from "@/design/templateCatalog";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { deleteDesign, getDesignById, listDesignsForUser, requireAuthedUserId, type DesignListItem } from "@/lib/designsApi";
import { DesignCanvas } from "@/components/design/DesignCanvas";
import type { DesignContent } from "@/design/types";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

type DesignWithCanvas = DesignListItem & { canvas_data?: unknown };

export function MyDesignsDashboard() {
  const navigate = useNavigate();
  const { templates } = useTemplateCatalog();
  const templateLabel = (templateId: string) =>
    templates.find((t) => t.id === templateId)?.name ?? templateId;
  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<DesignWithCanvas[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<DesignListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = async () => {
    if (!sb) {
      toast.error("Supabase 설정이 필요합니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
      return;
    }
    setBusy(true);
    try {
      const userId = await requireAuthedUserId(sb);
      const out = await listDesignsForUser(sb, { userId });
      // thumbnail_url이 없는 경우에 대비해, 상위 N개는 canvas_data를 같이 가져와 "내부 캔버스 섬네일"로 렌더
      const enriched: DesignWithCanvas[] = [...out];
      const need = enriched.filter((x) => !x.thumbnail_url).slice(0, 12);
      if (need.length) {
        const rows = await Promise.all(
          need.map((it) => getDesignById(sb, { userId, id: it.id }).catch(() => null))
        );
        const byId = new Map(rows.filter(Boolean).map((r) => [(r as any).id as string, r as any]));
        for (const it of enriched) {
          const row = byId.get(it.id);
          if (row?.canvas_data != null) it.canvas_data = row.canvas_data;
        }
      }
      setItems(enriched);
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message === "not_logged_in"
          ? "로그인이 필요합니다."
          : e instanceof Error
            ? e.message
            : "목록 조회에 실패했습니다.";
      toast.error(msg);
      if (msg.includes("로그인")) navigate("/", { replace: false });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  const askDelete = (it: DesignListItem) => {
    setConfirmTarget(it);
    setConfirmOpen(true);
  };

  const doDelete = async () => {
    if (!sb || !confirmTarget) return;
    setDeleteBusy(true);
    try {
      const userId = await requireAuthedUserId(sb);
      await deleteDesign(sb, { userId, id: confirmTarget.id });
      toast.success("삭제 완료");
      setConfirmOpen(false);
      setConfirmTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="min-h-screen brand-app-shell">
      <header className="border-b border-[rgba(0,0,0,0.06)] bg-white shadow-[0_4px_24px_-6px_rgba(0,0,0,0.08),0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => navigate("/brand-graphics")}
                className="h-auto shrink-0 rounded-[12px] px-2.5 py-2 text-[13px] font-medium text-[#6B6B6B] hover:bg-black/[0.04] hover:text-[#1A1A1A]"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                템플릿으로
              </Button>
              <div className="h-6 w-px shrink-0 bg-[rgba(0,0,0,0.08)]" />
              <div className="flex min-w-0 items-center gap-0">
                <AxisBrandTitle subtitle="내 디자인" />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={load}
              disabled={busy}
              className="shrink-0 rounded-full border-[rgba(0,0,0,0.1)] bg-black text-white hover:bg-zinc-900 hover:text-white"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              새로고침
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {busy ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div className="brand-surface rounded-[20px] p-10 text-center text-sm text-gray-500">
            저장된 디자인이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="brand-surface overflow-hidden rounded-[20px]">
                {/* 썸네일: 비율 고정 + overflow로 프레임 밖으로 넘치지 않음. 래스터는 object-contain, 캔버스 프리뷰는 zoom으로 축소 */}
                <div className="flex aspect-[4/3] w-full min-h-0 items-center justify-center overflow-hidden bg-gray-100">
                  {it.thumbnail_url ? (
                    <img
                      src={it.thumbnail_url}
                      alt={it.name}
                      className="block max-h-full min-h-0 w-full max-w-full object-contain object-center"
                    />
                  ) : it.canvas_data ? (
                    <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden pointer-events-none select-none [&>div]:!p-3">
                      <DesignCanvas
                        content={it.canvas_data as DesignContent}
                        templateId={it.template_id}
                        canvasSize={templates.find((t) => t.id === it.template_id)?.size ?? {
                          width: 1080,
                          height: 1080,
                          unit: "px",
                          name: "Default",
                        }}
                        zoom={0.52}
                        onContentChange={() => {}}
                        onContentDraftChange={() => {}}
                        onBeginCanvasTextEdit={() => {}}
                        onFocusChange={() => {}}
                        showViGrid={false}
                        layoutSnapEnabled={false}
                        onTextFormatTargetChange={() => {}}
                        onCanvasTextSelectionChanged={() => {}}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">NO THUMB</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{it.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {templateLabel(it.template_id)} · {new Date(it.updated_at || it.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      type="button"
                      onClick={() =>
                        navigate(`/create/${it.template_id}?designId=${encodeURIComponent(it.id)}`)
                      }
                      className="h-8 px-2 text-xs gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      이어서 편집
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => askDelete(it)}
                      className="h-8 px-2 text-xs gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => (deleteBusy ? null : setConfirmOpen(o))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>삭제하시겠습니까?</DialogTitle>
            <DialogDescription>
              {confirmTarget ? `“${confirmTarget.name}”` : "선택한 디자인"}을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleteBusy}>
              취소
            </Button>
            <Button type="button" onClick={doDelete} disabled={deleteBusy} className="bg-red-600 hover:bg-red-700">
              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

