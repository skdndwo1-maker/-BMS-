import { request } from "undici";

export type FigmaFileResponse = {
  name: string;
  role?: string;
  lastModified: string;
  version: string;
  document: any;
  components?: Record<string, any>;
  componentSets?: Record<string, any>;
  styles?: Record<string, any>;
};

export type FigmaImagesResponse = {
  err?: string | null;
  images: Record<string, string>;
};

export class FigmaClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(opts: { token: string; baseUrl?: string }) {
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? "https://api.figma.com";
  }

  private async json<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const res = await request(url, {
      method: "GET",
      headers: {
        "X-Figma-Token": this.token
      }
    });

    const text = await res.body.text();
    let parsed: any;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Figma API returned non-JSON (${res.statusCode})`);
    }

    if (res.statusCode >= 400) {
      const msg = parsed?.err ?? parsed?.message ?? `HTTP ${res.statusCode}`;
      throw new Error(`Figma API error: ${msg}`);
    }

    return parsed as T;
  }

  async getFile(fileKey: string, opts?: { depth?: number; geometry?: "paths" }): Promise<FigmaFileResponse> {
    return this.json<FigmaFileResponse>(`/v1/files/${encodeURIComponent(fileKey)}`, {
      depth: opts?.depth,
      geometry: opts?.geometry
    });
  }

  async getImages(
    fileKey: string,
    opts: {
      ids: string[];
      format: "png" | "svg";
      scale?: number;
      use_absolute_bounds?: boolean;
      svg_include_id?: boolean;
      svg_simplify_stroke?: boolean;
    }
  ): Promise<FigmaImagesResponse> {
    return this.json<FigmaImagesResponse>(`/v1/images/${encodeURIComponent(fileKey)}`, {
      ids: opts.ids.join(","),
      format: opts.format,
      scale: opts.scale,
      use_absolute_bounds: opts.use_absolute_bounds,
      svg_include_id: opts.svg_include_id,
      svg_simplify_stroke: opts.svg_simplify_stroke
    });
  }
}

export async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await request(url, { method: "GET" });
  if (res.statusCode >= 400) throw new Error(`Download failed (${res.statusCode})`);
  const arr = await res.body.arrayBuffer();
  return new Uint8Array(arr);
}

