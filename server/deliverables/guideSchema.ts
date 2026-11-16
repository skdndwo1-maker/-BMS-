import { createHash } from "node:crypto";
import { z } from "zod";

const ELEMENT_VALUES = [
  "logo",
  "color",
  "typo",
  "layout",
  "image",
  "icon",
  "motif",
  "text",
  "other",
] as const;

const CHECK_VALUES = ["code", "vision", "judgment"] as const;
const SEVERITY_VALUES = ["critical", "major", "minor"] as const;
const STRICTNESS_VALUES = ["strict", "normal", "lenient"] as const;
const VERDICT_VALUES = ["pass", "fail"] as const;

function fieldLabel(path: (string | number)[]): string {
  if (path.length === 0) return "전체";
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p === "rules" && typeof path[i + 1] === "number") {
      parts.push(`${(path[i + 1] as number) + 1}번째 규칙`);
      i += 1;
      continue;
    }
    if (p === "examples" && typeof path[i + 1] === "number") {
      parts.push(`${(path[i + 1] as number) + 1}번째 예시`);
      i += 1;
      continue;
    }
    const map: Record<string, string> = {
      summary: "summary",
      rules: "rules",
      id: "id",
      element: "element",
      statement: "statement",
      check: "check",
      severity: "severity",
      params: "params",
      templates: "templates",
      source: "source",
      direction: "direction",
      focus: "focus",
      strictness: "strictness",
      ignore: "ignore",
      instructions: "instructions",
      feedback_style: "feedback_style",
      examples: "examples",
      verdict: "verdict",
      description: "description",
    };
    if (typeof p === "string") parts.push(map[p] ?? p);
    else parts.push(String(p));
  }
  return parts.join(" › ");
}

function issueToKorean(issue: z.ZodIssue): string {
  const where = fieldLabel(issue.path);
  if (issue.code === "invalid_type") {
    return `${where}: 타입이 올바르지 않습니다 (기대=${issue.expected}, 실제=${issue.received}).`;
  }
  if (issue.code === "invalid_enum_value") {
    return `${where}: 허용 값이 아닙니다 (가능=${issue.options.join(", ")}, 입력=${String(issue.received)}).`;
  }
  if (issue.code === "too_small") {
    return `${where}: 값이 너무 짧거나 비어 있습니다.`;
  }
  if (issue.code === "custom") {
    return `${where}: ${issue.message}`;
  }
  return `${where}: ${issue.message}`;
}

const ruleSchema = z.object({
  id: z.string().min(1),
  element: z.enum(ELEMENT_VALUES),
  statement: z.string().min(1),
  check: z.enum(CHECK_VALUES),
  severity: z.enum(SEVERITY_VALUES),
  params: z.record(z.unknown()).optional(),
  templates: z.array(z.string()).optional(),
  source: z.string().optional(),
});

const directionSchema = z
  .object({
    focus: z.array(z.string()).optional(),
    strictness: z.enum(STRICTNESS_VALUES).optional(),
    ignore: z.array(z.string()).optional(),
    instructions: z.string().optional(),
    feedback_style: z.string().optional(),
  })
  .optional();

const exampleSchema = z.object({
  verdict: z.enum(VERDICT_VALUES),
  description: z.string().min(1),
});

export const deliverableGuideContentSchema = z
  .object({
    summary: z.string().optional(),
    rules: z.array(ruleSchema).default([]),
    direction: directionSchema,
    examples: z.array(exampleSchema).optional(),
  })
  .superRefine((val, ctx) => {
    const seen = new Map<string, number>();
    for (let i = 0; i < val.rules.length; i++) {
      const id = val.rules[i].id;
      const prev = seen.get(id);
      if (prev !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", i, "id"],
          message: `규칙 id "${id}"가 ${(prev + 1)}번째 규칙과 중복됩니다.`,
        });
      } else {
        seen.set(id, i);
      }
    }
  });

export type DeliverableGuideContent = z.infer<typeof deliverableGuideContentSchema>;

export type GuideSchemaValidation =
  | { ok: true; content: DeliverableGuideContent }
  | { ok: false; errors: string[] };

export function validateGuideContent(raw: unknown): GuideSchemaValidation {
  const parsed = deliverableGuideContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(issueToKorean) };
  }
  return { ok: true, content: parsed.data };
}

/** Canonical JSON for content_hash (stable key order via JSON.stringify of validated object). */
export function hashGuideContent(content: DeliverableGuideContent): string {
  const canonical = JSON.stringify(content);
  return createHash("sha256").update(canonical).digest("hex");
}

export const GUIDE_ELEMENT_VALUES = ELEMENT_VALUES;
export const GUIDE_CHECK_VALUES = CHECK_VALUES;
export const GUIDE_SEVERITY_VALUES = SEVERITY_VALUES;
