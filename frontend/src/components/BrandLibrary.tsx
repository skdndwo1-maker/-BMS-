import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  FileImage,
  FileText,
  FileCode,
  Image as ImageIcon,
  Type,
  Search,
  ArrowLeft,
  Eye,
  FolderOpen,
  Star,
  Grid3x3,
  LayoutList,
  Package,
  Heart,
  Copy,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  deleteLibraryAsset,
  extractExtensionLabel,
  getLibraryDownloadUrl,
  humanFileSize,
  incrementLibraryDownload,
  isCurrentUserAdmin,
  listLibraryAssets,
  type LibraryAssetRow,
  type LibraryCategory,
  type LibraryFilterCategory,
} from "@/lib/libraryApi";

type ViewMode = "grid" | "list";
type SortBy = "recent" | "popular" | "name";

type Asset = {
  id: string;
  name: string;
  category: LibraryCategory;
  description: string;
  tags: string[];
  formats: string[];
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloads: number;
  uploadDate: string;
  favorite: boolean;
};

const categories: Array<{
  id: LibraryFilterCategory;
  label: string;
  icon: typeof Package;
}> = [
  { id: "all", label: "전체 에셋", icon: Package },
  { id: "logo", label: "BI/CI 로고", icon: FileImage },
  { id: "slogan", label: "Slogan", icon: FileText },
  { id: "icon", label: "아이콘", icon: ImageIcon },
  { id: "pictogram", label: "픽토그램", icon: ImageIcon },
  { id: "image", label: "포토 라이브러리", icon: FileImage },
  { id: "template", label: "템플릿 파일", icon: FileCode },
  { id: "font", label: "폰트", icon: Type },
  { id: "guide", label: "가이드라인", icon: FolderOpen },
];

function rowToAsset(row: LibraryAssetRow): Asset {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const formatsRaw = Array.isArray(row.formats) ? row.formats : [];
  const formats = formatsRaw.length
    ? formatsRaw.map((f) => f.toUpperCase())
    : [extractExtensionLabel(row.file_path, row.mime_type)];
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? "",
    tags,
    formats,
    filePath: row.file_path,
    fileName: row.file_name || row.file_path.split("/").pop() || row.name,
    fileSize: row.file_size ?? 0,
    mimeType: row.mime_type ?? "",
    downloads: row.downloads ?? 0,
    uploadDate: row.created_at,
    favorite: Boolean(row.is_favorite),
  };
}

