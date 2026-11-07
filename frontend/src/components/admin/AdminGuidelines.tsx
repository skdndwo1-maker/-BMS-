import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  archiveAdminGuidelineSupplement,
  createAdminGuidelineSupplement,
  getAdminGuidelineDetail,
  listAdminGuidelines,
  reindexAdminGuideline,
  saveAdminGuidelineSummary,
  updateAdminGuidelineSupplement,
  type AdminGuidelineDetail,
  type AdminGuidelineSlotOverview,
  type AdminGuidelineSupplement,
} from "@/lib/adminApi";

/** 각 가이드가 어떤 기능의 프롬프트에 들어가는지 (server/app.ts 매핑과 동일) */
const SLOT_USAGE: Record<string, string> = {
  "design-editor-brand-guideline": "디자인 에디터 검수(조형)·이미지 생성 — 원문 + RAG",
  "uplus-vi-guideline": "브랜드 디자인 검수(선택 시) — 요약 + RAG",
  "simply-uplus-guideline": "문안 제안·초안, 디자인 검수 문안, 네이밍 — 원문 + RAG",
  "uplus-company-brand-2026": "네이밍 생성·검수 — 원문 + RAG",
};

type DetailTab = "supplements" | "summary" | "extract" | "chunks";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "supplements", label: "보완 자료 (편집)" },
  { id: "summary", label: "AI 요약 (편집)" },
  { id: "extract", label: "PDF 원문 추출" },
  { id: "chunks", label: "RAG 청크" },
];

