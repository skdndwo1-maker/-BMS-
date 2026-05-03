import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  FileImage,
  RectangleHorizontal,
  LayoutTemplate,
  Share2,
  Bell,
  Signpost,
  Presentation,
  Layers,
} from "lucide-react";
import { templates as designTemplates, templateCategories } from "@/design/templates";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { GlobalBrandNav } from "@/components/GlobalBrandNav";

type MediaType = "online" | "offline";

/** Align with Option / Login: cream canvas, white cards, coral accent, black primary CTAs */
const PAL = {
  bg: "#F5F3F0",
  card: "#FFFFFF",
  borderSubtle: "rgba(0,0,0,0.06)",
  ink: "#1A1A1A",
  muted: "#6B6B6B",
  mutedSoft: "#9A9A9A",
  coral: "#FF7F66",
  coralSoft: "rgba(255, 127, 102, 0.12)",
  black: "#000000",
  inputBg: "#E5E5E5",
  shadow: "0 4px 24px -6px rgba(0,0,0,0.08), 0 2px 10px -4px rgba(0,0,0,0.04)",
  shadowHover: "0 8px 32px -8px rgba(0,0,0,0.10), 0 4px 16px -6px rgba(0,0,0,0.06)",
} as const;

const pageFont: CSSProperties = {
  fontFamily: "var(--font-family-base)",
};

const categoryIconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  LayoutTemplate,
  FileImage,
  Share2,
  Bell,
  Signpost,
  Presentation,
  RectangleHorizontal,
};

function parseCategoryFromSearch(searchParams: URLSearchParams): string | "all" {
  const c = searchParams.get("category");
  if (c && templateCategories.some((x) => x.id === c)) return c;
  return "all";
}

