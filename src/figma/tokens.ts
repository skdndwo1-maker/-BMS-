type FigmaNode = any;

export type ExtractedTokens = {
  colors: Record<string, { value: string; source: string }>;
  typography: Record<
    string,
    {
      fontFamily?: string;
      fontPostScriptName?: string;
      fontSize?: number;
      fontWeight?: number;
      lineHeightPx?: number;
      letterSpacing?: number;
      textCase?: string;
      textDecoration?: string;
      source: string;
    }
  >;
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function rgbaToHex(r: number, g: number, b: number, a: number) {
  const to255 = (x: number) => Math.round(clamp01(x) * 255);
  const hex2 = (x: number) => to255(x).toString(16).padStart(2, "0");
  const rr = hex2(r);
  const gg = hex2(g);
  const bb = hex2(b);
  const aa = hex2(a);
  return aa === "ff" ? `#${rr}${gg}${bb}` : `#${rr}${gg}${bb}${aa}`;
}

function paintToHex(paint: any): string | undefined {
  if (!paint || paint.type !== "SOLID" || !paint.color) return undefined;
  const { r, g, b } = paint.color;
  const a = paint.opacity ?? 1;
  return rgbaToHex(r, g, b, a);
}

function tokenKey(prefix: string, raw: string) {
  return `${prefix}.${raw}`
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "");
}

export function extractTokensFromDocument(documentNode: FigmaNode): ExtractedTokens {
  const tokens: ExtractedTokens = { colors: {}, typography: {} };

  const stack: Array<{ node: any; path: string[] }> = [{ node: documentNode, path: [] }];
  while (stack.length) {
    const { node, path } = stack.pop()!;
    const name = String(node.name ?? "");
    const nextPath = node.type === "PAGE" ? [name] : [...path, name].filter(Boolean);
    const source = `${nextPath.join("/") || "(root)"}#${String(node.id ?? "")}`;

    // Colors: pick first visible SOLID fill/stroke (best-effort)
    for (const [kind, paints] of [
      ["fill", node.fills],
      ["stroke", node.strokes]
    ] as const) {
      if (!Array.isArray(paints)) continue;
      const solid = paints.find((p: any) => p?.visible !== false && p?.type === "SOLID");
      const hex = paintToHex(solid);
      if (!hex) continue;

      const key = tokenKey("color", `${kind}_${name || node.type}_${hex}`);
      if (!tokens.colors[key]) tokens.colors[key] = { value: hex, source };
    }

    // Typography from TEXT nodes
    if (node.type === "TEXT" && node.style) {
      const s = node.style;
      const key = tokenKey("type", `${name || "Text"}_${s.fontPostScriptName || s.fontFamily || "font"}_${s.fontSize || ""}`);
      if (!tokens.typography[key]) {
        tokens.typography[key] = {
          fontFamily: s.fontFamily,
          fontPostScriptName: s.fontPostScriptName,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeightPx: typeof s.lineHeightPx === "number" ? s.lineHeightPx : undefined,
          letterSpacing: typeof s.letterSpacing === "number" ? s.letterSpacing : undefined,
          textCase: s.textCase,
          textDecoration: s.textDecoration,
          source
        };
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], path: nextPath });
    }
  }

  return tokens;
}

