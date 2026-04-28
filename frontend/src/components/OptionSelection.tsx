import { useState, useRef, useEffect, type ChangeEvent, type FormEvent, type CSSProperties } from "react";
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
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

/** Soft UI ref: warm cream bg, salmon coral, black CTAs, large radius, soft lift shadows */
const PALETTE = {
  bg: "#F5F3F0",
  card: "#FFFFFF",
  cardMuted: "#FAF8F6",
  border: "rgba(0,0,0,0.04)",
  borderSubtle: "rgba(0,0,0,0.06)",
  ink: "#1A1A1A",
  inkSoft: "#2A2A2A",
  muted: "#6B6B6B",
  mutedSoft: "#9A9A9A",
  coral: "#FF7F66",
  coralSoft: "rgba(255, 127, 102, 0.14)",
  coralInk: "#C14D38",
  onCoral: "#FFFFFF",
  black: "#000000",
  blackSoft: "#1A1A1A",
  shadow:
    "0 4px 24px -6px rgba(0,0,0,0.08), 0 2px 10px -4px rgba(0,0,0,0.04)",
  shadowHover: "0 8px 32px -8px rgba(0,0,0,0.10), 0 4px 16px -6px rgba(0,0,0,0.06)",
  shadowLg: "0 12px 40px -12px rgba(0,0,0,0.10)",
} as const;

const pageFont: CSSProperties = {
  fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
};

/** Coral bullet — ref ~6–8px circle */
function SectionDot({ size = 8, style }: { size?: 6 | 7 | 8; style?: CSSProperties }) {
  const px = size;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: `${px}px`,
        height: `${px}px`,
        borderRadius: "50%",
        background: PALETTE.coral,
        flexShrink: 0,
        boxShadow: "0 0 0 1px rgba(255, 127, 102, 0.15)",
        ...style,
      }}
    />
  );
}

const mainOptions = [
  {
    id: "graphic",
    icon: Palette,
    badge: "Create",
    title: "브랜드 그래픽 제작",
    description:
      "포스터·플래카드·SNS 등 다양한 사이즈의 템플릿으로 브랜드 가이드에 맞는 비주얼을 손쉽게 디자인합니다.",
    cta: "스튜디오 열기",
    route: "/brand-graphics",
  },
  {
    id: "inspection",
    icon: ScanSearch,
    badge: "AI Powered",
    title: "브랜드 디자인 검수",
    description:
      "그래픽·영상·사진·템플릿을 업로드하면 Gemini AI가 브랜드 가이드라인 부합 여부를 자동으로 검토합니다.",
    cta: "검수 시작하기",
    route: "/inspection",
  },
  {
    id: "naming",
    icon: PenTool,
    badge: "AI Integrated",
    title: "브랜드 네이밍 검토",
    description:
      "로고·브랜드명·슬로건이 브랜드 원칙에 부합하는지 AI가 즉시 피드백을 제공합니다.",
    cta: "네이밍 검토하기",
    route: "/naming",
  },
  {
    id: "library",
    icon: Library,
    badge: "Cloud Hub",
    title: "브랜드 라이브러리",
    description:
      "BI/CI 로고, .ai 마스터, 공식 슬로건, 픽토그램·아이콘 등 승인 에셋을 한 곳에서 관리합니다.",
    cta: "라이브러리 보기",
    route: "/library",
  },
];

