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

const mainOptions = [
  {
    id: "graphic",
    icon: Palette,
    badge: "Create",
    badgeColor: "bg-[#F43182]/10 text-[#F43182]",
    title: "브랜드 그래픽 제작",
    description:
      "포스터·플래카드·SNS 등 다양한 사이즈의 템플릿으로 브랜드 가이드에 맞는 비주얼을 손쉽게 디자인합니다.",
    cta: "스튜디오 열기",
    route: "/brand-graphics",
    accent: "from-gray-100 via-gray-50 to-white",
    border: "border-gray-200 hover:border-gray-400",
    iconBg: "bg-gray-100 text-[#F43182]",
    featured: true,
  },
  {
    id: "inspection",
    icon: ScanSearch,
    badge: "AI Powered",
    badgeColor: "bg-violet-100 text-violet-600",
    title: "브랜드 디자인 검수",
    description:
      "그래픽·영상·사진·템플릿을 업로드하면 Gemini AI가 브랜드 가이드라인 부합 여부를 자동으로 검토합니다.",
    cta: "검수 시작하기",
    route: "/inspection",
    accent: "from-gray-100 via-gray-50 to-white",
    border: "border-gray-200 hover:border-gray-400",
    iconBg: "bg-gray-100 text-violet-500",
    featured: false,
  },
  {
    id: "naming",
    icon: PenTool,
    badge: "AI Integrated",
    badgeColor: "bg-sky-100 text-sky-600",
    title: "브랜드 네이밍 검토",
    description:
      "로고·브랜드명·슬로건이 브랜드 원칙에 부합하는지 AI가 즉시 피드백을 제공합니다.",
    cta: "네이밍 검토하기",
    route: "/naming",
    accent: "from-gray-100 via-gray-50 to-white",
    border: "border-gray-200 hover:border-gray-400",
    iconBg: "bg-gray-100 text-sky-500",
    featured: false,
  },
  {
    id: "library",
    icon: Library,
    badge: "Cloud Hub",
    badgeColor: "bg-emerald-100 text-emerald-600",
    title: "브랜드 라이브러리",
    description:
      "BI/CI 로고, .ai 마스터, 공식 슬로건, 픽토그램·아이콘 등 승인 에셋을 한 곳에서 관리합니다.",
    cta: "라이브러리 보기",
    route: "/library",
    accent: "from-gray-100 via-gray-50 to-white",
    border: "border-gray-200 hover:border-gray-400",
    iconBg: "bg-gray-100 text-emerald-500",
    featured: false,
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
    <div className="min-h-screen bg-[#F8F8F9] flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0">
              <img src="/uplus-main-logo.png" alt="U+ AI 브랜드 Agent" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="font-semibold text-gray-900 text-xl block leading-tight">U+ AI 브랜드 Agent</span>
              <span className="text-xs text-gray-400 leading-tight block">Brand Contents Total Managing Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
              className={`flex items-center gap-2 text-sm transition-colors ${
                canOpenAdmin
                  ? "text-gray-600 hover:text-gray-900 cursor-pointer"
                  : "text-gray-300 cursor-not-allowed"
              }`}
            >
              <div
                className={`w-8 h-7 rounded-full border flex items-center justify-center ${
                  canOpenAdmin ? "bg-gray-100 border-gray-300" : "bg-gray-50 border-gray-200"
                }`}
              >
                <Crown className={`w-3.5 h-3.5 ${canOpenAdmin ? "text-gray-500" : "text-gray-300"}`} />
              </div>
              <span className="text-xs font-medium">Admin</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="로그아웃 후 로그인 화면으로 이동"
              className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 cursor-pointer"
            >
              <div className="w-8 h-7 rounded-full border border-gray-300 bg-gray-100 flex items-center justify-center">
                <LogOut className="w-3.5 h-3.5 text-gray-500" aria-hidden />
              </div>
              <span className="text-xs font-medium">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col justify-between max-w-6xl w-full mx-auto px-6 py-6">
        <div>
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">AI-Powered Brand Management</span>
            </div>
            <h1 className="text-gray-900 mb-1" style={{ fontSize: "28px", fontWeight: 700 }}>
              오늘 무엇을 도와드릴까요?
            </h1>
            <p className="text-gray-500 text-xs max-w-xl">
              작업할 메뉴를 선택하거나, 아래 검색창에 필요한 내용을 직접 입력해보세요.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-4">
            {mainOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionClick(option.route)}
                  className={`group relative text-left bg-gradient-to-br ${option.accent} border ${option.border} rounded-xl px-5 py-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#F43182]/30 flex flex-col items-stretch min-h-[200px]`}
                >
                  {option.featured && (
                    <div className="absolute inset-0 rounded-xl bg-[#F43182]/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  )}
                  <div className="flex items-start justify-between mb-3 w-full gap-2">
                    <div className={`w-9 h-9 rounded-lg ${option.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon style={{ width: "18px", height: "18px" }} />
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${option.badgeColor}`}
                    >
                      {option.badge}
                    </span>
                  </div>
                  <h2
                    className="text-gray-900 mb-1.5 leading-snug break-keep"
                    style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em" }}
                  >
                    {option.title}
                  </h2>
                  <p
                    className="text-gray-500 break-keep"
                    style={{ fontSize: "12.5px", lineHeight: 1.55 }}
                  >
                    {option.description}
                  </p>
                  <div
                    className="mt-auto pt-3 flex items-center gap-1.5 font-medium text-gray-700 group-hover:text-gray-900 transition-colors"
                    style={{ fontSize: "12px" }}
                  >
                    {option.cta}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-auto flex min-h-0 flex-col">
          <div className="flex items-center gap-4 mb-3 shrink-0">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Sparkles className="w-3 h-3" />
              <span>or ask anything</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3 justify-center shrink-0">
            {quickSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1 hover:border-[#F43182]/40 hover:text-[#F43182] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          <div
            ref={chatScrollRef}
            className="mb-3 max-h-[min(29.4vh,280px)] min-h-[84px] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white/90 px-3 py-3 shadow-sm"
          >
            {chatMessages.length === 0 && !chatLoading && (
              <p className="text-center text-xs text-gray-400">
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
                    className={`max-w-[min(100%,42rem)] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-[#F43182] text-white"
                        : "border border-gray-100 bg-gray-50 text-gray-800"
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  </div>
                </div>
              ))}
            </div>
            {chatLoading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#F43182]" aria-hidden />
                <span>답변 생성 중…</span>
              </div>
            )}
            {chatError && (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {chatError}
              </p>
            )}
          </div>

          <form onSubmit={handleChatSubmit} className="relative shrink-0">
            <div className="rounded-2xl">
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-gray-200 focus-within:border-[#F43182]/40 focus-within:ring-2 focus-within:ring-[#F43182]/10 transition-all">
                <div className="flex items-center gap-1 border-b border-gray-100 bg-white px-4 pt-3 pb-2">
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
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium tracking-normal transition-all ${
                          isActive
                            ? "border border-[#F43182]/20 bg-[#F43182]/10 text-[#F43182]"
                            : "text-gray-500 hover:bg-gray-50/80 hover:text-gray-700"
                        }`}
                      >
                        <ModeIcon className="h-3.5 w-3.5" />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                {attachedImage && (
                  <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <img
                      src={attachedImage}
                      alt="attachment"
                      className="h-10 w-10 rounded-lg border border-gray-200 object-cover"
                    />
                    <span className="flex-1 truncate text-xs text-gray-500">{attachedFileName}</span>
                    <button type="button" onClick={clearAttachment} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {activeMode === "image" && showImageOptions && !attachedImage && (
                  <div className="mx-4 mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <ImagePlus className="h-4 w-4 text-[#F43182]" />
                      이미지 첨부
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <Camera className="h-4 w-4 text-[#F43182]" />
                      카메라 촬영
                    </button>
                    <span className="ml-1 text-xs text-gray-400">또는 이미지 URL을 입력하세요</span>
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

                <div className="flex items-end gap-3 bg-white px-4 py-3">
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
                    className="min-w-0 flex-1 resize-none bg-white text-sm leading-relaxed tracking-normal text-gray-800 placeholder:text-gray-400 focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex shrink-0 flex-col items-center gap-2 pb-0.5">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700"
                      title="Voice input"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chatLoading}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F43182] text-white shadow-sm transition-all hover:bg-[#d41f6e] disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      {chatLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-b-2xl border-t border-gray-100 bg-white px-4 py-2">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Sparkles className="h-3 w-3 text-gray-400" />
                    Powered by Gemini AI · Based on U+ brand guidelines
                  </span>
                  <span className="text-xs text-gray-400">Shift+Enter로 줄바꿈</span>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
        © 2026 LG U+. All rights reserved.
      </footer>
    </div>
  );
}