export function BrandLibrary() {
  const navigate = useNavigate();
  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<LibraryFilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const reload = async () => {
    if (!sb) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listLibraryAssets(sb);
      setAssets(rows.map(rowToAsset));
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "라이브러리 로딩 실패";
      toast.error(msg);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    if (sb) void isCurrentUserAdmin(sb).then(setIsAdmin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

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
    const matchesCategory = selectedCategory === "all" || asset.category === selectedCategory;
    const matchesFavorite = !favoritesOnly || asset.favorite;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      asset.name.toLowerCase().includes(q) ||
      asset.description.toLowerCase().includes(q) ||
      asset.tags.some((tag) => tag.toLowerCase().includes(q));
    return matchesCategory && matchesFavorite && matchesSearch;
  });

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    if (sortBy === "recent") return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
    if (sortBy === "popular") return b.downloads - a.downloads;
    return a.name.localeCompare(b.name, "ko");
  });

  const getThumbnailColor = (category: string) => {
    switch (category) {
      case "logo":
        return "from-[#F43182] to-[#C41F65]";
      case "icon":
        return "from-blue-500 to-indigo-600";
      case "pictogram":
        return "from-green-500 to-emerald-600";
      case "image":
        return "from-purple-500 to-pink-600";
      case "template":
        return "from-orange-500 to-red-600";
      case "font":
        return "from-green-500 to-emerald-600";
      case "guide":
        return "from-gray-500 to-gray-700";
      default:
        return "from-gray-400 to-gray-600";
    }
  };

  const handleDownload = async (asset: Asset) => {
    if (!sb) {
      toast.error("Supabase 설정이 필요합니다.");
      return;
    }
    try {
      const url = await getLibraryDownloadUrl(sb, asset.filePath, 3600);
      void incrementLibraryDownload(sb, asset.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.fileName || asset.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setAssets((prev) =>
        prev.map((x) => (x.id === asset.id ? { ...x, downloads: x.downloads + 1 } : x))
      );
      toast.success(`${asset.name} 다운로드를 시작했습니다.`);
    } catch (e) {
      console.error(e);
      toast.error(`다운로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDelete = async (asset: Asset) => {
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
      setAssets((prev) => prev.filter((x) => x.id !== asset.id));
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
      toast.success("삭제되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex">
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => navigate("/options")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">홈으로</span>
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 shrink-0">
              <img src="/uplus-main-logo.png" alt="U+ Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-xl">U+ Layer</h1>
              <p className="text-xs text-gray-500">브랜드 라이브러리 Brand Library</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                    isActive ? "bg-[#F43182] text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{category.label}</span>
                  </div>
                  {count > 0 && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg">
            <div className="w-8 h-8 bg-[#F43182]/10 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-[#F43182]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">승인된 에셋만 제공</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                모든 자료는 브랜드 가이드라인에 부합하며 사용 승인되었습니다.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {categories.find((c) => c.id === selectedCategory)?.label || "전체 에셋"}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {loading ? "불러오는 중..." : `${sortedAssets.length}개의 에셋을 찾았습니다`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={favoritesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                <Star className="w-4 h-4 mr-2" />
                즐겨찾기만
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="에셋 검색... (이름, 태그, 설명)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <option value="recent">최근 등록순</option>
                <option value="popular">인기순</option>
                <option value="name">이름순</option>
              </select>

              <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded ${viewMode === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded ${viewMode === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              <span className="text-sm">에셋을 불러오는 중...</span>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <div
                    className={`aspect-[4/3] bg-gradient-to-br ${getThumbnailColor(asset.category)} flex items-center justify-center relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all" />
                    <div className="relative z-10 text-white">
                      <FileImage className="w-16 h-16 opacity-50" />
                    </div>
                    {asset.favorite && (
                      <div className="absolute top-3 right-3 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center">
                        <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" className="flex-1 bg-white text-gray-900 hover:bg-gray-100">
                        <Eye className="w-3 h-3 mr-1" />
                        미리보기
                      </Button>
                      <Button
                        size="sm"
                        className="bg-gray-800 text-white hover:bg-gray-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownload(asset);
                        }}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white/90 text-red-600 hover:bg-white border-red-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(asset);
                          }}
                          title="삭제 (관리자)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">{asset.name}</h3>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{asset.description || "—"}</p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {asset.formats.slice(0, 3).map((format) => (
                        <span key={format} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {format}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        <span>{asset.downloads.toLocaleString()}</span>
                      </div>
                      <span>{humanFileSize(asset.fileSize)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer flex items-center gap-4"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <div className={`w-20 h-20 rounded-lg bg-gradient-to-br ${getThumbnailColor(asset.category)} flex items-center justify-center shrink-0`}>
                    <FileImage className="w-8 h-8 text-white opacity-50" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-medium text-gray-900">{asset.name}</h3>
                      {asset.favorite && <Heart className="w-4 h-4 text-red-500 fill-red-500 shrink-0" />}
                    </div>
                    <p className="text-sm text-gray-500 mb-2 line-clamp-1">{asset.description || "—"}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        <span>{asset.downloads.toLocaleString()}회</span>
                      </div>
                      <span>{humanFileSize(asset.fileSize)}</span>
                      <div className="flex gap-1">
                        {asset.formats.map((format) => (
                          <span key={format} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {format}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      미리보기
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gray-800 text-white hover:bg-gray-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownload(asset);
                      }}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      다운로드
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(asset);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && sortedAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {assets.length === 0 ? "아직 등록된 에셋이 없습니다" : "검색 결과가 없습니다"}
              </h3>
              <p className="text-gray-500 text-center max-w-md">
                {assets.length === 0
                  ? "관리자가 Supabase Storage에 자료를 업로드하면 이곳에 표시됩니다."
                  : "다른 검색어를 시도하거나 카테고리를 변경해보세요."}
              </p>
            </div>
          )}
        </div>
      </main>

      {selectedAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setSelectedAsset(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">{selectedAsset.name}</h2>
              <button type="button" onClick={() => setSelectedAsset(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                <span className="text-gray-400 text-2xl leading-none">&times;</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div>
                <div className={`aspect-[4/3] bg-gradient-to-br ${getThumbnailColor(selectedAsset.category)} rounded-xl flex items-center justify-center mb-4`}>
                  <FileImage className="w-24 h-24 text-white opacity-30" />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-[#F43182] text-white hover:bg-[#d41f6e]"
                    onClick={() => void handleDownload(selectedAsset)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    다운로드
                  </Button>
                  <Button variant="outline" title="파일 경로 복사" onClick={() => {
                    navigator.clipboard.writeText(selectedAsset.filePath).then(
                      () => toast.success("경로를 복사했습니다."),
                      () => toast.error("클립보드 복사 실패")
                    );
                  }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="outline">
                    <Heart className={`w-4 h-4 ${selectedAsset.favorite ? "text-red-500 fill-red-500" : ""}`} />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => void handleDelete(selectedAsset)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">설명</label>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedAsset.description || "—"}</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">포함 형식</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.formats.map((format) => (
                        <span key={format} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">파일 크기</label>
                      <p className="text-sm text-gray-900 font-medium">{humanFileSize(selectedAsset.fileSize)}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">다운로드</label>
                      <p className="text-sm text-gray-900 font-medium">{selectedAsset.downloads.toLocaleString()}회</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">등록일</label>
                    <p className="text-sm text-gray-900 font-medium">
                      {new Date(selectedAsset.uploadDate).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  {selectedAsset.tags.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">태그</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedAsset.tags.map((tag) => (
                          <span key={tag} className="bg-[#F43182]/10 text-[#F43182] px-3 py-1 rounded-full text-xs font-medium">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-white text-xs">ℹ</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-blue-900 mb-1">사용 가이드</h4>
                        <p className="text-xs text-blue-700 leading-relaxed">
                          이 에셋은 LG U+ 브랜드 가이드라인에 따라 승인되었습니다. 상업적 용도로 자유롭게 사용 가능합니다.
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
    </div>
  );
}
