export type ParsedFigmaRef =
  | { kind: "file"; fileKey: string }
  | { kind: "make"; makeId: string; fileKeyGuess?: string };

const FILE_KEY_RE = /figma\.com\/file\/([a-zA-Z0-9]+)\//;
const MAKE_RE = /figma\.com\/make\/([a-zA-Z0-9_-]+)/;

// Heuristic: file keys are typically base62-ish 20-40 chars.
const FILE_KEY_GUESS_RE = /\b([a-zA-Z0-9]{20,40})\b/;

export function parseFigmaUrl(url: string): ParsedFigmaRef {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  const href = u.toString();
  const fileMatch = href.match(FILE_KEY_RE);
  if (fileMatch?.[1]) return { kind: "file", fileKey: fileMatch[1] };

  const makeMatch = href.match(MAKE_RE);
  if (makeMatch?.[1]) {
    const makeId = makeMatch[1];
    // Figma Make URLs often put the file key right after /make/{fileKey}/...
    const looksLikeFileKey = /^[a-zA-Z0-9]{20,40}$/.test(makeId);
    const guessFromHref = href.match(FILE_KEY_GUESS_RE)?.[1];
    const fileKeyGuess = looksLikeFileKey ? makeId : guessFromHref;
    return { kind: "make", makeId, fileKeyGuess };
  }

  // Fall back to fileKey guess anywhere in URL.
  const guess = href.match(FILE_KEY_GUESS_RE)?.[1];
  if (guess) return { kind: "file", fileKey: guess };

  throw new Error("Unsupported Figma URL (could not infer file key)");
}

