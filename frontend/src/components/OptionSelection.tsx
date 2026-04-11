import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
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
  ImagePlus,
  Camera,
  Globe,
  Mic,
  FileSearch,
  X,
} from "lucide-react";

const mainOptions = [
  {
    id: "graphic",
    icon: Palette,
    badge: "Create",
    badgeColor: "bg-[#F43182]/10 text-[#F43182]",
    title: "브랜드 그래픽 제작",
    description:
      "브랜드 가이드에 맞는 비주얼을 손쉽게 디자인하세요.\n포스터, 플래카드, SNS 등 다양한 사이즈의 템플릿을 제공합니다.",
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
      "그래픽, 영상, 사진, 템플릿을 업로드하면 Gemini AI가 브랜드 가이드라인에 맞는지 자동으로 검토합니다.",
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
      "로고, 브랜드명, 슬로건을 검토받으세요.\nAI가 브랜드 원칙에 부합하는지 피드백을 제공합니다.",
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
      "BI/CI 로고, 마스터 .ai 파일, 공식 슬로건, 픽토그램, 아이콘 등 승인된 에셋을 한 곳에서 관리합니다.",
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

  const handleOptionClick = (route: string) => {
    navigate(route);
  };

  const submitChat = () => {
    if (chatInput.trim() || attachedImage) {
      navigate(`/dashboard?q=${encodeURIComponent(chatInput.trim())}`);
    }
  };

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitChat();
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

  return (
    <div className="min-h-screen bg-[#F8F8F9] flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0">
              <img src="/uplus-main-logo.png" alt="U+ Layer" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="font-semibold text-gray-900 text-xl block leading-tight">U+ Layer</span>
              <span className="text-xs text-gray-400 leading-tight block">Brand Contents Total Managing Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-8 h-7 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center">
                <Crown className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <span className="text-gray-600 text-xs">Admin</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-between max-w-6xl w-full mx-auto px-6 py-6">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mainOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionClick(option.route)}
                  className={`group relative text-left bg-gradient-to-br ${option.accent} border ${option.border} rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#F43182]/30 flex flex-col items-start justify-center h-[180px]`}
                >
                  {option.featured && (
                    <div className="absolute inset-0 rounded-xl bg-[#F43182]/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  )}
                  <div className="flex items-start justify-between mb-3 w-full">
                    <div className={`w-9 h-9 rounded-lg ${option.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon style={{ width: "18px", height: "18px" }} />
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${option.badgeColor}`}>{option.badge}</span>
                  </div>
                  <h2 className="text-gray-900 mb-2" style={{ fontSize: "21.6px", fontWeight: 600 }}>
                    {option.title}
                  </h2>
                  <p className="text-gray-500 leading-relaxed mb-3 whitespace-pre-line" style={{ fontSize: "12px" }}>
                    {option.description}
                  </p>
                  <div
                    className="flex items-center gap-1.5 font-medium text-gray-700 group-hover:text-gray-900 transition-colors"
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

        <div>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Sparkles className="w-3 h-3" />
              <span>or ask anything</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
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

          <form onSubmit={handleChatSubmit} className="relative">
            {/* 전체 높이만 제한 — 내부 타이포·패딩은 원래 서식 유지, 넘치면 이 영역 안에서 스크롤 */}
            <div className="max-h-[min(480px,84vh)] overflow-y-auto overscroll-contain rounded-2xl">
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
                        submitChat();
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
                    className="min-w-0 flex-1 resize-none bg-white text-sm leading-relaxed tracking-normal text-gray-800 placeholder:text-gray-400 focus:outline-none"
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
                      disabled={!chatInput.trim() && !attachedImage}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F43182] text-white shadow-sm transition-all hover:bg-[#d41f6e] disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <Send className="h-4 w-4" />
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
