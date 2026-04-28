import { useState, useRef, useEffect, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Palette,
  ScanSearch,
  PenTool,
  Library,
  Send,
  ArrowRight,
  Sparkles,
  Crown,
  LogOut,
  ImagePlus,
  Camera,
  Globe,
  Mic,
  FileSearch,
  X,
  Loader2,
} from "lucide-react";
import { postOptionsChat, type OptionsChatMessage } from "@/lib/optionsChatApi";
import { apiUrl } from "@/lib/apiUrl";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { APP_DISPLAY_NAME } from "@/constants/appBranding";

const mainOptions = [
  {
    id: "graphic",
    icon: Palette,
    badge: "Create",
    badgeStyle: { background: "rgba(244,49,130,0.12)", color: "#F43182" },
    title: "브랜드 그래픽 제작",
    description:
      "포스터·플래카드·SNS 등 다양한 사이즈의 템플릿으로 브랜드 가이드에 맞는 비주얼을 손쉽게 디자인합니다.",
    cta: "스튜디오 열기",
    route: "/brand-graphics",
    iconBg: { background: "rgba(244,49,130,0.10)", color: "#F43182" },
    accentBar: "#F43182",
  },
  {
    id: "inspection",
    icon: ScanSearch,
    badge: "AI Powered",
    badgeStyle: { background: "rgba(139,92,246,0.10)", color: "#7C3AED" },
    title: "브랜드 디자인 검수",
    description:
      "그래픽·영상·사진·템플릿을 업로드하면 Gemini AI가 브랜드 가이드라인 부합 여부를 자동으로 검토합니다.",
    cta: "검수 시작하기",
    route: "/inspection",
    iconBg: { background: "rgba(139,92,246,0.10)", color: "#7C3AED" },
    accentBar: "#7C3AED",
  },
  {
    id: "naming",
    icon: PenTool,
    badge: "AI Integrated",
    badgeStyle: { background: "rgba(14,165,233,0.10)", color: "#0EA5E9" },
    title: "브랜드 네이밍 검토",
    description:
      "로고·브랜드명·슬로건이 브랜드 원칙에 부합하는지 AI가 즉시 피드백을 제공합니다.",
    cta: "네이밍 검토하기",
    route: "/naming",
    iconBg: { background: "rgba(14,165,233,0.10)", color: "#0EA5E9" },
    accentBar: "#0EA5E9",
  },
  {
    id: "library",
    icon: Library,
    badge: "Cloud Hub",
    badgeStyle: { background: "rgba(16,185,129,0.10)", color: "#059669" },
    title: "브랜드 라이브러리",
    description:
      "BI/CI 로고, .ai 마스터, 공식 슬로건, 픽토그램·아이콘 등 승인 에셋을 한 곳에서 관리합니다.",
    cta: "라이브러리 보기",
    route: "/library",
    iconBg: { background: "rgba(16,185,129,0.10)", color: "#059669" },
    accentBar: "#059669",
  },
];

const quickSuggestions = [
  "A2 이벤트 포스터 만들기",
  "배너가 브랜드 가이드에 맞는지 확인",
  "LG U+ 공식 로고 파일 찾기",
  "이 슬로건 브랜드 적합성 검토",
];

type SearchMode = "general" | "image" | "web" | "file";

const searchModes: { id: SearchMode; icon: typeof Globe; label: string; desc: string }[] = [
  { id: "general", icon: Sparkles, label: "AI Search", desc: "AI에게 무엇이든 물어보세요" },
  { id: "image", icon: ImagePlus, label: "Image Search", desc: "이미지를 첨부하거나 촬영하세요" },
  { id: "web", icon: Globe, label: "Web Search", desc: "웹에서 브랜드 레퍼런스 검색" },
  { id: "file", icon: FileSearch, label: "File Search", desc: "브랜드 에셋 및 파일 검색" },
];

