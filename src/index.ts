import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { FigmaClient, downloadBytes } from "./figma/client.js";
import { parseFigmaUrl } from "./figma/url.js";
import { listFrames, normalizeTree } from "./figma/normalize.js";
import { extractTokensFromDocument } from "./figma/tokens.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const server = new McpServer(
  { name: "figma-import-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const figma = new FigmaClient({ token: requireEnv("FIGMA_TOKEN") });

const ImportFromUrlSchema = z.object({
  url: z.string(),
  depth: z.number().int().min(1).max(50).optional(),
  normalizeMaxDepth: z.number().int().min(1).max(50).optional()
});

server.registerTool(
  "figma_import_from_url",
  {
    title: "Import from URL",
    description: "Import Figma structure from a URL (best-effort for /make links).",
    inputSchema: ImportFromUrlSchema
  },
  async (args) => {
    const { url, depth, normalizeMaxDepth } = args;
    const parsed = parseFigmaUrl(url);
    const fileKey =
      parsed.kind === "file" ? parsed.fileKey : parsed.fileKeyGuess ?? "";
    if (!fileKey) {
      return {
        content: [
          {
            type: "text",
            text:
              "Could not infer fileKey from this URL. If this is a Figma Make link, provide the underlying Figma file link or fileKey."
          }
        ]
      };
    }

    const file = await figma.getFile(fileKey, { depth });
    const normalized = normalizeTree(file.document, { maxDepth: normalizeMaxDepth ?? 8 });
    const frames = listFrames(file.document);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              input: { url, parsed, fileKey },
              meta: { name: file.name, lastModified: file.lastModified, version: file.version },
              frames,
              normalized,
              raw: file
            },
            null,
            2
          )
        }
      ]
    };
  }
);

const ListFramesSchema = z.object({
  fileKey: z.string(),
  depth: z.number().int().min(1).max(50).optional()
});

server.registerTool(
  "figma_list_frames",
  {
    title: "List frames",
    description: "List pages/frames/components in a file (useful for choosing export targets).",
    inputSchema: ListFramesSchema
  },
  async (args) => {
    const { fileKey, depth } = args;
    const file = await figma.getFile(fileKey, { depth });
    const frames = listFrames(file.document);
    return { content: [{ type: "text", text: JSON.stringify({ fileKey, frames }, null, 2) }] };
  }
);

const ExportImagesSchema = z.object({
  fileKey: z.string(),
  nodeIds: z.array(z.string()).min(1),
  format: z.enum(["png", "svg"]).default("png"),
  scale: z.number().min(0.1).max(8).optional(),
  useAbsoluteBounds: z.boolean().optional(),
  inlineBytesBase64: z.boolean().default(false)
});

server.registerTool(
  "figma_export_images",
  {
    title: "Export images",
    description: "Export node images (png/svg). Can optionally inline bytes as base64 (beware size).",
    inputSchema: ExportImagesSchema
  },
  async (args) => {
    const { fileKey, nodeIds, format, scale, useAbsoluteBounds, inlineBytesBase64 } = args;
    const resp = await figma.getImages(fileKey, {
      ids: nodeIds,
      format,
      scale,
      use_absolute_bounds: useAbsoluteBounds
    });

    const out: Record<string, any> = {};
    for (const id of nodeIds) {
      const url = resp.images?.[id];
      if (!url) {
        out[id] = { ok: false, error: "No image URL returned (node may be non-exportable)" };
        continue;
      }

      if (!inlineBytesBase64) {
        out[id] = { ok: true, url };
        continue;
      }

      const bytes = await downloadBytes(url);
      out[id] = {
        ok: true,
        url,
        bytesBase64: b64(bytes),
        byteLength: bytes.byteLength
      };
    }

    return { content: [{ type: "text", text: JSON.stringify({ fileKey, format, scale, results: out }, null, 2) }] };
  }
);

const ExtractTokensSchema = z.object({
  fileKey: z.string(),
  depth: z.number().int().min(1).max(50).optional()
});

server.registerTool(
  "figma_extract_tokens",
  {
    title: "Extract tokens",
    description: "Extract best-effort design tokens (colors + typography) by scanning document nodes.",
    inputSchema: ExtractTokensSchema
  },
  async (args) => {
    const { fileKey, depth } = args;
    const file = await figma.getFile(fileKey, { depth });
    const tokens = extractTokensFromDocument(file.document);
    return { content: [{ type: "text", text: JSON.stringify({ fileKey, tokens }, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // MCP host reads stderr; keep it concise.
  console.error(err?.stack ?? String(err));
  process.exit(1);
});

