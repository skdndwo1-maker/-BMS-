import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileImage,
  FileText,
  FileCode,
  Image as ImageIcon,
  Type,
  Search,
  Eye,
  FolderOpen,
  Star,
  Grid3x3,
  LayoutList,
  Package,
  Heart,
  Copy,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { GlobalBrandNav } from "@/components/GlobalBrandNav";
import { registerGlobalNavPersist } from "@/lib/globalNavPersistence";
import {
  deleteLibraryAsset,
  formatLibraryUploadError,
  getLibraryPublicUrl,
  humanFileSize,
  LIBRARY_CATEGORY_LABELS,
  type LibraryAsset,
  type LibraryCategory,
  type LibraryFilterCategory,
} from "@/lib/libraryApi";
import { useLibraryAssets } from "@/hooks/useLibraryAssets";
import { LibraryUploadDialog } from "@/components/library/LibraryUploadDialog";

type ViewMode = "grid" | "list";
type SortBy = "recent" | "popular" | "name";

const categories: Array<{
  id: LibraryFilterCategory;
  label: string;
  icon: typeof Package;
}> = [
  { id: "all", label: "All", icon: Package },
  { id: "logo", label: LIBRARY_CATEGORY_LABELS.logo, icon: FileImage },
  { id: "slogan", label: LIBRARY_CATEGORY_LABELS.slogan, icon: FileText },
  { id: "icon", label: LIBRARY_CATEGORY_LABELS.icon, icon: ImageIcon },
  { id: "pictogram", label: LIBRARY_CATEGORY_LABELS.pictogram, icon: ImageIcon },
  { id: "image", label: LIBRARY_CATEGORY_LABELS.image, icon: FileImage },
  { id: "template", label: LIBRARY_CATEGORY_LABELS.template, icon: FileCode },
  { id: "font", label: LIBRARY_CATEGORY_LABELS.font, icon: Type },
  { id: "guide", label: LIBRARY_CATEGORY_LABELS.guide, icon: FolderOpen },
];

const LIBRARY_NAV_DRAFT_KEY = "brandAxis:libraryNavDraft";

/** 카테고리별 카드 썸네일 영역 색상 */
function getThumbnailSurface(category: string): string {
  switch (category) {
    case "logo":
      return "bg-[#FF7F66]/14 text-[#FF7F66]";
    case "slogan":
      return "bg-[#F0EFEC] text-gray-700";
    case "icon":
    case "pictogram":
      return "bg-[#E8E4DF] text-gray-700";
    case "image":
      return "bg-[#FF7F66]/10 text-[#E85D4A]";
    case "template":
      return "bg-[#FAFAF8] text-gray-800 border border-[rgba(0,0,0,0.06)]";
    case "font":
      return "bg-[#EBE8E4] text-gray-800";
    case "guide":
      return "bg-[#c8d9c4]/40 text-[#2f4a38]";
    default:
      return "bg-[#EBE8E4] text-gray-600";
  }
}

function AssetThumbnail({
  asset,
  publicUrl,
  size = "card",
}: {
  asset: LibraryAsset;
  publicUrl: string | null;
  size?: "card" | "detail" | "list";
}) {
  const isImage = asset.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.fileName);
  if (isImage && publicUrl) {
    return (
      <img
        src={publicUrl}
        alt={asset.name}
        className="h-full w-full object-contain p-3"
        loading="lazy"
      />
    );
  }
  const iconSize =
    size === "detail" ? "h-24 w-24" : size === "list" ? "h-9 w-9" : "h-16 w-16";
  return <FileImage className={`relative z-10 ${iconSize} opacity-40`} />;
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white">
      <div className="aspect-[4/3] animate-pulse bg-[#F0EFEC]" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-3/5 animate-pulse rounded bg-[#F0EFEC]" />
        <div className="h-2 w-4/5 animate-pulse rounded bg-[#F4F2EE]" />
        <div className="h-2 w-2/5 animate-pulse rounded bg-[#F4F2EE]" />
      </div>
    </div>
  );
}