const quickSuggestions = [
  "A2 이벤트 포스터 만들기",
  "배너가 브랜드 가이드에 맞는지 확인",
  "브랜드 공식 로고 파일 찾기",
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
  const [hoveredOptionId, setHoveredOptionId] = useState<string | null>(null);
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
      userMsg,
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
    <div
      style={{
        minHeight: "100vh",
        background: PALETTE.bg,
        display: "flex",
        flexDirection: "column",
        ...pageFont,
      }}
    >
      <header
        style={{
          background: PALETTE.card,
          borderBottom: `1px solid ${PALETTE.borderSubtle}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: PALETTE.shadow,
        }}
      >
        <div
          style={{
            maxWidth: "1080px",
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              minWidth: 0,
              flex: "1 1 auto",
              paddingRight: "12px",
            }}
          >
            <AxisBrandTitle subtitle="Brand Contents Manager" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: canOpenAdmin ? "#FFFFFF" : PALETTE.mutedSoft,
                cursor: canOpenAdmin ? "pointer" : "not-allowed",
                background: canOpenAdmin ? PALETTE.black : "rgba(0,0,0,0.06)",
                border: "none",
                borderRadius: "999px",
                padding: "8px 16px 8px 10px",
                boxShadow: canOpenAdmin ? "0 4px 14px -4px rgba(0,0,0,0.25)" : "none",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
            >
              <Crown
                style={{
                  width: "16px",
                  height: "16px",
                  color: canOpenAdmin ? "#FFFFFF" : PALETTE.mutedSoft,
                  flexShrink: 0,
                }}
              />
              <span>Admin</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="로그아웃 후 로그인 화면으로 이동"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#FFFFFF",
                cursor: "pointer",
                background: PALETTE.black,
                border: "none",
                borderRadius: "999px",
                padding: "8px 16px 8px 10px",
                boxShadow: "0 4px 14px -4px rgba(0,0,0,0.2)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
            >
              <LogOut style={{ width: "16px", height: "16px", color: "#FFFFFF" }} aria-hidden />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          maxWidth: "1080px",
          width: "100%",
          margin: "0 auto",
          padding: "28px 24px 32px",
          minHeight: 0,
        }}
      >
        <div>
          <div style={{ marginBottom: "28px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: PALETTE.coralSoft,
                color: PALETTE.coralInk,
                border: `1px solid rgba(255, 127, 102, 0.28)`,
                borderRadius: "999px",
                padding: "6px 14px",
                marginBottom: "14px",
                fontWeight: 600,
              }}
            >
              <Sparkles style={{ width: "14px", height: "14px", color: PALETTE.coral, flexShrink: 0 }} />
              <span style={{ fontSize: "12px" }}>AI-powered brand management</span>
              <SectionDot size={6} style={{ boxShadow: "0 0 0 1px rgba(255, 127, 102, 0.25)" }} />
            </div>
            <h1
              style={{
                color: PALETTE.ink,
                fontSize: "clamp(24px, 2.2vw, 30px)",
                fontWeight: 700,
                margin: "0 0 8px 0",
                letterSpacing: "-0.03em",
                lineHeight: 1.2,
              }}
            >
              오늘 무엇을 도와드릴까요?
            </h1>
            <p style={{ color: PALETTE.muted, fontSize: "15px", maxWidth: "520px", lineHeight: 1.55 }}>
              작업할 메뉴를 선택하거나, 아래 검색창에 필요한 내용을 직접 입력해보세요.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: "12px",
              marginBottom: "12px",
              paddingLeft: "16px",
              paddingRight: "2px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: PALETTE.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Branding
              </span>
              <SectionDot size={8} />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {mainOptions.map((option) => {
              const Icon = option.icon;
              const isHovered = hoveredOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionClick(option.route)}
                  onMouseEnter={() => setHoveredOptionId(option.id)}
                  onMouseLeave={() => setHoveredOptionId(null)}
                  className={isHovered ? "option-card-breathe" : undefined}
                  style={{
                    position: "relative",
                    textAlign: "left",
                    background: isHovered ? PALETTE.coral : PALETTE.card,
                    border: isHovered ? "1px solid rgba(255, 255, 255, 0.3)" : `1px solid ${PALETTE.borderSubtle}`,
                    borderRadius: "24px",
                    padding: "22px 20px 20px",
                    cursor: "pointer",
                    transition:
                      "background 0.28s ease, border-color 0.25s, box-shadow 0.22s, transform 0.22s, color 0.2s",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "200px",
                    outline: "none",
                    boxShadow: isHovered ? undefined : PALETTE.shadow,
                    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      textAlign: "left",
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      flex: "1 1 auto",
                      minHeight: 0,
                      minWidth: 0,
                    }}
                  >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "14px",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "14px",
                        background: isHovered ? "rgba(255, 255, 255, 0.22)" : PALETTE.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "background 0.2s",
                        boxShadow: isHovered ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
                      }}
                    >
                      <Icon
                        style={{
                          width: "19px",
                          height: "19px",
                          color: isHovered ? "#FFFFFF" : PALETTE.inkSoft,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                        letterSpacing: "0.02em",
                        border: isHovered ? "1px solid rgba(255, 255, 255, 0.45)" : "1px solid rgba(255, 127, 102, 0.3)",
                        background: isHovered ? "rgba(255, 255, 255, 0.95)" : PALETTE.coralSoft,
                        color: isHovered ? PALETTE.coral : PALETTE.coralInk,
                        transition: "background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s",
                        boxShadow: isHovered ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
                      }}
                    >
                      {option.badge}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <h2
                      style={{
                        color: isHovered ? "#FFFFFF" : PALETTE.ink,
                        fontSize: "16px",
                        fontWeight: 700,
                        margin: 0,
                        lineHeight: 1.35,
                        letterSpacing: "-0.02em",
                        wordBreak: "keep-all",
                        transition: "color 0.2s",
                        flex: "0 1 auto",
                        minWidth: 0,
                      }}
                    >
                      {option.title}
                    </h2>
                    <div
                      aria-hidden
                      style={{
                        flex: 1,
                        minWidth: "12px",
                        height: "1px",
                        background: isHovered ? "rgba(255, 255, 255, 0.45)" : PALETTE.coral,
                        opacity: isHovered ? 1 : 0.45,
                        borderRadius: "1px",
                        transition: "opacity 0.2s, background 0.2s",
                        alignSelf: "center",
                        transform: "scaleY(0.35)",
                        transformOrigin: "center",
                      }}
                    />
                    <SectionDot
                      size={6}
                      style={{
                        flexShrink: 0,
                        alignSelf: "center",
                        background: isHovered ? "#FFFFFF" : PALETTE.coral,
                        boxShadow: isHovered ? "0 0 0 1px rgba(255,255,255,0.35)" : undefined,
                      }}
                    />
                  </div>
                  <p
                    style={{
                      color: isHovered ? "rgba(255, 255, 255, 0.9)" : PALETTE.muted,
                      fontSize: "12.5px",
                      lineHeight: 1.6,
                      wordBreak: "keep-all",
                      flexGrow: 1,
                      transition: "color 0.2s",
                    }}
                  >
                    {option.description}
                  </p>
                  <div
                    style={{
                      marginTop: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: isHovered ? "#FFFFFF" : PALETTE.inkSoft,
                      letterSpacing: "0.01em",
                      transition: "color 0.2s",
                    }}
                  >
                    {option.cta}
                    <ArrowRight
                      style={{
                        width: "14px",
                        height: "14px",
                        transform: isHovered ? "translateX(3px)" : "translateX(0)",
                        transition: "transform 0.2s",
                      }}
                    />
                  </div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{ marginTop: "auto", display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "10px",
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, height: "1px", background: PALETTE.borderSubtle }} />
            <span style={{ fontSize: "11px", color: PALETTE.muted, fontWeight: 600 }}>
              or ask anything
            </span>
            <div style={{ flex: 1, height: "1px", background: PALETTE.borderSubtle }} />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "8px",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 600, color: PALETTE.muted, letterSpacing: "0.02em" }}>
              Quick prompts
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              marginBottom: "12px",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {quickSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                style={{
                  fontSize: "12px",
                  color: PALETTE.inkSoft,
                  background: PALETTE.card,
                  border: `1px solid ${PALETTE.borderSubtle}`,
                  borderRadius: "999px",
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontWeight: 500,
                  boxShadow: "0 2px 8px -4px rgba(0,0,0,0.06)",
                  transition: "border-color 0.15s, color 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = PALETTE.coral;
                  (e.currentTarget as HTMLButtonElement).style.color = PALETTE.coral;
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = PALETTE.shadow;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = PALETTE.borderSubtle;
                  (e.currentTarget as HTMLButtonElement).style.color = PALETTE.inkSoft;
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px -4px rgba(0,0,0,0.06)";
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div
            ref={chatScrollRef}
            style={{
              marginBottom: "14px",
              maxHeight: "min(29.4vh, 280px)",
              minHeight: "88px",
              overflowY: "auto",
              overscrollBehavior: "contain",
              borderRadius: "24px",
              border: `1px solid ${PALETTE.borderSubtle}`,
              background: PALETTE.card,
              padding: "16px",
              boxShadow: PALETTE.shadow,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                paddingBottom: "10px",
                borderBottom: `1px solid ${PALETTE.borderSubtle}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: PALETTE.ink, letterSpacing: "-0.01em" }}>
                  AI assistant
                </span>
                <SectionDot size={7} />
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 500,
                  color: PALETTE.mutedSoft,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                chat
              </span>
            </div>
            {chatMessages.length === 0 && !chatLoading && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: "12px",
                  color: PALETTE.mutedSoft,
                  margin: 0,
                }}
              >
                질문을 입력하면 여기에 답변이 표시됩니다. 이전 대화 맥락이 유지됩니다.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    gap: "8px",
                  }}
                >
                  {m.role === "assistant" && (
                    <SectionDot size={6} style={{ marginTop: "10px", flexShrink: 0 }} />
                  )}
                  <div
                    style={{
                      maxWidth: "min(100%, 42rem)",
                      borderRadius: "20px",
                      padding: "10px 14px",
                      fontSize: "14px",
                      lineHeight: 1.55,
                      background: m.role === "user" ? PALETTE.black : PALETTE.bg,
                      color: m.role === "user" ? "#FFFFFF" : PALETTE.ink,
                      border: m.role === "user" ? "none" : `1px solid ${PALETTE.borderSubtle}`,
                      boxShadow:
                        m.role === "user"
                          ? "0 4px 14px -6px rgba(0,0,0,0.2)"
                          : "0 2px 8px -4px rgba(0,0,0,0.04)",
                    }}
                  >
                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {m.content}
                    </span>
                  </div>
                  {m.role === "user" && <SectionDot size={6} style={{ marginTop: "10px", flexShrink: 0 }} />}
                </div>
              ))}
            </div>
            {chatLoading && (
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: PALETTE.muted,
                }}
              >
                <SectionDot size={6} />
                <Loader2
                  style={{ width: "16px", height: "16px", flexShrink: 0, color: PALETTE.coral }}
                  className="animate-spin"
                  aria-hidden
                />
                <span>답변 생성 중…</span>
              </div>
            )}
            {chatError && (
              <p style={{ marginTop: "8px", fontSize: "12px", color: "#DC2626" }} role="alert">
                {chatError}
              </p>
            )}
          </div>

          <form onSubmit={handleChatSubmit} style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                background: PALETTE.card,
                border: `1px solid ${PALETTE.borderSubtle}`,
                borderRadius: "28px",
                overflow: "hidden",
                boxShadow: PALETTE.shadowLg,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "6px",
                  borderBottom: `1px solid ${PALETTE.borderSubtle}`,
                  background: PALETTE.card,
                  padding: "12px 16px 10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    paddingRight: "10px",
                    marginRight: "4px",
                    borderRight: `1px solid ${PALETTE.borderSubtle}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: PALETTE.muted,
                      letterSpacing: "0.02em",
                    }}
                  >
                    Mode
                  </span>
                  <SectionDot size={6} />
                </div>
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
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        borderRadius: "999px",
                        padding: "7px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                        background: isActive ? PALETTE.black : "transparent",
                        border: isActive ? "none" : "1px solid transparent",
                        color: isActive ? "#FFFFFF" : PALETTE.muted,
                        boxShadow: isActive ? "0 4px 12px -4px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      <ModeIcon style={{ width: "14px", height: "14px" }} />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {attachedImage && (
                <div
                  style={{
                    margin: "12px 16px 0",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    borderRadius: "16px",
                    border: `1px solid ${PALETTE.borderSubtle}`,
                    background: PALETTE.cardMuted,
                    padding: "8px 12px",
                  }}
                >
                  <img
                    src={attachedImage}
                    alt="attachment"
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      border: `1px solid ${PALETTE.borderSubtle}`,
                      objectFit: "cover",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "12px",
                      color: PALETTE.muted,
                    }}
                  >
                    {attachedFileName}
                  </span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: PALETTE.mutedSoft,
                      padding: 0,
                    }}
                  >
                    <X style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
              )}

              {activeMode === "image" && showImageOptions && !attachedImage && (
                <div
                  style={{
                    margin: "12px 16px 0",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      border: `1px solid ${PALETTE.borderSubtle}`,
                      background: PALETTE.card,
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: PALETTE.inkSoft,
                      cursor: "pointer",
                      boxShadow: "0 2px 8px -4px rgba(0,0,0,0.05)",
                    }}
                  >
                    <ImagePlus style={{ width: "15px", height: "15px", color: PALETTE.coral }} />
                    이미지 첨부
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      border: `1px solid ${PALETTE.borderSubtle}`,
                      background: PALETTE.card,
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: PALETTE.inkSoft,
                      cursor: "pointer",
                      boxShadow: "0 2px 8px -4px rgba(0,0,0,0.05)",
                    }}
                  >
                    <Camera style={{ width: "15px", height: "15px", color: PALETTE.coral }} />
                    카메라 촬영
                  </button>
                  <span style={{ marginLeft: "2px", fontSize: "12px", color: PALETTE.mutedSoft }}>
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

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "12px",
                  background: PALETTE.bg,
                  padding: "14px 16px",
                }}
              >
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
                  style={{
                    flex: 1,
                    minWidth: 0,
                    resize: "none",
                    background: "transparent",
                    fontSize: "14px",
                    lineHeight: 1.55,
                    color: PALETTE.ink,
                    border: "none",
                    outline: "none",
                    opacity: chatLoading ? 0.6 : 1,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    flexShrink: 0,
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    paddingBottom: "2px",
                  }}
                >
                  <button
                    type="button"
                    style={{
                      display: "flex",
                      width: "40px",
                      height: "40px",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "12px",
                      border: `1px solid ${PALETTE.borderSubtle}`,
                      background: PALETTE.card,
                      color: PALETTE.muted,
                      cursor: "pointer",
                    }}
                    title="Voice input"
                  >
                    <Mic style={{ width: "15px", height: "15px" }} />
                  </button>
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || chatLoading}
                    style={{
                      display: "flex",
                      width: "40px",
                      height: "40px",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "12px",
                      background: !chatInput.trim() || chatLoading ? "rgba(0,0,0,0.08)" : PALETTE.black,
                      color: !chatInput.trim() || chatLoading ? PALETTE.mutedSoft : "#FFFFFF",
                      border: "none",
                      cursor: !chatInput.trim() || chatLoading ? "not-allowed" : "pointer",
                      boxShadow:
                        !chatInput.trim() || chatLoading
                          ? "none"
                          : "0 4px 14px -4px rgba(0,0,0,0.25)",
                      transition: "background 0.15s, box-shadow 0.15s",
                    }}
                  >
                    {chatLoading ? (
                      <Loader2
                        style={{ width: "15px", height: "15px" }}
                        className="animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <Send style={{ width: "15px", height: "15px" }} />
                    )}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: `1px solid ${PALETTE.borderSubtle}`,
                  background: PALETTE.card,
                  padding: "10px 16px",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    color: PALETTE.muted,
                  }}
                >
                  <Sparkles style={{ width: "11px", height: "11px", color: PALETTE.mutedSoft }} />
                  Powered by Gemini AI · Based on brand guidelines
                </span>
                <span style={{ fontSize: "11px", color: PALETTE.mutedSoft }}>Shift+Enter로 줄바꿈</span>
              </div>
            </div>
          </form>
        </div>
      </main>

      <footer
        style={{
          padding: "16px",
          textAlign: "center",
          fontSize: "11px",
          color: PALETTE.mutedSoft,
          borderTop: `1px solid ${PALETTE.borderSubtle}`,
        }}
      >
        © 2026 {APP_DISPLAY_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
