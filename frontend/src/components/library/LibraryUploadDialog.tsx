import { useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, Loader2, FileIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  humanFileSize,
  type LibraryCategory,
  type UploadLibraryAssetMetadata,
} from "@/lib/libraryApi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploading: boolean;
  uploadProgress: number;
  defaultCategory?: LibraryCategory;
  /** 카테고리 페이지에서 연 경우 카테고리 선택 잠금 */
  lockCategory?: boolean;
  onSubmit: (file: File, metadata: UploadLibraryAssetMetadata) => Promise<void>;
};

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function LibraryUploadDialog({
  open,
  onOpenChange,
  uploading,
  uploadProgress,
  defaultCategory,
  lockCategory = false,
  onSubmit,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<LibraryCategory>(defaultCategory ?? "logo");
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [tagsRaw, setTagsRaw] = useState<string>("");

  useEffect(() => {
    if (open) {
      setCategory(defaultCategory ?? "logo");
    } else {
      setFile(null);
      setName("");
      setDescription("");
      setTagsRaw("");
    }
  }, [open, defaultCategory]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    onDrop: (accepted) => {
      const first = accepted[0];
      if (!first) return;
      setFile(first);
      if (!name.trim()) setName(stripExt(first.name));
    },
  });

  const tags = useMemo<string[]>(() => {
    return tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }, [tagsRaw]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!file) {
      toast.error("업로드할 파일을 선택해 주세요.");
      return;
    }
    if (!name.trim()) {
      toast.error("에셋 이름을 입력해 주세요.");
      return;
    }
    try {
      await onSubmit(file, {
        category,
        name: name.trim(),
        description: description.trim(),
        tags,
      });
    } catch {
      /* parent handles toast */
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="presentation"
        className="absolute inset-0"
        onClick={() => {
          if (!uploading) onOpenChange(false);
        }}
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-[#FAFAF8] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF7F66]/12">
              <Upload className="h-4 w-4 text-[#FF7F66]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">에셋 업로드</h2>
              <p className="text-[11px] text-gray-500">brand-library 버킷에 저장되며, 모든 사용자에게 즉시 노출됩니다.</p>
            </div>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-700">파일</label>
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                isDragActive
                  ? "border-[#FF7F66] bg-[#FF7F66]/5"
                  : file
                  ? "border-gray-200 bg-[#FAFAF8]"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-[#FAFAF8]"
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex w-full items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF7F66]/12">
                    <FileIcon className="h-5 w-5 text-[#FF7F66]" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[13px] font-medium text-gray-900">{file.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {humanFileSize(file.size)} · {file.type || "unknown/type"}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <p className="text-[13px] text-gray-600">
                    파일을 끌어다 놓거나 <span className="font-semibold text-[#FF7F66]">클릭해서 선택</span>
                  </p>
                  <p className="text-[11px] text-gray-400">PNG · JPEG · SVG · PDF · AI · PSD · TTF · ZIP 등 모든 형식</p>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-gray-700">카테고리</label>
              {lockCategory ? (
                <div className="flex h-10 items-center rounded-lg border border-[#FF7F66]/30 bg-[#FF7F66]/8 px-3 text-[13px] font-semibold text-[#c14d38]">
                  {LIBRARY_CATEGORY_LABELS[category]}
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as LibraryCategory)}
                  disabled={uploading}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 focus:border-[#FF7F66] focus:outline-none focus:ring-1 focus:ring-[#FF7F66]/40 disabled:opacity-50"
                >
                  {LIBRARY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {LIBRARY_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-gray-700">에셋 이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={uploading}
                placeholder="예: U+ BI 가로형"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-[#FF7F66] focus:outline-none focus:ring-1 focus:ring-[#FF7F66]/40 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-700">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
              rows={2}
              placeholder="용도·버전·사이즈 등 간단히 적어 주세요."
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-[#FF7F66] focus:outline-none focus:ring-1 focus:ring-[#FF7F66]/40 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-700">태그 (쉼표 구분)</label>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              disabled={uploading}
              placeholder="예: 포스터, 인쇄, A2"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-[#FF7F66] focus:outline-none focus:ring-1 focus:ring-[#FF7F66]/40 disabled:opacity-50"
            />
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[#FF7F66]/12 px-2.5 py-0.5 text-[11px] font-medium text-[#c14d38]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {uploading && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-gray-500">
                <span>업로드 중…</span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-[#FF7F66] transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-[#FAFAF8] px-5 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
            className="rounded-full border-gray-200"
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={uploading || !file || !name.trim()}
            onClick={() => void handleSubmit()}
            className="brand-btn-primary rounded-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                업로드 중…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                업로드
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