function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "-";
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function AdminGuidelines() {
  const navigate = useNavigate();
  const { isAdmin, isReady } = useIsAdmin();
  const [slots, setSlots] = useState<AdminGuidelineSlotOverview[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminGuidelineDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("supplements");
  const [busy, setBusy] = useState(false);

  const [summaryDraft, setSummaryDraft] = useState("");
  const [editingSupplementId, setEditingSupplementId] = useState<string | "new" | null>(null);
  const [supTitle, setSupTitle] = useState("");
  const [supBody, setSupBody] = useState("");
  const [chunkFilter, setChunkFilter] = useState("");

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const list = await listAdminGuidelines();
      setSlots(list);
      setSelectedSlot((prev) => prev ?? list[0]?.slotId ?? null);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (slotId: string) => {
    setDetailLoading(true);
    try {
      const d = await getAdminGuidelineDetail(slotId);
      setDetail(d);
      setSummaryDraft(d.summaries[0]?.summary ?? d.localSummary ?? "");
    } catch (e) {
      toast.error(errText(e));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    void loadSlots();
  }, [isReady, isAdmin, loadSlots]);

  useEffect(() => {
    if (!selectedSlot || !isAdmin) return;
    setEditingSupplementId(null);
    setChunkFilter("");
    void loadDetail(selectedSlot);
  }, [selectedSlot, isAdmin, loadDetail]);

  const refreshAll = async (slotId: string) => {
    await Promise.all([loadDetail(slotId), loadSlots()]);
  };

  const startEditSupplement = (s: AdminGuidelineSupplement | null) => {
    setEditingSupplementId(s ? s.sourceId : "new");
    setSupTitle(s?.title ?? "");
    setSupBody(s?.body ?? "");
  };

  const submitSupplement = async () => {
    if (!selectedSlot || !editingSupplementId) return;
    setBusy(true);
    try {
      const r =
        editingSupplementId === "new"
          ? await createAdminGuidelineSupplement(selectedSlot, supTitle, supBody)
          : await updateAdminGuidelineSupplement(editingSupplementId, supTitle, supBody);
      if (r.failed > 0) toast.warning(`저장됨 — 임베딩 실패 ${r.failed}건 (다시 저장하면 재시도)`);
      else toast.success(`저장 완료 — 청크 ${r.chunkCount}개 임베딩`);
      setEditingSupplementId(null);
      await refreshAll(selectedSlot);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const archiveSupplement = async (s: AdminGuidelineSupplement) => {
    if (!selectedSlot) return;
    if (!window.confirm(`"${s.title}" 보완 자료를 보관 처리할까요? RAG 검색에서 제외됩니다.`)) return;
    setBusy(true);
    try {
      await archiveAdminGuidelineSupplement(s.sourceId);
      toast.success("보관 처리 완료");
      await refreshAll(selectedSlot);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const submitSummary = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      await saveAdminGuidelineSummary(selectedSlot, summaryDraft);
      toast.success("요약 저장 완료");
      await refreshAll(selectedSlot);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const runReindex = async (force: boolean) => {
    if (!selectedSlot) return;
    const msg = force
      ? "PDF 원문 청크를 강제로 다시 만들고 임베딩합니다. 가이드 크기에 따라 1분 이상 걸릴 수 있습니다. 진행할까요?"
      : "PDF 원문 청크를 인덱싱합니다(이미 같은 버전이면 건너뜀). 진행할까요?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r = await reindexAdminGuideline(selectedSlot, force);
      if (r.skipped) toast.info(`건너뜀: ${r.skipReason ?? "-"} (청크 ${r.chunkCount})`);
      else if (r.ok) toast.success(`인덱싱 완료 — 청크 ${r.chunkCount}, 임베딩 ${r.embedded}${r.failed ? `, 실패 ${r.failed}` : ""}`);
      else toast.error(`인덱싱 실패: ${r.error ?? "unknown"}`);
      await refreshAll(selectedSlot);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

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
          <AxisBrandTitle subtitle="가이드 관리" />
          <p className="text-sm text-gray-600">
            이 페이지는 Supabase <code className="text-xs">admin_users</code>에 등록된 관리자만 접근할 수 있습니다.
          </p>
          <Button type="button" className="rounded-full bg-black text-white" onClick={() => navigate("/options")}>
            옵션으로
          </Button>
        </div>
      </div>
    );
  }

  const filteredChunks =
    detail?.pdfAuto?.chunks.filter((c) => !chunkFilter.trim() || c.content.includes(chunkFilter.trim())) ?? [];

  return (
    <div className="min-h-screen brand-app-shell px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AxisBrandTitle subtitle="가이드 관리" />
            <p className="mt-2 text-sm text-gray-500">
              Supabase에 저장된 가이드 원문·요약·RAG 청크를 열람하고, 보완 자료와 요약을 직접 수정해 검수·생성 품질을
              개선합니다.
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
              className="rounded-full bg-black text-white hover:bg-zinc-900"
              onClick={() => (selectedSlot ? void refreshAll(selectedSlot) : void loadSlots())}
              disabled={slotsLoading || detailLoading}
            >
              {slotsLoading || detailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              새로고침
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 min-[960px]:grid-cols-[300px_1fr]">
          <aside className="space-y-2">
            {slots.length === 0 && slotsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
              </div>
            ) : null}
            {slots.map((s) => (
              <button
                key={s.slotId}
                type="button"
                onClick={() => setSelectedSlot(s.slotId)}
                className={`w-full rounded-xl border bg-white p-3 text-left transition hover:border-[#FF7F66] ${
                  selectedSlot === s.slotId ? "border-[#FF7F66] shadow-sm" : "border-gray-200"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">{SLOT_USAGE[s.slotId] ?? s.slotId}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                  <span className="rounded-full bg-[#EBE9E1] px-2 py-0.5 text-gray-700">
                    원문 {s.extract ? `${s.extract.charCount.toLocaleString()}자` : "없음"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      s.pdfAuto?.chunkCount ? "bg-[#EBE9E1] text-gray-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    RAG 청크 {s.pdfAuto?.chunkCount ?? 0}
                  </span>
                  <span className="rounded-full bg-[#FFF0EC] px-2 py-0.5 text-[#C4462E]">보완 {s.supplementCount}</span>
                  {s.summary?.editedAt ? (
                    <span className="rounded-full bg-black px-2 py-0.5 text-white">요약 수정됨</span>
                  ) : null}
                </div>
              </button>
            ))}
          </aside>

          <section className="min-w-0 rounded-[12px] border border-gray-200 bg-white p-5">
            {!detail || detailLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                {detailLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
                  </>
                ) : (
                  "가이드를 선택하세요."
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900">{detail.title}</h2>
                    <p className="text-[12px] text-gray-500">
                      {detail.slotId} · PDF 인덱스 갱신 {fmtDate(detail.pdfAuto?.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void runReindex(false)} disabled={busy}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      PDF 인덱싱
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void runReindex(true)} disabled={busy}>
                      강제 재인덱싱
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-3">
                  {DETAIL_TABS.map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant={tab === t.id ? "default" : "outline"}
                      onClick={() => setTab(t.id)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>

                {tab === "supplements" ? (
                  <div className="space-y-3">
                    <p className="text-[12px] text-gray-500">
                      보완 자료는 저장 즉시 임베딩되어 이 가이드의 RAG 검색에 함께 사용됩니다. PDF가 교체·재인덱싱되어도
                      삭제되지 않습니다. 검수 결과에서 발견한 해석 기준·예외·자주 틀리는 사례를 기록하세요.
                    </p>
                    {editingSupplementId ? (
                      <div className="space-y-3 rounded-lg border border-[#FF7F66]/40 bg-[#FFF7F5] p-4">
                        <div className="space-y-1">
                          <Label htmlFor="sup-title">제목</Label>
                          <Input
                            id="sup-title"
                            value={supTitle}
                            onChange={(e) => setSupTitle(e.target.value)}
                            placeholder="예: 로고 최소 여백 해석 기준"
                            disabled={busy}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="sup-body">내용</Label>
                          <Textarea
                            id="sup-body"
                            value={supBody}
                            onChange={(e) => setSupBody(e.target.value)}
                            rows={12}
                            className="font-mono text-[12px]"
                            disabled={busy}
                          />
                          <p className="text-right text-[11px] text-gray-400">{supBody.length.toLocaleString()} / 40,000자</p>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setEditingSupplementId(null)} disabled={busy}>
                            취소
                          </Button>
                          <Button type="button" onClick={() => void submitSupplement()} disabled={busy}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            저장 + 임베딩
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" onClick={() => startEditSupplement(null)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        보완 자료 추가
                      </Button>
                    )}
                    {detail.supplements.length === 0 ? (
                      <p className="text-sm text-gray-500">등록된 보완 자료가 없습니다.</p>
                    ) : (
                      detail.supplements.map((s) => (
                        <div key={s.sourceId} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                              <p className="text-[11px] text-gray-500">
                                청크 {s.chunkCount} · {s.createdBy ?? "-"} · 수정 {fmtDate(s.updatedAt)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => startEditSupplement(s)} disabled={busy}>
                                수정
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void archiveSupplement(s)} disabled={busy}>
                                보관
                              </Button>
                            </div>
                          </div>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-[12px] text-gray-700">
                            {s.body || "(본문 없음 — 이전 방식으로 등록된 자료)"}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                {tab === "summary" ? (
                  <div className="space-y-3">
                    <p className="text-[12px] text-gray-500">
                      브랜드 디자인 검수에서 이 가이드를 선택했을 때 프롬프트 앞부분에 들어가는 요약입니다. 저장하면 즉시
                      반영되고 서버 재시작 후에도 유지됩니다.
                    </p>
                    <Textarea
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      rows={18}
                      className="font-mono text-[12px]"
                      placeholder="아직 생성된 요약이 없습니다. 브랜드 검수 화면에서 'AI 분석'을 한 번 실행하면 생성됩니다."
                      disabled={busy}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-500">
                        {detail.summaries[0]
                          ? `최근 요약 ${fmtDate(detail.summaries[0].createdAt)} · 모델 ${detail.summaries[0].model ?? "-"}${
                              detail.summaries[0].editedAt
                                ? ` · 수정 ${fmtDate(detail.summaries[0].editedAt)} (${detail.summaries[0].editedBy ?? "-"})`
                                : ""
                            }`
                          : "DB 요약 없음"}
                      </p>
                      <Button type="button" onClick={() => void submitSummary()} disabled={busy || !summaryDraft.trim()}>
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        요약 저장
                      </Button>
                    </div>
                  </div>
                ) : null}

                {tab === "extract" ? (
                  <div className="space-y-2">
                    <p className="text-[12px] text-gray-500">
                      {detail.extract
                        ? `PDF에서 추출한 원문 ${detail.extract.charCount.toLocaleString()}자 · 추출 ${fmtDate(detail.extract.createdAt)} · checksum ${detail.extract.fileChecksum?.slice(0, 12) ?? "-"}… (읽기 전용 — 내용 보강은 '보완 자료'에서)`
                        : "저장된 원문 추출이 없습니다. 'PDF 인덱싱'을 실행하면 로컬 PDF에서 추출해 저장합니다."}
                    </p>
                    {detail.extract ? (
                      <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-700">
                        {detail.extract.text}
                      </pre>
                    ) : null}
                  </div>
                ) : null}

                {tab === "chunks" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] text-gray-500">
                        {detail.pdfAuto
                          ? `PDF 자동 청크 ${detail.pdfAuto.chunks.length}개 (읽기 전용 — 재인덱싱 시 다시 생성됩니다)`
                          : "아직 RAG 인덱스가 없습니다. 'PDF 인덱싱'을 실행하세요."}
                      </p>
                      <Input
                        value={chunkFilter}
                        onChange={(e) => setChunkFilter(e.target.value)}
                        placeholder="청크 내용 검색"
                        className="h-9 w-[220px]"
                      />
                    </div>
                    <div className="max-h-[65vh] space-y-2 overflow-auto">
                      {filteredChunks.map((c) => (
                        <div key={c.chunkIndex} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                          <p className="mb-1 text-[11px] font-medium text-gray-500">#{c.chunkIndex}</p>
                          <pre className="whitespace-pre-wrap text-[12px] text-gray-700">{c.content}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
