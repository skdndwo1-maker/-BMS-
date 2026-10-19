import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { approveRun, listRuns, rejectRun, type AdminRunRow } from "@/lib/adminApi";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { Loader2 } from "lucide-react";

export function AdminReview() {
  const navigate = useNavigate();
  const { isAdmin, isReady } = useIsAdmin();
  const [reviewer, setReviewer] = useState(() => sessionStorage.getItem("bms_admin_reviewer") || "");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"pending_review" | "approved" | "rejected">("pending_review");
  const [rows, setRows] = useState<AdminRunRow[]>([]);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const title = useMemo(() => {
    if (status === "pending_review") return "승인 대기";
    if (status === "approved") return "승인됨";
    return "거부됨";
  }, [status]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      sessionStorage.setItem("bms_admin_reviewer", reviewer.trim());
      const r = await listRuns("", status, 80);
      setRows(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, reviewer, status]);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    void load();
  }, [isReady, isAdmin, status, load]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center brand-app-shell">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-label="권한 확인 중" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen brand-app-shell px-6 py-8">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <AxisBrandTitle subtitle="관리자 검토" />
          <p className="text-sm text-gray-600">
            이 페이지는 Supabase <code className="text-xs">admin_users</code>에 등록된 관리자만 접근할 수
            있습니다.
          </p>
          <Button type="button" className="rounded-full bg-black text-white" onClick={() => navigate("/options")}>
            옵션으로
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen brand-app-shell px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AxisBrandTitle subtitle="관리자 검토" />
            <p className="mt-2 text-sm text-gray-500">
              Supabase에 저장된 검수·생성 결과를 선별해 승인하거나 거부합니다.
            </p>
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
              className="rounded-full bg-black text-white hover:bg-zinc-900"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              새로고침
            </Button>
          </div>
        </div>

        <Card className="border-gray-200">
          <div className="flex flex-col gap-2 px-6 pt-6 pb-2">
            <CardTitle className="text-lg font-semibold tracking-tight">검토 설정</CardTitle>
            <CardDescription className="text-sm text-gray-500">
              로그인한 관리자 계정으로 인증되었습니다. 검토자 이름은 승인·거부 기록에 함께 저장됩니다.
            </CardDescription>
          </div>
          <CardContent className="space-y-4">
            <div className="max-w-sm space-y-2">
              <Label className="text-sm text-gray-700">Reviewer(선택)</Label>
              <Input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="홍길동"
                onBlur={() => sessionStorage.setItem("bms_admin_reviewer", reviewer.trim())}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={status === "pending_review" ? "default" : "outline"}
                onClick={() => setStatus("pending_review")}
              >
                승인 대기
              </Button>
              <Button
                type="button"
                variant={status === "approved" ? "default" : "outline"}
                onClick={() => setStatus("approved")}
              >
                승인됨
              </Button>
              <Button
                type="button"
                variant={status === "rejected" ? "default" : "outline"}
                onClick={() => setStatus("rejected")}
              >
                거부됨
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-[12px] border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {title} ({rows.length})
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">목록이 비어있습니다.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {r.type} · {r.status} · {r.id.slice(0, 8)}
                      </p>
                      <p className="text-[12px] text-gray-500">
                        {new Date(r.created_at).toLocaleString()} · guideline:{" "}
                        {r.guidelines?.title ?? r.guideline_id ?? "-"} · template:{" "}
                        {r.template_id ?? "-"} · score: {r.score ?? "-"} · model: {r.model ?? "-"}
                      </p>
                    </div>

                    {status === "pending_review" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            try {
                              setLoading(true);
                              await approveRun("", r.id, reviewer.trim() || undefined);
                              toast.success("승인 완료");
                              await load();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : String(e));
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                        >
                          승인
                        </Button>
                        <Input
                          value={rejectReason[r.id] ?? ""}
                          onChange={(e) => setRejectReason((p) => ({ ...p, [r.id]: e.target.value }))}
                          placeholder="거부 사유(선택)"
                          className="h-9 w-[220px]"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={async () => {
                            try {
                              setLoading(true);
                              await rejectRun(
                                "",
                                r.id,
                                (rejectReason[r.id] ?? "").trim(),
                                reviewer.trim() || undefined,
                              );
                              toast.success("거부 완료");
                              await load();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : String(e));
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                        >
                          거부
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] text-gray-600">세부 내용</summary>
                    <div className="mt-2 grid grid-cols-1 gap-2 min-[900px]:grid-cols-2">
                      <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
                        <p className="mb-1 text-[11px] font-medium text-gray-700">input_text</p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-gray-700">
                          {r.input_text ?? ""}
                        </pre>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
                        <p className="mb-1 text-[11px] font-medium text-gray-700">output_text</p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-gray-700">
                          {r.output_text ?? ""}
                        </pre>
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
