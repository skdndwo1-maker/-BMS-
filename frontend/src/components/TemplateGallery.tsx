import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  ArrowLeft,
  FileImage,
  RectangleHorizontal,
  LayoutTemplate,
  Share2,
  Bell,
  Signpost,
  Presentation,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { templates as designTemplates, templateCategories } from "@/design/templates";
import { APP_DISPLAY_NAME } from "@/constants/appBranding";

type MediaType = "online" | "offline";

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutTemplate,
  FileImage,
  Share2,
  Bell,
  Signpost,
  Presentation,
  RectangleHorizontal,
};

const categoryTabBase =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[13px] font-medium transition-all focus-visible:outline-none";
const categoryTabIdle = "bg-white text-[#6B7280] hover:border-[rgba(26,37,53,0.20)]";
const categoryTabActive = "bg-[#1A2535] text-white border-[#1A2535]";

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
    <div className="min-h-screen" style={{ background: "#F0E9DF" }}>
      <header style={{ background: "#1A2535", borderBottom: "1px solid rgba(240,233,223,0.06)" }}>
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => navigate("/options")}
                className="text-sm font-medium transition-colors"
                style={{ color: "rgba(240,233,223,0.70)" }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                옵션으로
              </Button>
              <div className="h-5 w-px" style={{ background: "rgba(240,233,223,0.15)" }} />
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0">
                  <img src="/uplus-main-logo.png" alt={APP_DISPLAY_NAME} className="h-full w-full object-contain" />
                </div>
                <div className="flex h-10 flex-col justify-between py-px">
                  <h1 className="text-lg font-semibold leading-none" style={{ color: "#F0E9DF" }}>{APP_DISPLAY_NAME}</h1>
                  <p className="text-xs leading-none" style={{ color: "#8A9BB8" }}>브랜드 그래픽 제작 · Brand Design Create</p>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              type="button"
              onClick={() => navigate("/dashboard")}
              className="text-sm font-medium transition-all"
              style={{
                background: "rgba(240,233,223,0.10)",
                color: "#F0E9DF",
                border: "1px solid rgba(240,233,223,0.15)",
                borderRadius: "10px",
              }}
            >
              내 디자인
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div
          className="mb-8 rounded-2xl px-8 pb-6 pt-5"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(26,37,53,0.08)",
            boxShadow: "0 1px 4px rgba(26,37,53,0.05)",
          }}
        >
          <div className="mb-4 flex min-w-0 items-center gap-2">
            <Layers className="h-6 w-6 shrink-0" style={{ color: "#F43182" }} />
            <h2 className="font-semibold" style={{ fontSize: "18px", color: "#1A2535" }}>카테고리 선택</h2>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMediaType("online")}
                className={`${categoryTabBase} ${mediaType === "online" ? categoryTabActive : categoryTabIdle}`}
              >
                온라인
              </button>
              <span className="select-none text-[13px] font-medium text-gray-300" aria-hidden>
                -
              </span>
              <button
                type="button"
                onClick={() => setMediaType("offline")}
                className={`${categoryTabBase} ${mediaType === "offline" ? categoryTabActive : categoryTabIdle}`}
              >
                오프라인
              </button>
            </div>
            <div className="flex min-h-0 flex-wrap content-start gap-2">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`${categoryTabBase} ${selectedCategory === "all" ? categoryTabActive : categoryTabIdle}`}
              >
                전체
              </button>
              {availableCategories.map((category) => {
                const Icon = categoryIconMap[category.icon] ?? LayoutTemplate;
                const active = selectedCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategory(category.id)}
                    className={`${categoryTabBase} ${active ? categoryTabActive : categoryTabIdle}`}
                  >
                    <Icon className="mr-1.5 h-4 w-4 shrink-0" />
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#8A8FA8" }} />
            <Input
              type="search"
              placeholder="템플릿 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-xl text-sm"
              style={{
                background: "#FFFFFF",
                border: "1px solid rgba(26,37,53,0.10)",
                color: "#1A2535",
              }}
            />
          </div>
        </div>

        <div
          className="grid w-full min-w-0 grid-cols-4 gap-2 min-[768px]:gap-4 [grid-template-columns:repeat(4,minmax(0,1fr))]"
          style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
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
                className="group min-w-0 cursor-pointer overflow-hidden rounded-2xl transition-all"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(26,37,53,0.08)",
                  boxShadow: "0 1px 4px rgba(26,37,53,0.05)",
                }}
                onClick={() => handleSelectTemplate(template.id)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(26,37,53,0.10)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(26,37,53,0.05)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }}
              >
                <div
                  className="relative flex h-20 items-center justify-center overflow-hidden sm:h-24"
                  style={{ background: "#F5F0E8" }}
                >
                  <div
                    className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: "linear-gradient(135deg, rgba(244,49,130,0.06), rgba(26,37,53,0.06))" }}
                  />
                  <div className="z-10 text-center">
                    <div
                      className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-xl shadow-sm sm:h-12 sm:w-12"
                      style={{ background: "#FFFFFF" }}
                    >
                      {isPlacard ? (
                        <RectangleHorizontal className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: "#C8C2B8" }} />
                      ) : (
                        <LayoutTemplate className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: "#C8C2B8" }} />
                      )}
                    </div>
                    <div className="text-[11px] font-medium" style={{ color: "#A8A49C" }}>{template.size.name}</div>
                  </div>
                </div>

                <div className="min-w-0 p-2 sm:p-3">
                  <h3 className="mb-0.5 truncate text-[13px] font-semibold" style={{ color: "#1A2535" }}>{template.name}</h3>
                  <p className="mb-2 hidden truncate text-[12px] sm:block" style={{ color: "#8A8FA8" }}>{template.description}</p>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px]" style={{ color: "#A8A49C" }}>
                      {template.size.width} × {template.size.height} {template.size.unit}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="h-7 px-2 text-[12px] opacity-0 transition-opacity group-hover:opacity-100 font-semibold"
                      style={{ color: "#F43182" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTemplate(template.id);
                      }}
                    >
                      사용하기
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="py-16 text-center">
            <FileImage className="mx-auto mb-4 h-16 w-16" style={{ color: "#C8C2B8" }} />
            <h3 className="mb-2 text-lg font-semibold" style={{ color: "#1A2535" }}>검색 결과가 없습니다.</h3>
            <p style={{ color: "#8A8FA8" }}>검색어나 카테고리 필터를 변경해보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
