import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { templates } from "@/design/templates";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { deleteDesign, getDesignById, listDesignsForUser, requireAuthedUserId, type DesignListItem } from "@/lib/designsApi";
import { DesignCanvas } from "@/components/design/DesignCanvas";
import type { DesignContent } from "@/design/types";

function templateLabel(templateId: string): string {
  return templates.find((t) => t.id === templateId)?.name ?? templateId;
}

type DesignWithCanvas = DesignListItem & { canvas_data?: unknown };

export function MyDesignsDashboard() {
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" type="button" onClick={() => navigate("/brand-graphics")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                템플릿으로
              </Button>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0">
                  <img src="/uplus-main-logo.png" alt="U+ AI 브랜드 Agent" className="h-full w-full object-contain" />
                </div>
                <div className="flex h-10 flex-col justify-between py-px">
                  <h1 className="text-xl font-semibold leading-none text-gray-900">내 디자인</h1>
                  <p className="text-xs leading-none text-gray-500">저장된 디자인 목록</p>
                </div>
              </div>
            </div>

            <Button variant="outline" size="sm" type="button" onClick={load} disabled={busy}>
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
          <div className="rounded-[12px] border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            저장된 디자인이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-[12px] border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="aspect-[4/3] w-full bg-gray-50">
                  {it.thumbnail_url ? (
                    <img src={it.thumbnail_url} alt={it.name} className="h-full w-full object-cover" />
                  ) : it.canvas_data ? (
                    <div className="h-full w-full pointer-events-none select-none">
                      <DesignCanvas
                        content={it.canvas_data as DesignContent}
                        templateId={it.template_id}
                        canvasSize={templates.find((t) => t.id === it.template_id)?.size ?? {
                          width: 1080,
                          height: 1080,
                          unit: "px",
                          name: "Default",
                        }}
                        zoom={0.88}
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

