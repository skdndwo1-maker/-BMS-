import { removeBackground, type Config } from "@imgly/background-removal";

const DEFAULT_CONFIG: Config = {
  output: { format: "image/png", quality: 1 },
};

export type BackgroundRemovalResult = {
  mimeType: "image/png";
  base64: string;
  dataUrl: string;
};

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

export async function removeImageBackground(
  input: string | Blob
): Promise<BackgroundRemovalResult> {
  const blob = await removeBackground(input, DEFAULT_CONFIG);
  const dataUrl = await blobToDataUrl(blob);
  const base64 = dataUrl.replace(/^data:image\/[\w+.-]+;base64,/, "");
  return { mimeType: "image/png", base64, dataUrl };
}
