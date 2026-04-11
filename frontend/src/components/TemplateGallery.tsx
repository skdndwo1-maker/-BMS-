import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Monitor,
  Printer,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileImage,
  RectangleHorizontal,
  LayoutTemplate,
  Share2,
  Bell,
  Signpost,
  Presentation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { templates as designTemplates, templateCategories } from "@/design/templates";

type MediaType = "online" | "offline" | null;

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutTemplate,
  FileImage,
  Share2,
  Bell,
  Signpost,
  Presentation,
  RectangleHorizontal,
};

export function TemplateGallery() {
  const [selectedCategory, setSelectedCategory] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const navigate = useNavigate();

  const filteredTemplates = designTemplates.filter((template) => {
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMediaType = !mediaType || template.mediaType === mediaType;
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

  if (mediaType === null) {
    return (
      <div className="min-h-screen bg-[#FAFAFA]">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate("/options")}
                className="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm">홈으로</span>
              </button>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0">
                  <img src="/uplus-main-logo.png" alt="U+ Layer" className="h-full w-full object-contain" />
                </div>
                <div className="flex h-10 flex-col justify-between py-px">
                  <h1 className="text-xl font-semibold leading-none text-gray-900">U+ Layer</h1>
                  <p className="mt-1 text-xs leading-none text-gray-500">브랜드 디자인 제작 Brand Design Create</p>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" type="button" onClick={() => navigate("/dashboard")}>
              내 디자인
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#F43182]/20 bg-[#F43182]/10 px-4 py-2">
              <Sparkles className="h-4 w-4 text-[#F43182]" />
              <span className="text-sm font-medium text-[#F43182]">디자인 제작 시작하기</span>
            </div>
            <h2 className="mb-3 text-3xl font-bold text-gray-900">어떤 제작물의 디자인을 제작하시나요?</h2>
            <p className="text-lg text-gray-500">온라인과 오프라인 제작물에 최적화된 템플릿을 제공합니다</p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setMediaType("online")}
              className="group relative rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-gray-100 via-gray-50 to-white p-8 text-left transition-all hover:border-[#F43182] hover:shadow-xl"
            >
              <div className="absolute inset-0 rounded-2xl bg-[#F43182]/0 transition-all group-hover:bg-[#F43182]/5" />
              <div className="relative">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                  <Monitor className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="mb-3 text-2xl font-bold text-gray-900">온라인 제작물</h3>
                <p className="mb-6 leading-relaxed text-gray-600">
                  SNS 포스트, 웹 배너, 디지털 광고 등 디지털 환경에서 사용되는 디자인을 제작합니다.
                </p>
                <div className="mb-6 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>
                      <strong>단위</strong> 픽셀(px)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>
                      <strong>해상도</strong> 72 PPI (화면 최적화)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>
                      <strong>색상 모드</strong> RGB
                    </span>
                  </div>
                </div>
                <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-2 text-xs font-medium text-gray-700">포함 템플릿 예시</p>
                  <div className="flex flex-wrap gap-2">
                    {["Instagram", "Facebook", "YouTube", "웹 배너"].map((t) => (
                      <span
                        key={t}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-semibold text-blue-600 transition-colors group-hover:text-[#F43182]">
                  온라인 템플릿 보기
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMediaType("offline")}
              className="group relative rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-gray-100 via-gray-50 to-white p-8 text-left transition-all hover:border-[#F43182] hover:shadow-xl"
            >
              <div className="absolute inset-0 rounded-2xl bg-[#F43182]/0 transition-all group-hover:bg-[#F43182]/5" />
              <div className="relative">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
                  <Printer className="h-8 w-8 text-orange-600" />
                </div>
                <h3 className="mb-3 text-2xl font-bold text-gray-900">오프라인 제작물</h3>
                <p className="mb-6 leading-relaxed text-gray-600">
                  포스터, 현수막, 명함, 브로슈어 등 인쇄물로 출력되는 디자인을 제작합니다.
                </p>
                <div className="mb-6 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>
                      <strong>단위</strong> 밀리미터(mm)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>
                      <strong>해상도</strong> 300 DPI (인쇄 품질)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>
                      <strong>색상 모드</strong> CMYK
                    </span>
                  </div>
                </div>
                <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-2 text-xs font-medium text-gray-700">포함 템플릿 예시</p>
                  <div className="flex flex-wrap gap-2">
                    {["A4 포스터", "명함", "현수막", "전단지"].map((t) => (
                      <span
                        key={t}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-semibold text-orange-600 transition-colors group-hover:text-[#F43182]">
                  오프라인 템플릿 보기
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" type="button" onClick={() => setMediaType(null)} className="text-gray-600 hover:text-gray-900">
                <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                뒤로가기
              </Button>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0">
                  <img src="/uplus-main-logo.png" alt="U+ Layer" className="h-full w-full object-contain" />
                </div>
                <div className="flex h-10 flex-col justify-between py-px">
                  <h1 className="text-xl font-semibold leading-none text-gray-900">U+ Layer</h1>
                  <p className="text-xs leading-none text-gray-500">
                    {mediaType === "online" ? "온라인 제작물 템플릿" : "오프라인 제작물 템플릿"}
                  </p>
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

        <div className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              type="button"
              variant={selectedCategory === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("all")}
              className={selectedCategory === "all" ? "bg-[#F43182] hover:bg-[#d41f6e] text-white" : ""}
            >
              전체
            </Button>
            {availableCategories.map((category) => {
              const Icon = categoryIconMap[category.icon] ?? LayoutTemplate;
              const active = selectedCategory === category.id;
              return (
                <Button
                  key={category.id}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className={`whitespace-nowrap ${active ? "bg-[#F43182] hover:bg-[#d41f6e] text-white" : ""}`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {category.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