export function BrandLibrary() {
  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const {
    assets,
    loading,
    uploading,
    uploadProgress,
    isAdmin,
    fetchAssets,
    uploadAsset,
    incrementDownload,
    getDownloadUrl,
  } = useLibraryAssets();

  const [selectedCategory, setSelectedCategory] = useState<LibraryFilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [selectedAsset, setSelectedAsset] = useState<LibraryAsset | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDefaultCategory, setUploadDefaultCategory] = useState<LibraryCategory>("logo");
  const [uploadCategoryLocked, setUploadCategoryLocked] = useState(false);

  const openUploadDialog = useCallback((category: LibraryCategory, lockCategory = false) => {
    setUploadDefaultCategory(category);
    setUploadCategoryLocked(lockCategory);
    setUploadOpen(true);
  }, []);

  const selectedCategoryMeta = categories.find((c) => c.id === selectedCategory);
  const selectedLibraryCategory: LibraryCategory | null =
    selectedCategory === "all" ? null : selectedCategory;

  const selectedCategoryRef = useRef(selectedCategory);
  selectedCategoryRef.current = selectedCategory;
  const favoritesOnlyRef = useRef(favoritesOnly);
  favoritesOnlyRef.current = favoritesOnly;

  // debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // category 또는 debounced query 변경 시 재조회
  useEffect(() => {
    const category = selectedCategory === "all" ? undefined : selectedCategory;
    void fetchAssets({ category, query: debouncedQuery || undefined });
  }, [fetchAssets, selectedCategory, debouncedQuery]);

  // 세션 드래프트 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIBRARY_NAV_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        v?: number;
        selectedCategory?: LibraryFilterCategory;
        favoritesOnly?: boolean;
      };
      if (d.v !== 1) return;
      if (d.selectedCategory && categories.some((c) => c.id === d.selectedCategory)) {
        setSelectedCategory(d.selectedCategory);
      }
      if (typeof d.favoritesOnly === "boolean") setFavoritesOnly(d.favoritesOnly);
    } catch {
      /* ignore */
    }
  }, []);

  // 네비게이션 직전 드래프트 저장
  useEffect(() => {
    return registerGlobalNavPersist(() => {
      try {
        sessionStorage.setItem(
          LIBRARY_NAV_DRAFT_KEY,
          JSON.stringify({
            v: 1,
            selectedCategory: selectedCategoryRef.current,
            favoritesOnly: favoritesOnlyRef.current,
          }),
        );
      } catch (e) {
        console.warn("[libraryNavDraft]", e);
      }
    });
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<LibraryFilterCategory, number> = {
      all: assets.length,
      logo: 0,
      slogan: 0,
      icon: 0,
      pictogram: 0,
      image: 0,
      template: 0,
      font: 0,
      guide: 0,
    };
    for (const a of assets) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    }
    return counts;
  }, [assets]);

  const filteredAssets = assets.filter((asset) => {
    if (favoritesOnly && !asset.isFavorite) return false;
    return true;
  });

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    if (sortBy === "recent") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === "popular") return b.downloads - a.downloads;
    return a.name.localeCompare(b.name, "ko");
  });

  const publicUrlFor = (asset: LibraryAsset): string | null => {
    if (!sb) return null;
    return getLibraryPublicUrl(sb, asset.thumbnailPath || asset.filePath);
  };

  const handleDownload = async (asset: LibraryAsset) => {
    try {
      const url = await getDownloadUrl(asset.filePath);
      void incrementDownload(asset.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.fileName || asset.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`${asset.name} 다운로드를 시작했습니다.`);
    } catch (e) {
      console.error(e);
      toast.error(`다운로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDelete = async (asset: LibraryAsset) => {
    if (!sb) return;
    if (!isAdmin) {
      toast.error("관리자만 삭제할 수 있습니다.");
      return;
    }
    if (!confirm(`'${asset.name}'을(를) 삭제하시겠습니까?\nSupabase Storage 파일도 함께 삭제됩니다.`)) {
      return;
    }
    try {
      await deleteLibraryAsset(sb, { id: asset.id, filePath: asset.filePath });
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
      const category = selectedCategory === "all" ? undefined : selectedCategory;
      await fetchAssets({ category, query: debouncedQuery || undefined });
      toast.success("삭제되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleUploadSubmit = async (
    file: File,
    metadata: {
      category: LibraryCategory;
      name: string;
      description?: string;
      tags?: string[];
    },
  ) => {
    try {
      await uploadAsset(file, metadata);
      const category = selectedCategory === "all" ? undefined : selectedCategory;
      await fetchAssets({ category, query: debouncedQuery || undefined });
      toast.success(`'${metadata.name}' 업로드 완료`);
      setUploadOpen(false);
    } catch (e) {
      toast.error(formatLibraryUploadError(e, sb));
      throw e;
    }
  };

  return (
    <div className="brand-app-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-3 sm:px-6">
          <AxisBrandTitle subtitle="브랜드 라이브러리" />
        </div>
        <GlobalBrandNav className="border-0 border-t-0 bg-transparent" innerClassName="w-full px-4 sm:px-6" />
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-[rgba(0,0,0,0.06)] bg-[#ECE9E4] sm:w-72">
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="space-y-1">
              {categories.map((category) => {
                const Icon = category.icon;
                const isActive = selectedCategory === category.id;
                const count = categoryCounts[category.id] ?? 0;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex w-full items-center justify-between rounded-full px-3 py-2.5 transition-all ${
                      isActive
                        ? "bg-black font-medium text-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.25)]"
                        : "text-gray-600 hover:bg-white/70 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 opacity-90" />
                      <span className="truncate text-[13px]">{category.label}</span>
                    </div>
                    {count > 0 && (
                      <span
                        className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isActive ? "bg-white/20 text-white" : "bg-[#FF7F66]/14 text-[#c14d38]"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[rgba(0,0,0,0.06)] bg-[#E5E2DD] p-3 sm:p-4">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-3 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF7F66]/12">
                  <Package className="h-5 w-5 text-[#FF7F66]" />
                </div>
                <div>
                  <h3 className="mb-0.5 text-sm font-semibold text-gray-900">승인된 에셋만 제공</h3>
                  <p className="text-[11px] leading-relaxed text-gray-500">
                    모든 자료는 브랜드 가이드라인에 부합하며 사용 승인되었습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[#F5F3F0]">
          <div className="border-b border-[rgba(0,0,0,0.05)] bg-[#F5F3F0] px-5 py-5 sm:px-8 sm:py-6">
            <div className="brand-surface mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FF7F66]/12">
                  <FolderOpen className="h-7 w-7 text-[#FF7F66]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-gray-500">
                    {categories.find((c) => c.id === selectedCategory)?.label || "All"}
                  </p>
                  <p className="text-4xl font-bold tabular-nums tracking-tight text-black sm:text-[2.5rem]">
                    {loading ? "—" : sortedAssets.length}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {loading ? "불러오는 중…" : "표시 중인 에셋 수"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((v) => !v)}
                  className={
                    favoritesOnly
                      ? "inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-[13px] font-semibold text-white shadow-sm"
                      : "inline-flex h-9 items-center gap-2 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-[#FAFAF8]"
                  }
                >
                  <Star className={`h-4 w-4 ${favoritesOnly ? "fill-white" : ""}`} />
                  즐겨찾기만
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="에셋 검색… (이름, 설명)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="brand-library-search"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-[rgba(0,0,0,0.08)] bg-white p-1 shadow-sm">
                  {(
                    [
                      { id: "recent" as const, label: "최신" },
                      { id: "popular" as const, label: "인기" },
                      { id: "name" as const, label: "이름" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSortBy(t.id)}
                      className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                        sortBy === t.id ? "bg-black text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-full border border-[rgba(0,0,0,0.08)] bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`rounded-full p-2 ${viewMode === "grid" ? "bg-[#F0EFEC] text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
                    aria-label="그리드 보기"
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`rounded-full p-2 ${viewMode === "list" ? "bg-[#F0EFEC] text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
                    aria-label="목록 보기"
                  >
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
            {loading ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sortedAssets.map((asset) => {
                  const publicUrl = publicUrlFor(asset);
                  return (
                    <div
                      key={asset.id}
                      className="group cursor-pointer overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08),0_2px_8px_-4px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-8px_rgba(0,0,0,0.1)]"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <div
                        className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden ${getThumbnailSurface(asset.category)}`}
                      >
                        <div className="absolute inset-0 bg-black/0 transition-all group-hover:bg-black/[0.04]" />
                        <AssetThumbnail asset={asset} publicUrl={publicUrl} />
                        <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-gray-700 backdrop-blur-sm">
                          {LIBRARY_CATEGORY_LABELS[asset.category]}
                        </span>
                        {asset.isFavorite && (
                          <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                          </div>
                        )}
                        <div className="absolute bottom-3 left-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            size="sm"
                            className="h-8 flex-1 rounded-full border-0 bg-white/95 text-[12px] font-medium text-gray-900 shadow-sm hover:bg-white"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            미리보기
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 rounded-full bg-black px-3 text-white shadow-sm hover:bg-black/90"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDownload(asset);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full border-red-200/80 bg-white/95 text-red-600 hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(asset);
                              }}
                              title="삭제 (관리자)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="p-4 sm:p-5">
                        <h3 className="mb-1 line-clamp-1 text-[15px] font-semibold text-gray-900">{asset.name}</h3>
                        <p className="mb-2 line-clamp-1 text-[11px] font-medium text-gray-400">{asset.fileName}</p>
                        <p className="mb-3 line-clamp-2 text-[12px] leading-relaxed text-gray-500">{asset.description || "—"}</p>

                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {asset.formats.slice(0, 3).map((format) => (
                            <span key={format} className="brand-pill--accent !px-2 !py-0.5 !text-[10px]">
                              {format}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-gray-400">
                          <div className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            <span>{asset.downloads.toLocaleString()}</span>
                          </div>
                          <span>{humanFileSize(asset.fileSize)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="brand-surface overflow-hidden">
                <div className="hidden grid-cols-[minmax(0,1.2fr)_auto_auto_auto_auto] gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 sm:grid">
                  <span>에셋</span>
                  <span className="text-center">형식</span>
                  <span className="text-right">다운로드</span>
                  <span className="text-right">용량</span>
                  <span className="text-right">작업</span>
                </div>
                <ul className="divide-y divide-[rgba(0,0,0,0.05)]">
                  {sortedAssets.map((asset) => {
                    const publicUrl = publicUrlFor(asset);
                    return (
                      <li
                        key={asset.id}
                        className="flex cursor-pointer flex-col gap-4 p-4 transition-colors hover:bg-[#FAFAF8] sm:flex-row sm:items-center sm:gap-5 sm:px-5"
                        onClick={() => setSelectedAsset(asset)}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <div
                            className={`flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl ${getThumbnailSurface(asset.category)}`}
                          >
                            <AssetThumbnail asset={asset} publicUrl={publicUrl} size="list" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-start justify-between gap-2">
                              <h3 className="truncate font-semibold text-gray-900">{asset.name}</h3>
                              {asset.isFavorite && <Heart className="h-4 w-4 shrink-0 fill-red-500 text-red-500" />}
                            </div>
                            <p className="line-clamp-1 text-[12px] text-gray-400">{asset.fileName}</p>
                            <p className="line-clamp-1 text-[13px] text-gray-500">{asset.description || "—"}</p>
                          </div>
                        </div>
                        <div className="hidden flex-wrap items-center justify-end gap-3 sm:flex sm:w-[420px] sm:shrink-0">
                          <div className="flex min-w-[120px] flex-wrap justify-end gap-1">
                            {asset.formats.map((format) => (
                              <span key={format} className="brand-pill--accent !px-2 !py-0.5 !text-[10px]">
                                {format}
                              </span>
                            ))}
                          </div>
                          <span className="w-16 text-right text-[13px] tabular-nums text-gray-700">
                            {asset.downloads.toLocaleString()}
                          </span>
                          <span className="w-20 text-right text-[13px] tabular-nums text-gray-600">{humanFileSize(asset.fileSize)}</span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-gray-200 bg-white text-[12px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              보기
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 rounded-full bg-black px-3 text-[12px] text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDownload(asset);
                              }}
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              받기
                            </Button>
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full border-red-200 text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDelete(asset);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div
                          className="flex w-full gap-2 border-t border-[rgba(0,0,0,0.06)] pt-3 sm:hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            className="h-9 flex-1 rounded-full bg-black text-[13px] text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDownload(asset);
                            }}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            다운로드
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 rounded-full border-red-200 px-3 text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(asset);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!loading && sortedAssets.length === 0 && (
              <div className="brand-surface flex flex-col items-center justify-center py-20">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#F0EFEC]">
                  <Search className="h-10 w-10 text-gray-300" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {assets.length === 0
                    ? "아직 등록된 에셋이 없습니다"
                    : favoritesOnly
                      ? "즐겨찾기 에셋이 없습니다"
                      : "검색 결과가 없습니다"}
                </h3>
                <p className="max-w-md text-center text-[14px] text-gray-500">
                  {assets.length === 0
                    ? selectedCategory === "all"
                      ? isAdmin
                        ? "카테고리를 선택한 뒤 우하단 업로드 버튼으로 자료를 추가할 수 있습니다."
                        : "관리자가 자료를 추가하면 이곳에 표시됩니다."
                      : isAdmin
                        ? `우하단 업로드 버튼으로 ${selectedCategoryMeta?.label ?? ""} 자료를 추가할 수 있습니다.`
                        : "관리자가 자료를 추가하면 이곳에 표시됩니다."
                    : favoritesOnly
                      ? "즐겨찾기만 보기가 켜져 있습니다. 필터를 끄거나 즐겨찾기 에셋을 등록해 주세요."
                      : "다른 검색어를 시도하거나 카테고리를 변경해 보세요."}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[24px] border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_48px_-12px_rgba(0,0,0,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-5 py-4 sm:px-6">
              <h2 className="truncate pr-4 text-lg font-bold text-gray-900">{selectedAsset.name}</h2>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white hover:text-gray-900"
                aria-label="닫기"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            <div className="grid max-h-[calc(90vh-88px)] grid-cols-1 gap-6 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
              <div>
                <div
                  className={`mb-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[20px] ${getThumbnailSurface(selectedAsset.category)}`}
                >
                  <AssetThumbnail asset={selectedAsset} publicUrl={publicUrlFor(selectedAsset)} size="detail" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="brand-btn-primary flex-1 min-w-[140px]" onClick={() => void handleDownload(selectedAsset)}>
                    <Download className="mr-2 h-4 w-4" />
                    다운로드
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full border-gray-200"
                    title="파일 경로 복사"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedAsset.filePath).then(
                        () => toast.success("경로를 복사했습니다."),
                        () => toast.error("클립보드 복사 실패"),
                      );
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="rounded-full border-gray-200">
                    <Heart className={`h-4 w-4 ${selectedAsset.isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="rounded-full border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => void handleDelete(selectedAsset)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">파일명</label>
                    <p className="text-[13px] font-medium text-gray-800">{selectedAsset.fileName}</p>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">설명</label>
                    <p className="text-[14px] leading-relaxed text-gray-600">{selectedAsset.description || "—"}</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">포함 형식</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.formats.map((format) => (
                        <span
                          key={format}
                          className="rounded-lg bg-[#F0EFEC] px-3 py-1.5 text-[13px] font-medium text-gray-800"
                        >
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">파일 크기</label>
                      <p className="text-[15px] font-semibold text-black">{humanFileSize(selectedAsset.fileSize)}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">다운로드</label>
                      <p className="text-[15px] font-semibold text-black">{selectedAsset.downloads.toLocaleString()}회</p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">등록일</label>
                    <p className="text-[14px] font-medium text-gray-800">
                      {new Date(selectedAsset.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  {selectedAsset.tags.length > 0 && (
                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">태그</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedAsset.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[#FF7F66]/12 px-3 py-1 text-[12px] font-medium text-[#c14d38]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[rgba(0,0,0,0.06)] pt-4">
                    <div className="flex items-start gap-3 rounded-[14px] border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] p-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF7F66]/12">
                        <span className="text-[12px] font-bold text-[#FF7F66]">i</span>
                      </div>
                      <div>
                        <h4 className="mb-1 text-[13px] font-semibold text-gray-900">사용 가이드</h4>
                        <p className="text-[12px] leading-relaxed text-gray-600">
                          이 에셋은 브랜드 가이드라인에 따라 승인되었습니다. 상업적 용도로 자유롭게 사용할 수 있습니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLibraryCategory && (
        <button
          type="button"
          onClick={() => openUploadDialog(selectedLibraryCategory, true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2 rounded-full bg-[#FF7F66] px-5 text-white shadow-[0_8px_28px_-6px_rgba(255,127,102,0.65)] transition-all hover:scale-[1.03] hover:bg-[#e86f58] active:scale-[0.98] sm:bottom-8 sm:right-8"
          title={`${selectedCategoryMeta?.label} 업로드`}
          aria-label={`${selectedCategoryMeta?.label} 업로드`}
        >
          <Upload className="h-5 w-5 shrink-0" />
          <span className="text-[14px] font-semibold">업로드</span>
        </button>
      )}

      <LibraryUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        uploading={uploading}
        uploadProgress={uploadProgress}
        defaultCategory={uploadDefaultCategory}
        lockCategory={uploadCategoryLocked}
        onSubmit={handleUploadSubmit}
      />
    </div>
  );
}
