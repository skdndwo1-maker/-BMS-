import type { AssetLayer, DesignContent } from "@/design/types";

const MEDIA_FILE_KEYS = ["image", "logo", "ciImage", "biImage", "sloganImage", "partnerLogo"] as const;

type MediaFileKey = (typeof MEDIA_FILE_KEYS)[number];

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

async function resolveSrcToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  if (src.startsWith("blob:")) {
    const res = await fetch(src);
    const blob = await res.blob();
    return readFileAsDataUrl(new File([blob], "asset", { type: blob.type || "image/png" }));
  }
  return src;
}

/** JSON 저장 시 File·blob URL이 깨지지 않도록 data URL 등으로 정규화 */
export async function serializeDesignContentForStorage(content: DesignContent): Promise<DesignContent> {
  const out: DesignContent = { ...content };

  for (const key of MEDIA_FILE_KEYS) {
    const value = out[key];
    if (value instanceof File) {
      out[key] = await readFileAsDataUrl(value);
    } else if (typeof value === "string" && value.startsWith("blob:")) {
      out[key] = await resolveSrcToDataUrl(value);
    }
  }

  if (out.assetLayers?.length) {
    out.assetLayers = await Promise.all(
      out.assetLayers.map(async (layer) => {
        if (!layer.src.startsWith("blob:")) return layer;
        try {
          return { ...layer, src: await resolveSrcToDataUrl(layer.src) };
        } catch {
          return layer;
        }
      }),
    );
  }

  return out;
}

function isBrokenSerializedFile(value: unknown): boolean {
  if (value == null) return false;
  if (value instanceof File) return false;
  if (typeof value === "string") return false;
  if (typeof value !== "object") return false;
  return Object.keys(value as object).length === 0;
}

function normalizeMediaField(value: unknown): File | string | undefined {
  if (value == null || isBrokenSerializedFile(value)) return undefined;
  if (value instanceof File || typeof value === "string") return value;
  return undefined;
}

/** Supabase·sessionStorage에서 복원한 canvas_data 정리 */
export function normalizeDesignContentFromStorage(raw: unknown): DesignContent {
  const base = (raw && typeof raw === "object" ? raw : {}) as DesignContent;
  const out: DesignContent = { ...base };

  for (const key of MEDIA_FILE_KEYS) {
    const normalized = normalizeMediaField(out[key]);
    if (normalized === undefined) delete out[key];
    else out[key] = normalized;
  }

  if (out.assetLayers?.length) {
    out.assetLayers = out.assetLayers
      .map((layer) => normalizeAssetLayer(layer))
      .filter((layer): layer is AssetLayer => layer != null);
  }

  return out;
}

function normalizeAssetLayer(layer: AssetLayer): AssetLayer | null {
  if (!layer?.src || typeof layer.src !== "string") return null;
  if (layer.src.startsWith("blob:")) return null;
  return layer;
}