export function OptionSelection() {
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState("");
  const [activeMode, setActiveMode] = useState<SearchMode>("general");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [canOpenAdmin, setCanOpenAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (!cancelled) setCanOpenAdmin(false);
          return;
        }
        const r = await fetch(apiUrl("/api/admin/me"), {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const out = (await r.json().catch(() => ({}))) as { isAdmin?: boolean };
        if (!cancelled) setCanOpenAdmin(Boolean(out?.isAdmin));
      } catch {
        if (!cancelled) setCanOpenAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; content: string }>
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: chatMessages.length <= 1 ? "auto" : "smooth" });
  }, [chatMessages, chatLoading]);

  const handleOptionClick = (route: string) => {
    navigate(route);
  };

  const submitChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg: OptionsChatMessage = { role: "user", content: text };
    const historyForApi: OptionsChatMessage[] = [
      ...chatMessages.map(({ role, content }) => ({ role, content })),
      userMsg
    ];

    setChatError(null);
    setChatMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const reply = await postOptionsChat(historyForApi);
      setChatMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChatError(msg);
      setChatMessages((prev) => prev.slice(0, -1));
      setChatInput(text);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitChat();
  };

  const handleSuggestion = (text: string) => {
    setChatInput(text);
  };

  const handleFileAttach = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => setAttachedImage(ev.target?.result as string);
      reader.readAsDataURL(file);
      setShowImageOptions(false);
    }
  };

  const clearAttachment = () => {
    setAttachedImage(null);
    setAttachedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleLogout = async () => {
    try {
      const sb = getSupabaseClient();
      await sb.auth.signOut();
    } catch {
      /* Supabase 미설정 등 — 로그인 화면으로만 이동 */
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F0E9DF" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10"
        style={{ background: "#1A2535", borderBottom: "1px solid rgba(240,233,223,0.06)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0">
              <img src="/uplus-main-logo.png" alt={APP_DISPLAY_NAME} className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="font-semibold text-white text-lg block leading-tight">{APP_DISPLAY_NAME}</span>
              <span className="text-xs block leading-tight" style={{ color: "#8A9BB8" }}>
                Brand design &amp; content platform
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canOpenAdmin) return;
                navigate("/admin/review");
              }}
              disabled={!canOpenAdmin}
              title={
                canOpenAdmin
                  ? "관리자 모드로 이동"
                  : "권한이 없습니다. 관리자 검토 페이지에서 Admin Key를 입력한 사용자만 접근할 수 있습니다."
              }
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={
                canOpenAdmin
                  ? { background: "rgba(240,233,223,0.08)", color: "#F0E9DF" }
                  : { color: "rgba(240,233,223,0.25)", cursor: "not-allowed" }
              }
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="로그아웃 후 로그인 화면으로 이동"
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: "rgba(240,233,223,0.08)", color: "#F0E9DF" }}
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col justify-between max-w-6xl w-full mx-auto px-6 py-6">
        <div>
          {/* Page intro */}
          <div className="mb-6">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3 text-xs font-medium"
              style={{ background: "rgba(26,37,53,0.08)", color: "#6B7280" }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: "#8A8FA8" }} />
              <span>AI-Powered Brand Management</span>
            </div>
            <h1
              className="mb-1"
              style={{ fontSize: "26px", fontWeight: 700, color: "#1A2535", letterSpacing: "-0.02em" }}
            >
              오늘 무엇을 도와드릴까요?
            </h1>
            <p style={{ color: "#8A8FA8", fontSize: "13px" }}>
              작업할 메뉴를 선택하거나, 아래 검색창에 필요한 내용을 직접 입력해보세요.
            </p>
          </div>

          {/* Option cards */}
          <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-4">
            {mainOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionClick(option.route)}
                  className="group relative text-left rounded-2xl flex flex-col items-stretch min-h-[200px] transition-all duration-200 focus:outline-none"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid rgba(26,37,53,0.08)",
                    padding: "20px",
                    boxShadow: "0 1px 4px rgba(26,37,53,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      "0 6px 20px rgba(26,37,53,0.10)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      "0 1px 4px rgba(26,37,53,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                  }}
                >
                  {/* Top accent bar */}
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: option.accentBar }}
                  />

                  <div className="flex items-start justify-between mb-4 w-full gap-2">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={option.iconBg}
                    >
                      <Icon style={{ width: "17px", height: "17px" }} />
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={option.badgeStyle}
                    >
                      {option.badge}
                    </span>
                  </div>

                  <h2
                    className="mb-1.5 leading-snug break-keep"
                    style={{ fontSize: "16px", fontWeight: 700, color: "#1A2535", letterSpacing: "-0.01em" }}
                  >
                    {option.title}
                  </h2>
                  <p
                    className="break-keep flex-1"
                    style={{ fontSize: "12px", lineHeight: 1.6, color: "#8A8FA8" }}
                  >
                    {option.description}
                  </p>
                  <div
                    className="mt-4 pt-3 flex items-center gap-1.5 font-semibold transition-colors"
                    style={{
                      fontSize: "12px",
                      color: option.accentBar,
                      borderTop: "1px solid rgba(26,37,53,0.06)",
                    }}
                  >
                    {option.cta}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom chat area */}
        <div className="mt-auto flex min-h-0 flex-col">
          <div className="flex items-center gap-4 mb-3 shrink-0">
            <div className="flex-1 h-px" style={{ background: "rgba(26,37,53,0.12)" }} />
            <div className="flex items-center gap-2 text-xs" style={{ color: "#A8A49C" }}>
              <Sparkles className="w-3 h-3" />
              <span>or ask anything</span>
            </div>
            <div className="flex-1 h-px" style={{ background: "rgba(26,37,53,0.12)" }} />
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5 mb-3 justify-center shrink-0">
            {quickSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="text-xs rounded-full px-3 py-1 transition-all"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(26,37,53,0.10)",
                  color: "#6B7280",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(244,49,130,0.35)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#F43182";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(26,37,53,0.10)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#6B7280";
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          <div
            ref={chatScrollRef}
            className="mb-3 max-h-[min(29.4vh,280px)] min-h-[84px] overflow-y-auto overscroll-contain rounded-2xl px-3 py-3"
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(26,37,53,0.08)",
              boxShadow: "0 1px 4px rgba(26,37,53,0.04)",
            }}
          >
            {chatMessages.length === 0 && !chatLoading && (
              <p className="text-center text-xs" style={{ color: "#A8A49C" }}>
                질문을 입력하면 여기에 답변이 표시됩니다. 이전 대화 맥락이 유지됩니다.
              </p>
            )}
            <div className="space-y-3">
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[min(100%,42rem)] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm"
                    style={
                      m.role === "user"
                        ? { background: "#1A2535", color: "#F0E9DF" }
                        : {
                            background: "#F5F0E8",
                            color: "#1A2535",
                            border: "1px solid rgba(26,37,53,0.08)",
                          }
                    }
                  >
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  </div>
                </div>
              ))}
            </div>
            {chatLoading && (
              <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: "#8A8FA8" }}>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: "#F43182" }} aria-hidden />
                <span>답변 생성 중…</span>
              </div>
            )}
            {chatError && (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {chatError}
              </p>
            )}
          </div>

          {/* Chat input */}
          <form onSubmit={handleChatSubmit} className="relative shrink-0">
            <div
              className="rounded-2xl transition-all"
              style={{
                background: "#FFFFFF",
                border: "1px solid rgba(26,37,53,0.10)",
                boxShadow: "0 1px 4px rgba(26,37,53,0.04)",
              }}
            >
              {/* Mode tabs */}
              <div
                className="flex items-center gap-1 px-4 pt-3 pb-2"
                style={{ borderBottom: "1px solid rgba(26,37,53,0.06)" }}
              >
                {searchModes.map((mode) => {
                  const ModeIcon = mode.icon;
                  const isActive = activeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setActiveMode(mode.id);
                        if (mode.id === "image") setShowImageOptions(true);
                        else setShowImageOptions(false);
                      }}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                      style={
                        isActive
                          ? {
                              background: "rgba(244,49,130,0.08)",
                              color: "#F43182",
                              border: "1px solid rgba(244,49,130,0.18)",
                            }
                          : { color: "#8A8FA8", border: "1px solid transparent" }
                      }
                    >
                      <ModeIcon className="h-3.5 w-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {/* Attached image */}
              {attachedImage && (
                <div
                  className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{ border: "1px solid rgba(26,37,53,0.10)", background: "#F5F0E8" }}
                >
                  <img
                    src={attachedImage}
                    alt="attachment"
                    className="h-10 w-10 rounded-lg border object-cover"
                    style={{ borderColor: "rgba(26,37,53,0.10)" }}
                  />
                  <span className="flex-1 truncate text-xs" style={{ color: "#8A8FA8" }}>
                    {attachedFileName}
                  </span>
                  <button type="button" onClick={clearAttachment} style={{ color: "#A8A49C" }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Image options */}
              {activeMode === "image" && showImageOptions && !attachedImage && (
                <div className="mx-4 mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all"
                    style={{
                      border: "1px solid rgba(26,37,53,0.10)",
                      background: "#FFFFFF",
                      color: "#1A2535",
                    }}
                  >
                    <ImagePlus className="h-4 w-4" style={{ color: "#F43182" }} />
                    이미지 첨부
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all"
                    style={{
                      border: "1px solid rgba(26,37,53,0.10)",
                      background: "#FFFFFF",
                      color: "#1A2535",
                    }}
                  >
                    <Camera className="h-4 w-4" style={{ color: "#F43182" }} />
                    카메라 촬영
                  </button>
                  <span className="ml-1 text-xs" style={{ color: "#A8A49C" }}>
                    또는 이미지 URL을 입력하세요
                  </span>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileAttach} />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileAttach}
              />

              {/* Text input area */}
              <div className="flex items-end gap-3 px-4 py-3">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitChat();
                    }
                  }}
                  placeholder={
                    activeMode === "image"
                      ? "이미지를 첨부하고 확인하거나 찾고 싶은 내용을 설명해주세요..."
                      : activeMode === "web"
                        ? "브랜드 레퍼런스, 트렌드, 영감이 될 내용을 검색해보세요..."
                        : activeMode === "file"
                          ? "브랜드 에셋, 로고, 템플릿, .ai 파일 등을 검색하세요..."
                          : "필요한 내용을 입력하세요 — 예) 여름 캠페인용 A3 이벤트 포스터가 필요해요"
                  }
                  rows={3}
                  disabled={chatLoading}
                  className="min-w-0 flex-1 resize-none text-sm leading-relaxed tracking-normal bg-transparent focus:outline-none disabled:opacity-60"
                  style={{ color: "#1A2535" }}
                />
                <div className="flex shrink-0 flex-col items-center gap-2 pb-0.5">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-xl transition-all"
                    style={{
                      border: "1px solid rgba(26,37,53,0.10)",
                      background: "#F5F0E8",
                      color: "#8A8FA8",
                    }}
                    title="Voice input"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || chatLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-xl transition-all shadow-sm"
                    style={
                      !chatInput.trim() || chatLoading
                        ? { background: "#E8E0D6", color: "#A8A49C" }
                        : { background: "#F43182", color: "#FFFFFF" }
                    }
                  >
                    {chatLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Footer bar */}
              <div
                className="flex items-center justify-between rounded-b-2xl px-4 py-2"
                style={{ borderTop: "1px solid rgba(26,37,53,0.06)" }}
              >
                <span className="flex items-center gap-1 text-xs" style={{ color: "#A8A49C" }}>
                  <Sparkles className="h-3 w-3" />
                  Powered by Gemini AI · Based on brand guidelines
                </span>
                <span className="text-xs" style={{ color: "#C8C2B8" }}>
                  Shift+Enter로 줄바꿈
                </span>
              </div>
            </div>
          </form>
        </div>
      </main>

      <footer
        className="py-4 text-center text-xs"
        style={{ color: "#A8A49C", borderTop: "1px solid rgba(26,37,53,0.08)" }}
      >
        © 2026 {APP_DISPLAY_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
