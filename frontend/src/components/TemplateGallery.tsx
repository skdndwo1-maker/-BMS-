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
  "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43182]/40";
const categoryTabIdle = "border-gray-200 bg-white text-gray-700 hover:border-gray-300";
const categoryTabActive = "border-[#F43182] bg-[#F43182]/10 text-[#F43182]";

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
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => navigate("/options")}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                옵션으로
              </Button>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0">
                  <img src="/uplus-main-logo.png" alt="U+ AI 브랜드 Agent" className="h-full w-full object-contain" />
                </div>
                <div className="flex h-10 flex-col justify-between py-px">
                  <h1 className="text-xl font-semibold leading-none text-gray-900">U+ AI 브랜드 Agent</h1>
                  <p className="text-xs leading-none text-gray-500">브랜드 그래픽 제작 · Brand Design Create</p>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" type="button" onClick={() => navigate("/dashboard")}>
              내 디자인
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 rounded-[12px] border border-gray-200 bg-white px-[32px] pb-6 pt-[21px]">
          <div className="mb-[16px] flex min-w-0 items-center gap-[8px]">
            <Layers className="h-[26px] w-[26px] shrink-0 text-[#F43182]" />
            <h2 className="text-[19.5px] font-semibold text-gray-900">카테고리 선택</h2>
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              placeholder="템플릿 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-4">
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
                className={`group cursor-pointer overflow-hidden rounded-lg border bg-white transition-all hover:shadow-lg ${
                  isPlacard ? "border-gray-200 hover:border-[#F43182]/40" : "border-gray-200"
                }`}
                onClick={() => handleSelectTemplate(template.id)}
              >
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 opacity-0 transition-opacity group-hover:opacity-100" />
                  {template.id === "placard-wide-landscape" ? (
                    <div className="z-10 flex h-full w-full items-center justify-center p-3">
                      <div
                        className="flex w-full overflow-hidden rounded-sm border border-gray-300 bg-white shadow-sm"
                        style={{ height: "52px" }}
                      >
                        <div className="flex w-[24%] shrink-0 items-center justify-center border-r border-gray-200 px-2">
                          <div className="flex items-center gap-1">
                            <div className="h-3 w-3 shrink-0 rounded-full bg-[#E30613]" />
                            <span style={{ fontSize: "6px", fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>
                              LG U+
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col justify-center gap-0.5 px-3">
                          <div className="flex flex-wrap items-baseline gap-1">
                            <span style={{ fontSize: "7px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1.1 }}>메인 타이틀</span>
                            <span style={{ fontSize: "7px", fontWeight: 800, color: "#F43182", lineHeight: 1.1 }}>강조 텍스트</span>
                          </div>
                          <span style={{ fontSize: "5px", color: "#777", lineHeight: 1 }}>서브 타이틀</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="z-10 text-center">
                      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-white shadow-sm">
                        {isPlacard ? (
                          <RectangleHorizontal className="h-8 w-8 text-gray-400" />
                        ) : (
                          <LayoutTemplate className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                      <div className="text-xs font-medium text-gray-500">{template.size.name}</div>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="mb-1 font-medium text-gray-900">{template.name}</h3>
                  <p className="mb-3 text-sm text-gray-500">{template.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {template.size.width} × {template.size.height} {template.size.unit}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className={`opacity-0 transition-opacity group-hover:opacity-100 ${
                        isPlacard ? "text-[#F43182] hover:bg-[#F43182]/10 hover:text-[#F43182]" : ""
                      }`}
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
            <FileImage className="mx-auto mb-4 h-16 w-16 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">검색 결과가 없습니다.</h3>
            <p className="text-gray-500">검색어나 카테고리 필터를 변경해보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
