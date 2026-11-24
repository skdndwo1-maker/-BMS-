import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { templates as builtinTemplates } from "@/design/templates";
import {
  EMPTY_GUIDE_CONTENT,
  createAdminDeliverable,
  createAdminDeliverableGuide,
  listAdminDeliverableGuides,
  listAdminDeliverables,
  publishAdminDeliverableGuide,
  rollbackAdminDeliverableGuide,
  updateAdminDeliverable,
  updateAdminDeliverableGuide,
  type AdminDeliverable,
  type AdminDeliverableGuide,
  type DeliverableChannel,
  type DeliverableGuideContent,
} from "@/lib/adminApi";

const CHANNEL_LABEL: Record<DeliverableChannel, string> = {
  office: "오피스",
  online: "온라인",
  offline: "오프라인",
  custom: "기타",
};

const ELEMENTS = ["logo", "color", "typo", "layout", "image", "icon", "motif", "text", "other"] as const;
const CHECKS = ["code", "vision", "judgment"] as const;
const SEVERITIES = ["critical", "major", "minor"] as const;

type Selection = { kind: "common" } | { kind: "deliverable"; id: string };

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function cloneContent(c: DeliverableGuideContent | null | undefined): DeliverableGuideContent {
  return JSON.parse(JSON.stringify(c ?? EMPTY_GUIDE_CONTENT)) as DeliverableGuideContent;
}

function normalizeContent(raw: DeliverableGuideContent): DeliverableGuideContent {
  return {
    summary: raw.summary ?? "",
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    direction: {
      focus: raw.direction?.focus ?? [],
      strictness: raw.direction?.strictness ?? "normal",
      ignore: raw.direction?.ignore ?? [],
      instructions: raw.direction?.instructions ?? "",
      feedback_style: raw.direction?.feedback_style ?? "",
    },
    examples: Array.isArray(raw.examples) ? raw.examples : [],
  };
}

