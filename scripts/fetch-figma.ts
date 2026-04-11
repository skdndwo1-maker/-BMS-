import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FigmaClient } from "../src/figma/client.js";
import { listFrames, normalizeTree } from "../src/figma/normalize.js";
import { parseFigmaUrl } from "../src/figma/url.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DEFAULT_URL =
  "https://www.figma.com/make/AnXHRYb3yn8miC9fXR4mM2/U--Brand-Contents-Total-Managing-Platform-ver.5-Diverse-Options-?p=f&t=EiTEYQTYPxUnNHQw-0&fullscreen=1";

function main() {
  const token = process.env.FIGMA_TOKEN?.trim();
  if (!token) {
    console.error(
      "FIGMA_TOKEN is not set. Add it to a .env file in the project root:\n  FIGMA_TOKEN=your_personal_access_token\nOr: export FIGMA_TOKEN=..."
    );
    process.exit(1);
  }

  const url = process.argv[2] ?? DEFAULT_URL;
  const parsed = parseFigmaUrl(url);
  const fileKey =
    parsed.kind === "file" ? parsed.fileKey : parsed.fileKeyGuess ?? "";

  if (!fileKey) {
    console.error("Could not infer fileKey from URL. Use a figma.com/file/{fileKey}/... link.");
    process.exit(1);
  }

  console.error(`Using fileKey: ${fileKey} (from ${parsed.kind === "make" ? "make URL guess" : "file URL"})`);

  const client = new FigmaClient({ token });

  client
    .getFile(fileKey)
    .then((raw) => {
      const frames = listFrames(raw.document);
      const normalized = normalizeTree(raw.document, { maxDepth: 12 });
      const payload = {
        input: { url, parsed, fileKey },
        meta: { name: raw.name, lastModified: raw.lastModified, version: raw.version },
        frames,
        normalized,
        raw
      };

      const outJson = JSON.stringify(payload, null, 2);
      const outPath = join(ROOT, "figma-import-result.json");
      writeFileSync(outPath, outJson, "utf8");
      console.error(`Wrote ${outPath}`);

      const publicDir = join(ROOT, "frontend", "public");
      mkdirSync(publicDir, { recursive: true });
      const viewerPath = join(publicDir, "figma.json");
      writeFileSync(viewerPath, outJson, "utf8");
      console.error(`Wrote ${viewerPath} (frontend can load /figma.json)`);

      console.log(outJson);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}

main();