export function TemplateGallery() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mediaType: MediaType = searchParams.get("media") === "offline" ? "offline" : "online";

  const [selectedCategory, setSelectedCategory] = useState<string | "all">(() => parseCategoryFromSearch(searchParams));
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setSelectedCategory(parseCategoryFromSearch(searchParams));
  }, [searchParams]);

  const setMediaType = (next: MediaType) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("media", next);
      p.delete("category");
      return p;
    });
    setSelectedCategory("all");
  };

  const setCategory = (id: string | "all") => {
    setSelectedCategory(id);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (id === "all") p.delete("category");
      else p.set("category", id);
      return p;
    });
  };

  const filteredTemplates = designTemplates.filter((template) => {
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMediaType = template.mediaType === mediaType;
    return matchesCategory && matchesSearch && matchesMediaType;
  });

  const availableCategories = templateCategories.filter((category) => {
    const hasTemplates = designTemplates.some(
      (template) => template.category === category.id && template.mediaType === mediaType
    );
    return hasTemplates;
  });

  const handleSelectTemplate = (templateId: string) => {
    navigate(`/create/${templateId}`);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAL.bg,
        ...pageFont,
      }}
    >
      <header
        style={{
          background: PAL.card,
          borderBottom: `1px solid ${PAL.borderSubtle}`,
          position: "sticky",
          top: 0,
          zIndex: 20,
          boxShadow: PAL.shadow,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0, flex: "1 1 auto" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                columnGap: 14,
                rowGap: 4,
                minWidth: 0,
              }}
            >
              <AxisBrandTitle subtitle="브랜드 그래픽 제작" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#FFFFFF",
              background: PAL.black,
              border: "none",
              borderRadius: 999,
              padding: "8px 18px",
              cursor: "pointer",
              boxShadow: "0 4px 14px -4px rgba(0,0,0,0.2)",
              flexShrink: 0,
              transition: "box-shadow 0.15s, transform 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px -6px rgba(0,0,0,0.28)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px -4px rgba(0,0,0,0.2)";
            }}
          >
            내 디자인
          </button>
        </div>
        <GlobalBrandNav className="bg-[#FAFAFA]" innerClassName="max-w-[1200px] px-6" />
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 40px" }}>
        <section
          style={{
            background: PAL.card,
            border: `1px solid ${PAL.borderSubtle}`,
            borderRadius: 24,
            padding: "22px 24px 24px",
            marginBottom: 24,
            boxShadow: PAL.shadow,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: PAL.coralSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers style={{ width: 20, height: 20, color: PAL.coral }} />
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 700,
                color: PAL.ink,
                letterSpacing: "-0.02em",
              }}
            >
              카테고리 선택
            </h2>
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: PAL.coral,
                marginLeft: 2,
                boxShadow: "0 0 0 1px rgba(255, 127, 102, 0.2)",
              }}
              aria-hidden
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              {(["online", "offline"] as const).map((m) => {
                const active = mediaType === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMediaType(m)}
                    style={{
                      borderRadius: 999,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s, box-shadow 0.15s, border 0.15s",
                      background: active ? PAL.black : PAL.card,
                      color: active ? "#FFFFFF" : PAL.muted,
                      border: active ? "none" : `1px solid ${PAL.borderSubtle}`,
                      boxShadow: active ? "0 4px 12px -4px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                  >
                    {m === "online" ? "온라인" : "오프라인"}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start" }}>
              {(["all", ...availableCategories.map((c) => c.id)] as (string | "all")[]).map((id) => {
                const isAll = id === "all";
                const active = selectedCategory === id;
                const label = isAll
                  ? "전체"
                  : (availableCategories.find((c) => c.id === id)?.label ?? id);
                const cat = !isAll ? availableCategories.find((c) => c.id === id) : null;
                const Icon = cat ? (categoryIconMap[cat.icon] ?? LayoutTemplate) : null;
                return (
                  <button
                    key={isAll ? "all" : id}
                    type="button"
                    onClick={() => setCategory(isAll ? "all" : (id as string))}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s",
                      background: active ? PAL.coral : PAL.card,
                      color: active ? "#FFFFFF" : PAL.ink,
                      border: `1px solid ${active ? PAL.coral : PAL.borderSubtle}`,
                      boxShadow: active ? "0 2px 8px -2px rgba(255, 127, 102, 0.4)" : "none",
                    }}
                  >
                    {Icon && <Icon style={{ width: 14, height: 14 }} className="shrink-0" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div style={{ marginBottom: 20 }}>
          <div style={{ position: "relative", maxWidth: 420 }}>
            <Search
              style={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                width: 18,
                height: 18,
                color: PAL.mutedSoft,
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder="템플릿 검색…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: 48,
                paddingLeft: 48,
                paddingRight: 16,
                fontSize: 15,
                color: PAL.ink,
                background: PAL.inputBg,
                border: "none",
                borderRadius: 999,
                outline: "none",
                boxSizing: "border-box",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.04)",
              }}
            />
          </div>
        </div>

        <div
          className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          style={{ alignItems: "stretch" }}
        >
          {filteredTemplates.map((template) => {
            const isPlacard = template.category === "placard";
            return (
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectTemplate(template.id);
                  }
                }}
                onClick={() => handleSelectTemplate(template.id)}
                className="group"
                style={{
                  minWidth: 0,
                  cursor: "pointer",
                  background: PAL.card,
                  borderRadius: 20,
                  border: `1px solid ${PAL.borderSubtle}`,
                  overflow: "hidden",
                  boxShadow: PAL.shadow,
                  transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = PAL.shadowHover;
                  (e.currentTarget as HTMLDivElement).style.border = `1px solid ${
                    isPlacard ? PAL.coral : "rgba(0,0,0,0.08)"
                  }`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = PAL.shadow;
                  (e.currentTarget as HTMLDivElement).style.border = `1px solid ${PAL.borderSubtle}`;
                }}
              >
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    height: 96,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    background: "linear-gradient(145deg, #FAF8F6 0%, #F0EEEB 100%)",
                  }}
                >
                  <div
                    style={{
                      zIndex: 1,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        margin: "0 auto 6px",
                        display: "flex",
                        height: 48,
                        width: 48,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 14,
                        background: PAL.card,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                    >
                      {isPlacard ? (
                        <RectangleHorizontal style={{ width: 22, height: 22, color: PAL.coral }} />
                      ) : (
                        <LayoutTemplate style={{ width: 22, height: 22, color: PAL.coral }} />
                      )}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: PAL.muted }}>{template.size.name}</div>
                  </div>
                </div>
                <div style={{ minWidth: 0, padding: "12px 14px" }}>
                  <h3
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: 14,
                      fontWeight: 600,
                      color: PAL.ink,
                      letterSpacing: "-0.01em",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {template.name}
                  </h3>
                  <p
                    className="mb-0 hidden sm:line-clamp-2 sm:mb-2 sm:block"
                    style={{ color: PAL.muted, fontSize: 12, lineHeight: 1.4, margin: "0 0 8px 0" }}
                  >
                    {template.description}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      minWidth: 0,
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        flex: 1,
                        fontSize: 11,
                        color: PAL.mutedSoft,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {template.size.width} × {template.size.height} {template.size.unit}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTemplate(template.id);
                      }}
                      className="opacity-0 group-hover:opacity-100"
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        color: isPlacard ? PAL.coral : PAL.ink,
                        background: isPlacard ? PAL.coralSoft : "rgba(0,0,0,0.04)",
                        border: "none",
                        borderRadius: 999,
                        padding: "4px 10px",
                        cursor: "pointer",
                        transition: "opacity 0.15s, background 0.15s",
                      }}
                    >
                      사용하기
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredTemplates.length === 0 && (
          <div
            style={{
              padding: "64px 24px",
              textAlign: "center",
              background: PAL.card,
              borderRadius: 24,
              border: `1px solid ${PAL.borderSubtle}`,
              boxShadow: PAL.shadow,
            }}
          >
            <FileImage style={{ width: 56, height: 56, color: PAL.mutedSoft, margin: "0 auto 16px" }} />
            <h3 style={{ margin: "0 0 8px 0", fontSize: 17, fontWeight: 600, color: PAL.ink }}>검색 결과가 없습니다</h3>
            <p style={{ margin: 0, fontSize: 14, color: PAL.muted }}>검색어나 카테고리 필터를 바꿔 보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
