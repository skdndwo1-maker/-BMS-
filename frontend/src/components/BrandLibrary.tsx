import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabaseClient";

type AssetCategory =
  | "all"
  | "logo"
  | "slogan"
  | "icon"
  | "pictogram"
  | "image"
  | "template"
  | "font"
  | "guide";
type ViewMode = "grid" | "list";
type SortBy = "recent" | "popular" | "name";

interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  type: string;
  size: string;
  thumbnail: string;
  downloads: number;
  uploadDate: string;
  description: string;
  tags: string[];
  format: string[];
  favorite?: boolean;

  // storage
  bucket?: string;
  path?: string;
  previewPath?: string | null;
  mimeType?: string | null;
}

const categories = [
  { id: "all" as AssetCategory, label: "전체 에셋", icon: Package, count: 127 },
  { id: "logo" as AssetCategory, label: "BI/CI 로고", icon: FileImage, count: 24 },
  { id: "slogan" as AssetCategory, label: "Slogan", icon: FileText, count: 10 },
  { id: "icon" as AssetCategory, label: "아이콘", icon: ImageIcon, count: 48 },
  { id: "pictogram" as AssetCategory, label: "픽토그램", icon: ImageIcon, count: 20 },
  { id: "image" as AssetCategory, label: "포토 라이브러리", icon: FileImage, count: 35 },
  { id: "template" as AssetCategory, label: "템플릿 파일", icon: FileCode, count: 12 },
  { id: "font" as AssetCategory, label: "폰트", icon: Type, count: 6 },
  { id: "guide" as AssetCategory, label: "가이드라인", icon: FolderOpen, count: 4 },
];