export function AdminDeliverables() {
  const navigate = useNavigate();
  const { isAdmin, isReady } = useIsAdmin();

  const [deliverables, setDeliverables] = useState<AdminDeliverable[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "common" });
  const [guides, setGuides] = useState<AdminDeliverableGuide[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [content, setContent] = useState<DeliverableGuideContent>(EMPTY_GUIDE_CONTENT);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [metaName, setMetaName] = useState("");
  const [metaChannel, setMetaChannel] = useState<DeliverableChannel>("online");
  const [metaStatus, setMetaStatus] = useState<"active" | "archived">("active");
  const [metaSort, setMetaSort] = useState(0);
  const [metaTemplates, setMetaTemplates] = useState<string[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newChannel, setNewChannel] = useState<DeliverableChannel>("online");

  const selectedDeliverable = useMemo(() => {
    if (selection.kind !== "deliverable") return null;
    return deliverables.find((d) => d.id === selection.id) ?? null;
  }, [selection, deliverables]);

  const selectedGuide = useMemo(
    () => guides.find((g) => g.id === selectedGuideId) ?? null,
    [guides, selectedGuideId]
  );

  /** statement 등 필드는 항상 수정 가능. draft가 아니면 「초안으로 저장」으로 새 버전 생성 */
  const guideEditable = true;
  const viewingPublished = Boolean(selectedGuide && selectedGuide.status !== "draft");

  const loadDeliverables = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await listAdminDeliverables();
      setDeliverables(list);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadGuides = useCallback(async (sel: Selection) => {
    setGuidesLoading(true);
    try {
      const ref = sel.kind === "common" ? "common" : sel.id;
      const list = await listAdminDeliverableGuides(ref);
      setGuides(list);
      setSelectedGuideId((prev) => {
        if (prev && list.some((g) => g.id === prev)) return prev;
        const draft = list.find((g) => g.status === "draft");
        const active = list.find((g) => g.status === "active");
        return draft?.id ?? active?.id ?? list[0]?.id ?? null;
      });
    } catch (e) {
      toast.error(errText(e));
      setGuides([]);
      setSelectedGuideId(null);
    } finally {
      setGuidesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    void loadDeliverables();
  }, [isReady, isAdmin, loadDeliverables]);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    void loadGuides(selection);
  }, [isReady, isAdmin, selection, loadGuides]);

  useEffect(() => {
    if (!selectedGuide) {
      setContent(EMPTY_GUIDE_CONTENT);
      setNote("");
      return;
    }
    setContent(normalizeContent(selectedGuide.content));
    setNote(selectedGuide.note ?? "");
  }, [selectedGuide]);

  useEffect(() => {
    if (!selectedDeliverable) return;
    setMetaName(selectedDeliverable.name);
    setMetaChannel(selectedDeliverable.channel);
    setMetaStatus(selectedDeliverable.status);
    setMetaSort(selectedDeliverable.sort_order);
    setMetaTemplates([...selectedDeliverable.template_ids]);
  }, [selectedDeliverable]);

  const refreshAll = async () => {
    await loadDeliverables();
    await loadGuides(selection);
  };

  const saveMeta = async () => {
    if (!selectedDeliverable) return;
    setBusy(true);
    try {
      await updateAdminDeliverable(selectedDeliverable.id, {
        name: metaName,
        channel: metaChannel,
        status: metaStatus,
        sort_order: metaSort,
        template_ids: metaTemplates,
      });
      toast.success("제작물 정보를 저장했습니다.");
      await loadDeliverables();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const createDeliverable = async () => {
    setBusy(true);
    try {
      const created = await createAdminDeliverable({
        key: newKey.trim(),
        name: newName.trim(),
        channel: newChannel,
      });
      toast.success(`제작물 "${created.name}" 추가됨`);
      setShowCreate(false);
      setNewKey("");
      setNewName("");
      await loadDeliverables();
      setSelection({ kind: "deliverable", id: created.id });
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    const ref = selection.kind === "common" ? "common" : selection.id;
    setBusy(true);
    try {
      if (selectedGuide && selectedGuide.status === "draft") {
        const updated = await updateAdminDeliverableGuide(selectedGuide.id, normalizeContent(content), note);
        toast.success(`초안 v${updated.version} 저장됨`);
        setSelectedGuideId(updated.id);
      } else {
        const created = await createAdminDeliverableGuide(ref, normalizeContent(content), note || undefined);
        toast.success(`새 초안 v${created.version} 생성됨`);
        setSelectedGuideId(created.id);
      }
      await Promise.all([loadGuides(selection), loadDeliverables()]);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const publishDraft = async () => {
    if (!selectedGuide || selectedGuide.status !== "draft") {
      toast.error("게시할 초안을 선택하세요.");
      return;
    }
    if (!window.confirm(`v${selectedGuide.version} 초안을 게시할까요? 기존 active는 archived로 바뀝니다.`)) return;
    setBusy(true);
    try {
      await updateAdminDeliverableGuide(selectedGuide.id, normalizeContent(content), note);
      await publishAdminDeliverableGuide(selectedGuide.id);
      toast.success(`v${selectedGuide.version} 게시 완료`);
      await refreshAll();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const rollbackGuide = async (guideId: string, version: number) => {
    if (!window.confirm(`v${version}을 복사해 새 초안을 만들까요?`)) return;
    setBusy(true);
    try {
      const result = (await rollbackAdminDeliverableGuide(guideId)) as { guide_id?: string; version?: number };
      toast.success(`되돌리기 초안 v${result.version ?? "?"} 생성`);
      await loadGuides(selection);
      if (result.guide_id) setSelectedGuideId(result.guide_id);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const updateRule = (index: number, patch: Partial<DeliverableGuideContent["rules"][number]>) => {
    setContent((prev) => {
      const rules = [...prev.rules];
      rules[index] = { ...rules[index], ...patch };
      return { ...prev, rules };
    });
  };

  const addRule = () => {
    setContent((prev) => ({
      ...prev,
      rules: [
        ...prev.rules,
        {
          id: `rule_${prev.rules.length + 1}`,
          element: "layout",
          statement: "",
          check: "judgment",
          severity: "major",
          source: "",
        },
      ],
    }));
  };

  const removeRule = (index: number) => {
    setContent((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  };

  const toggleTemplate = (templateId: string) => {
    setMetaTemplates((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
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
          <AxisBrandTitle subtitle="제작물 가이드" />
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

  return (
    <div className="min-h-screen brand-app-shell px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AxisBrandTitle subtitle="제작물 가이드" />
            <p className="mt-2 text-sm text-gray-500">
              제작물별 VI 규칙·검수 방향을 작성·게시하면, 브랜드 검수에서 규칙 우선 + 규칙 연계 RAG로 적용됩니다.
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
              onClick={() => void refreshAll()}
              disabled={listLoading || guidesLoading || busy}
            >
              {listLoading || guidesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              새로고침
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 min-[960px]:grid-cols-[280px_1fr]">
          <aside className="space-y-2">
            <button
              type="button"
              onClick={() => setSelection({ kind: "common" })}
              className={`w-full rounded-xl border bg-white p-3 text-left transition hover:border-[#FF7F66] ${
                selection.kind === "common" ? "border-[#FF7F66] shadow-sm" : "border-gray-200"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">공통 가이드</div>
              <div className="mt-1 text-[11px] text-gray-500">모든 제작물에 공통 적용</div>
            </button>

            {deliverables.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelection({ kind: "deliverable", id: d.id })}
                className={`w-full rounded-xl border bg-white p-3 text-left transition hover:border-[#FF7F66] ${
                  selection.kind === "deliverable" && selection.id === d.id
                    ? "border-[#FF7F66] shadow-sm"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{d.name}</div>
                  <span className="rounded-full bg-[#F3F1EA] px-2 py-0.5 text-[10px] text-gray-600">
                    {CHANNEL_LABEL[d.channel]}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {d.key} · 템플릿 {d.template_ids.length} ·{" "}
                  {d.active_guide ? `active v${d.active_guide.version} (${d.active_guide.rule_count}규칙)` : "미게시"}
                </div>
              </button>
            ))}

            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full rounded-full border-dashed"
              onClick={() => setShowCreate((v) => !v)}
            >
              <Plus className="mr-1 h-4 w-4" /> 제작물 추가
            </Button>

            {showCreate ? (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                <div>
                  <Label className="text-xs">key (영문소문자·숫자·_)</Label>
                  <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="poster_extra" />
                </div>
                <div>
                  <Label className="text-xs">이름</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="추가 포스터" />
                </div>
                <div>
                  <Label className="text-xs">채널</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value as DeliverableChannel)}
                  >
                    {(Object.keys(CHANNEL_LABEL) as DeliverableChannel[]).map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  className="w-full rounded-full bg-black text-white"
                  disabled={busy || !newKey.trim() || !newName.trim()}
                  onClick={() => void createDeliverable()}
                >
                  추가
                </Button>
              </div>
            ) : null}
          </aside>

          <section className="space-y-5">
            {selection.kind === "deliverable" && selectedDeliverable ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">제작물 정보</h2>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-black text-white"
                    disabled={busy}
                    onClick={() => void saveMeta()}
                  >
                    정보 저장
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">이름</Label>
                    <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">채널</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                      value={metaChannel}
                      onChange={(e) => setMetaChannel(e.target.value as DeliverableChannel)}
                    >
                      {(Object.keys(CHANNEL_LABEL) as DeliverableChannel[]).map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">상태</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                      value={metaStatus}
                      onChange={(e) => setMetaStatus(e.target.value as "active" | "archived")}
                    >
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">정렬 순서</Label>
                    <Input
                      type="number"
                      value={metaSort}
                      onChange={(e) => setMetaSort(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">연결 템플릿</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {builtinTemplates.map((t) => {
                      const on = metaTemplates.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTemplate(t.id)}
                          className={`rounded-full border px-3 py-1 text-[11px] ${
                            on ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="text-base font-semibold">공통 가이드</h2>
                <p className="mt-1 text-sm text-gray-500">제작물과 무관하게 모든 검수에 공통으로 넣을 규칙·방향입니다.</p>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">버전</h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={busy}
                    onClick={() => {
                      setSelectedGuideId(null);
                      setContent(cloneContent(EMPTY_GUIDE_CONTENT));
                      setNote("");
                      toast.message("새 초안 작성 모드 — 저장하면 새 버전이 생깁니다.");
                    }}
                  >
                    새 초안
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-black text-white"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                  >
                    {selectedGuide?.status === "draft" ? "초안 저장" : "초안으로 저장"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-[#FF7F66] text-white hover:bg-[#ff6a4d]"
                    disabled={busy || selectedGuide?.status !== "draft"}
                    onClick={() => void publishDraft()}
                  >
                    게시
                  </Button>
                </div>
              </div>

              {guidesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> 버전 불러오는 중…
                </div>
              ) : guides.length === 0 ? (
                <p className="text-sm text-gray-500">아직 버전이 없습니다. 「초안으로 저장」으로 만드세요.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {guides.map((g) => (
                    <div key={g.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedGuideId(g.id)}
                        className={`rounded-full border px-3 py-1 text-[12px] ${
                          selectedGuideId === g.id
                            ? "border-black bg-black text-white"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        v{g.version} · {g.status}
                        {g.status === "active" ? " ★" : ""}
                      </button>
                      {g.status !== "draft" ? (
                        <button
                          type="button"
                          className="rounded-full border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50"
                          disabled={busy}
                          onClick={() => void rollbackGuide(g.id, g.version)}
                          title="이 버전을 복사해 새 초안 생성"
                        >
                          되돌리기
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {viewingPublished ? (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  지금 보는 버전은 <strong>{selectedGuide?.status}</strong>입니다. statement·규칙 등을 바로 고친 뒤
                  「초안으로 저장」→「게시」하면 새 버전으로 검수에 반영됩니다. (게시된 원본은 덮어쓰지 않습니다.)
                </p>
              ) : null}

              <div>
                <Label className="text-xs">메모</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!guideEditable}
                  placeholder="이 버전 메모"
                />
              </div>

              <div>
                <Label className="text-xs">요약 (summary)</Label>
                <Textarea
                  value={content.summary ?? ""}
                  onChange={(e) => setContent((p) => ({ ...p, summary: e.target.value }))}
                  disabled={!guideEditable}
                  rows={2}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">검수 강도 (strictness)</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                    value={content.direction?.strictness ?? "normal"}
                    disabled={!guideEditable}
                    onChange={(e) =>
                      setContent((p) => ({
                        ...p,
                        direction: { ...p.direction, strictness: e.target.value as "strict" | "normal" | "lenient" },
                      }))
                    }
                  >
                    <option value="strict">strict</option>
                    <option value="normal">normal</option>
                    <option value="lenient">lenient</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">focus (쉼표 구분)</Label>
                  <Input
                    value={(content.direction?.focus ?? []).join(", ")}
                    disabled={!guideEditable}
                    onChange={(e) =>
                      setContent((p) => ({
                        ...p,
                        direction: {
                          ...p.direction,
                          focus: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      }))
                    }
                    placeholder="logo, layout"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">instructions</Label>
                  <Textarea
                    value={content.direction?.instructions ?? ""}
                    disabled={!guideEditable}
                    onChange={(e) =>
                      setContent((p) => ({
                        ...p,
                        direction: { ...p.direction, instructions: e.target.value },
                      }))
                    }
                    rows={2}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">feedback_style</Label>
                  <Input
                    value={content.direction?.feedback_style ?? ""}
                    disabled={!guideEditable}
                    onChange={(e) =>
                      setContent((p) => ({
                        ...p,
                        direction: { ...p.direction, feedback_style: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">규칙 ({content.rules.length})</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={!guideEditable}
                    onClick={addRule}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> 규칙 추가
                  </Button>
                </div>

                {content.rules.length === 0 ? (
                  <p className="text-sm text-gray-500">규칙이 없습니다. VI에서 발췌한 수치·금지사항을 추가하세요.</p>
                ) : null}

                {content.rules.map((rule, idx) => (
                  <div key={`${rule.id}-${idx}`} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-medium text-gray-500">{idx + 1}번째 규칙</div>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-500"
                        disabled={!guideEditable}
                        onClick={() => removeRule(idx)}
                        aria-label="규칙 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-[11px]">id</Label>
                        <Input
                          value={rule.id}
                          disabled={!guideEditable}
                          onChange={(e) => updateRule(idx, { id: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">source</Label>
                        <Input
                          value={rule.source ?? ""}
                          disabled={!guideEditable}
                          onChange={(e) => updateRule(idx, { source: e.target.value })}
                          placeholder="VI p.24"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">element</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                          value={rule.element}
                          disabled={!guideEditable}
                          onChange={(e) =>
                            updateRule(idx, { element: e.target.value as (typeof ELEMENTS)[number] })
                          }
                        >
                          {ELEMENTS.map((el) => (
                            <option key={el} value={el}>
                              {el}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-[11px]">check</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                          value={rule.check}
                          disabled={!guideEditable}
                          onChange={(e) => updateRule(idx, { check: e.target.value as (typeof CHECKS)[number] })}
                        >
                          {CHECKS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-[11px]">severity</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                          value={rule.severity}
                          disabled={!guideEditable}
                          onChange={(e) =>
                            updateRule(idx, { severity: e.target.value as (typeof SEVERITIES)[number] })
                          }
                        >
                          {SEVERITIES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[11px]">statement</Label>
                        <Textarea
                          value={rule.statement}
                          disabled={!guideEditable}
                          onChange={(e) => updateRule(idx, { statement: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
