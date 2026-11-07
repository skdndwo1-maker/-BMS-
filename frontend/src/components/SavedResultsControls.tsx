import { useMemo, useState } from "react";
import { FolderOpen, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  deleteSavedResult,
  listSavedResults,
  type SavedResultKind,
  type SavedResultListItem,
} from "@/lib/savedResultsApi";

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message === "not_logged_in") return "로그인이 필요합니다.";
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return fallback;
}

const MODE_LABEL: Record<string, string> = { generate: "생성", audit: "검수" };

type Props = {
  kind: SavedResultKind;
  /** 현재 화면에 저장할 결과가 있는지 */
  canSave: boolean;
  /** 불러오거나 저장한 항목 id (덮어쓰기 대상) */
  currentId: string | null;
  defaultName: string;
  onSave: (name: string, asNew: boolean) => Promise<void>;
  onLoad: (id: string) => Promise<void>;
  /** 현재 불러온 항목이 삭제되면 호출 */
  onCurrentDeleted?: () => void;
};

export function SavedResultsControls({
  kind,
  canSave,
  currentId,
  defaultName,
  onSave,
  onLoad,
  onCurrentDeleted,
}: Props) {
  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);
  const [dialog, setDialog] = useState<"none" | "save" | "load">("none");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<SavedResultListItem[]>([]);

  const kindLabel = kind === "naming" ? "네이밍" : "검수";

  const openSave = () => {
    setName(defaultName);
    setDialog("save");
  };

  const openLoad = () => {
    if (!sb) {
      toast.error("Supabase 설정이 필요합니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
      return;
    }
    setDialog("load");
    setItems([]);
    setBusy(true);
    void listSavedResults(sb, kind)
      .then(setItems)
      .catch((e) => toast.error(errorMessage(e, "목록을 불러오지 못했습니다.")))
      .finally(() => setBusy(false));
  };

  const runSave = (asNew: boolean) => {
    const finalName = name.trim() || defaultName;
    setBusy(true);
    void onSave(finalName, asNew)
      .then(() => {
        toast.success("저장 완료");
        setDialog("none");
      })
      .catch((e) => toast.error(errorMessage(e, "저장에 실패했습니다.")))
      .finally(() => setBusy(false));
  };

  const runLoad = (id: string) => {
    setBusy(true);
    void onLoad(id)
      .then(() => {
        toast.success("불러오기 완료");
        setDialog("none");
      })
      .catch((e) => toast.error(errorMessage(e, "불러오기에 실패했습니다.")))
      .finally(() => setBusy(false));
  };

  const runDelete = (it: SavedResultListItem) => {
    if (!sb) return;
    if (!window.confirm(`"${it.name}"을(를) 삭제할까요?`)) return;
    setBusy(true);
    void deleteSavedResult(sb, kind, it.id)
      .then(() => {
        setItems((prev) => prev.filter((x) => x.id !== it.id));
        if (it.id === currentId) onCurrentDeleted?.();
        toast.success("삭제 완료");
      })
      .catch((e) => toast.error(errorMessage(e, "삭제에 실패했습니다.")))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-[rgba(0,0,0,0.1)]"
          onClick={openLoad}
        >
          <FolderOpen className="mr-1.5 h-4 w-4" />
          불러오기
        </Button>
        <Button
          type="button"
          className="rounded-full bg-black text-white hover:bg-zinc-900"
          onClick={openSave}
          disabled={!canSave}
          title={canSave ? undefined : `${kindLabel} 결과가 나온 뒤 저장할 수 있습니다.`}
        >
          <Save className="mr-1.5 h-4 w-4" />
          저장하기
        </Button>
      </div>

      <Dialog open={dialog === "save"} onOpenChange={(o) => (busy ? null : setDialog(o ? "save" : "none"))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>저장하기</DialogTitle>
            <DialogDescription>
              입력값과 {kindLabel} 결과를 내 계정에 저장합니다. 언제든 불러와 이어서 진행할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`saved-${kind}-name`}>이름</Label>
            <Input
              id={`saved-${kind}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog("none")} disabled={busy}>
              취소
            </Button>
            {currentId ? (
              <Button type="button" variant="secondary" onClick={() => runSave(true)} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                새로 저장
              </Button>
            ) : null}
            <Button type="button" onClick={() => runSave(!currentId)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {currentId ? "덮어쓰기" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "load"} onOpenChange={(o) => (busy ? null : setDialog(o ? "load" : "none"))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>불러오기</DialogTitle>
            <DialogDescription>저장한 {kindLabel} 결과를 선택하면 입력값과 결과가 화면에 복원됩니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {busy && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                불러오는 중…
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">저장된 항목이 없습니다.</div>
            ) : (
              <ul className="space-y-2">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className={`flex items-center gap-3 rounded-xl border bg-white p-3 transition hover:border-[#FF7F66] ${
                      it.id === currentId ? "border-[#FF7F66]" : "border-gray-200"
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => runLoad(it.id)}
                      disabled={busy}
                    >
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {it.mode ? (
                          <span className="mr-2 rounded-full bg-[#EBE9E1] px-2 py-0.5 text-[11px] font-medium text-gray-700">
                            {MODE_LABEL[it.mode] ?? it.mode}
                          </span>
                        ) : null}
                        {it.score != null ? (
                          <span className="mr-2 rounded-full bg-black px-2 py-0.5 text-[11px] font-medium text-white">
                            {it.score}점
                          </span>
                        ) : null}
                        {it.name}
                      </p>
                      {it.summary ? <p className="mt-1 line-clamp-2 text-[12px] text-gray-500">{it.summary}</p> : null}
                      <p className="mt-1 text-[11px] text-gray-400">
                        {new Date(it.updated_at).toLocaleString()}
                      </p>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="삭제"
                      onClick={() => runDelete(it)}
                      disabled={busy}
                    >
                      <Trash2 className="h-4 w-4 text-gray-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