function bytesToSize(bytes: number | null | undefined): string {
  const b = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (b <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"] as const;
  let n = b;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

type BrandAssetRow = {
  id: string;
  created_at: string;
  category: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  bucket: string;
  path: string;
  preview_path: string | null;
  mime_type: string | null;
  ext: string | null;
  size_bytes: number | null;
  downloads: number;
};

export function BrandLibrary() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [rows, setRows] = useState<BrandAssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<Exclude<AssetCategory, "all">>("logo");
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadPreviewFile, setUploadPreviewFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sb) return;
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch("/api/admin/me", { headers: { Authorization: `Bearer ${token}` } });
        const out = (await r.json().catch(() => ({}))) as { isAdmin?: boolean };
        if (!cancelled) setIsAdmin(Boolean(out?.isAdmin));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sb]);

  const load = useMemo(() => {
    return async () => {
      if (!sb) {
        setError("Supabase 설정이 필요합니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await sb
          .from("brand_assets")
          .select("id, created_at, category, name, description, tags, bucket, path, preview_path, mime_type, ext, size_bytes, downloads")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setRows((data ?? []) as BrandAssetRow[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const assets: Asset[] = useMemo(() => {
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: (r.category as AssetCategory) || "image",
      type: r.category,
      size: bytesToSize(r.size_bytes),
      thumbnail: r.preview_path || r.path,
      downloads: Number(r.downloads ?? 0),
      uploadDate: r.created_at,
      description: r.description ?? "",
      tags: r.tags ?? [],
      format: [String(r.ext ?? "").toUpperCase()].filter(Boolean),
      bucket: r.bucket,
      path: r.path,
      previewPath: r.preview_path,
      mimeType: r.mime_type,
    }));
  }, [rows]);

  const filteredAssets = assets.filter((asset) => {
    const matchesCategory = selectedCategory === "all" || asset.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      asset.name.toLowerCase().includes(q) ||
      asset.description.toLowerCase().includes(q) ||
      asset.tags.some((tag) => tag.toLowerCase().includes(q));
    return matchesCategory && matchesSearch;
  });

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    if (sortBy === "recent") return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
    if (sortBy === "popular") return b.downloads - a.downloads;
    return a.name.localeCompare(b.name, "ko");
  });

  const getSignedUrl = async (asset: Asset, kind: "preview" | "original"): Promise<string> => {
    if (!sb) throw new Error("supabase_not_configured");
    const path = kind === "preview" ? (asset.previewPath || asset.path) : asset.path;
    if (!path) throw new Error("asset_path_missing");
    const bucket = asset.bucket || "brand-library";
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 30);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("signed_url_missing");
    return data.signedUrl;
  };

  const downloadAsset = async (asset: Asset) => {
    try {
      const url = await getSignedUrl(asset, "original");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const previewAsset = async (asset: Asset) => {
    try {
      const url = await getSignedUrl(asset, "preview");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const doUpload = async (file: File) => {
    if (!sb) throw new Error("supabase_not_configured");
    setUploadBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectPath = `${uploadCategory}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;

      const up = await sb.storage.from("brand-library").upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (up.error) throw up.error;

      let previewPath: string | null = null;
      if (uploadPreviewFile) {
        const pSafe = uploadPreviewFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        previewPath = `${uploadCategory}/preview_${Date.now()}_${crypto.randomUUID()}_${pSafe}`;
        const pu = await sb.storage.from("brand-library").upload(previewPath, uploadPreviewFile, {
          upsert: false,
          contentType: uploadPreviewFile.type || undefined,
        });
        if (pu.error) throw pu.error;
      }

      const tags = uploadTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const ins = await sb.from("brand_assets").insert({
        category: uploadCategory,
        name: (uploadName || file.name).trim(),
        description: uploadDesc.trim() || null,
        tags,
        bucket: "brand-library",
        path: objectPath,
        original_filename: file.name,
        mime_type: file.type || null,
        ext: ext || null,
        size_bytes: file.size || null,
        preview_path: previewPath,
      });
      if (ins.error) throw ins.error;

      setUploadOpen(false);
      setUploadName("");
      setUploadDesc("");
      setUploadTags("");
      setUploadPreviewFile(null);
      if (uploadFileRef.current) uploadFileRef.current.value = "";
      await load();
    } finally {
      setUploadBusy(false);
    }
  };

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
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}
                  >
                    {category.count}
                  </span>
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
              <p className="text-sm text-gray-500 mt-0.5">{sortedAssets.length}개의 에셋을 찾았습니다</p>
              {loading ? <p className="text-xs text-gray-400 mt-1">불러오는 중…</p> : null}
              {error ? <p className="text-xs text-red-500 mt-1">{error}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                전체 다운로드
              </Button>
              <Button variant="outline" size="sm">
                <Star className="w-4 h-4 mr-2" />
                즐겨찾기만
              </Button>
              {isAdmin ? (
                <Button size="sm" className="bg-[#F43182] text-white hover:bg-[#d41f6e]" onClick={() => setUploadOpen(true)}>
                  업로드
                </Button>
              ) : null}
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
          {viewMode === "grid" ? (
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
                      <Button
                        size="sm"
                        className="flex-1 bg-white text-gray-900 hover:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          void previewAsset(asset);
                        }}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        미리보기
                      </Button>
                      <Button
                        size="sm"
                        className="bg-gray-800 text-white hover:bg-gray-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadAsset(asset);
                        }}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">{asset.name}</h3>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{asset.description}</p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {asset.format.slice(0, 3).map((format) => (
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
                      <span>{asset.size}</span>
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
                    <p className="text-sm text-gray-500 mb-2 line-clamp-1">{asset.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        <span>{asset.downloads.toLocaleString()}회</span>
                      </div>
                      <span>{asset.size}</span>
                      <div className="flex gap-1">
                        {asset.format.map((format) => (
                          <span key={format} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {format}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void previewAsset(asset);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      미리보기
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gray-800 text-white hover:bg-gray-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        void downloadAsset(asset);
                      }}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      다운로드
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sortedAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">검색 결과가 없습니다</h3>
              <p className="text-gray-500 text-center max-w-md">다른 검색어를 시도하거나 카테고리를 변경해보세요.</p>
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
                    onClick={() => void downloadAsset(selectedAsset)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    다운로드
                  </Button>
                  <Button variant="outline">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="outline">
                    <Heart className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">설명</label>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedAsset.description}</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">포함 형식</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.format.map((format) => (
                        <span key={format} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">파일 크기</label>
                      <p className="text-sm text-gray-900 font-medium">{selectedAsset.size}</p>
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

      {uploadOpen ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => (uploadBusy ? null : setUploadOpen(false))}>
          <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">에셋 업로드 (관리자)</h2>
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => setUploadOpen(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${uploadBusy ? "opacity-40" : "hover:bg-gray-100"}`}
              >
                <span className="text-gray-400 text-2xl leading-none">&times;</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">카테고리</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
                    disabled={uploadBusy}
                  >
                    <option value="logo">logo</option>
                    <option value="slogan">slogan</option>
                    <option value="icon">icon</option>
                    <option value="pictogram">pictogram</option>
                    <option value="image">image</option>
                    <option value="template">template</option>
                    <option value="font">font</option>
                    <option value="guide">guide</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">표시명 (선택)</label>
                  <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="비워두면 파일명" disabled={uploadBusy} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">설명 (선택)</label>
                <Input value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="설명" disabled={uploadBusy} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">태그 (선택)</label>
                <Input value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="쉼표로 구분 (예: 로고,BI,공식)" disabled={uploadBusy} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">파일</label>
                <input
                  ref={uploadFileRef}
                  type="file"
                  disabled={uploadBusy}
                  className="block w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (!f) return;
                    void doUpload(f).catch((err) => alert(err instanceof Error ? err.message : String(err)));
                  }}
                />
                <p className="text-[11px] text-gray-400 mt-1">삭제는 정책상 불가합니다. 업로드 후 메타DB에 자동 등록됩니다.</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">미리보기 PNG/SVG (선택)</label>
                <input
                  type="file"
                  accept="image/png,image/svg+xml"
                  disabled={uploadBusy}
                  className="block w-full text-sm"
                  onChange={(e) => setUploadPreviewFile(e.target.files?.[0] || null)}
                />
                <p className="text-[11px] text-gray-400 mt-1">원본이 AI/TTF/PDF 등인 경우 캔버스에서 쓸 PNG/SVG 미리보기를 따로 넣을 수 있어요.</p>
              </div>

              {uploadBusy ? <p className="text-xs text-gray-500">업로드 중…</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

