type FigmaNode = any;

export type NormalizedNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: NormalizedNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layout?: {
    mode?: string;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
    padding?: { left?: number; right?: number; top?: number; bottom?: number };
    itemSpacing?: number;
  };
  style?: {
    opacity?: number;
    cornerRadius?: number;
    fills?: any[];
    strokes?: any[];
    effects?: any[];
  };
  text?: {
    characters?: string;
    style?: any;
  };
  exportHints?: { recommendedAsImage?: boolean; reason?: string };
};

function pickBBox(node: FigmaNode) {
  const bb = node.absoluteBoundingBox ?? node.absoluteRenderBounds;
  if (!bb) return undefined;
  const { x, y, width, height } = bb;
  if ([x, y, width, height].some((v) => typeof v !== "number")) return undefined;
  return { x, y, width, height };
}

function normalizeOne(node: FigmaNode, depthLeft: number): NormalizedNode {
  const out: NormalizedNode = {
    id: String(node.id),
    name: String(node.name ?? ""),
    type: String(node.type ?? "UNKNOWN"),
    visible: node.visible,
    absoluteBoundingBox: pickBBox(node),
    layout: node.layoutMode || node.itemSpacing || node.paddingLeft != null ? {
      mode: node.layoutMode,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      padding: {
        left: node.paddingLeft,
        right: node.paddingRight,
        top: node.paddingTop,
        bottom: node.paddingBottom
      },
      itemSpacing: node.itemSpacing
    } : undefined,
    style: node.opacity != null || node.cornerRadius != null || node.fills || node.strokes || node.effects ? {
      opacity: node.opacity,
      cornerRadius: node.cornerRadius,
      fills: node.fills,
      strokes: node.strokes,
      effects: node.effects
    } : undefined,
    text: node.type === "TEXT" ? { characters: node.characters, style: node.style } : undefined
  };

  if (depthLeft > 0 && Array.isArray(node.children) && node.children.length) {
    out.children = node.children.map((c: any) => normalizeOne(c, depthLeft - 1));
  }

  // export hint: images are most useful for frames/components/instances/vectors
  const imageLike = new Set(["FRAME", "COMPONENT", "INSTANCE", "COMPONENT_SET", "VECTOR", "GROUP", "SECTION"]);
  if (imageLike.has(out.type)) {
    out.exportHints = { recommendedAsImage: true, reason: "Commonly exported for review/hand-off" };
  }

  return out;
}

export function normalizeTree(documentNode: FigmaNode, opts?: { maxDepth?: number }): NormalizedNode {
  const maxDepth = opts?.maxDepth ?? 8;
  return normalizeOne(documentNode, maxDepth);
}

export function listFrames(documentNode: FigmaNode): Array<{ id: string; name: string; path: string[]; type: string }> {
  const frames: Array<{ id: string; name: string; path: string[]; type: string }> = [];
  const stack: Array<{ node: any; path: string[] }> = [{ node: documentNode, path: [] }];

  while (stack.length) {
    const { node, path } = stack.pop()!;
    const name = String(node.name ?? "");
    const nextPath = node.type === "PAGE" ? [name] : [...path, name].filter(Boolean);

    if (node.type === "FRAME" || node.type === "SECTION" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      frames.push({ id: String(node.id), name, path: nextPath, type: String(node.type) });
    }
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], path: nextPath });
    }
  }

  return frames;
}

