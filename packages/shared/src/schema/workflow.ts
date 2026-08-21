import { z } from "zod";

/** Multi-layer locator: resolved in order role+name → testId → anchor → css → xpath → text. */
export const TargetSchema = z.object({
  role: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
  testId: z.string().nullable().default(null),
  css: z.string().nullable().default(null),
  xpath: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
  nth: z.number().int().min(0).default(0),
  anchor: z
    .object({ role: z.string(), name: z.string() })
    .nullable()
    .default(null),
});
export type Target = z.infer<typeof TargetSchema>;

export const ConditionSchema = z.object({
  selectorVisible: z.string().optional(), // "@t1" target ref or css selector
  textPresent: z.string().optional(),
  urlMatches: z.string().optional(), // substring or /regex/
});
export type Condition = z.infer<typeof ConditionSchema>;

export const RiskSchema = z.enum(["read", "write", "destructive"]);
export type Risk = z.infer<typeof RiskSchema>;

/** Closed action list — extending it requires an ADR (docs/adr/). */
export const ActionNameSchema = z.enum([
  "navigate",
  "click",
  "type",
  "select",
  "check",
  "upload",
  "scroll",
  "waitFor",
  "assert",
  "extract",
  "keypress",
  "hover",
  "goBack",
  "screenshot",
  "sleep",
]);
export type ActionName = z.infer<typeof ActionNameSchema>;

export const StepSchema = z.object({
  id: z.string(),
  action: ActionNameSchema,
  url: z.string().optional(), // navigate
  target: z.string().optional(), // "@tN" reference into workflow.targets
  value: z.string().optional(), // type/select/keypress/upload path
  clearFirst: z.boolean().optional(), // type
  condition: ConditionSchema.optional(), // waitFor/assert
  timeoutMs: z.number().int().positive().optional(),
  amount: z.number().optional(), // scroll pixels (negative = up)
  schema: z.record(z.string()).optional(), // extract: { field: "string" }
  into: z.string().optional(), // extract: variable name for result
  risk: RiskSchema.default("read"),
  note: z.string().optional(), // human-readable intent, used by HEAL
});
export type Step = z.infer<typeof StepSchema>;

export const InputSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  source: z.string(), // "column:SKU" | "constant:x" | "prompt"
  required: z.boolean().default(true),
});
export type WorkflowInput = z.infer<typeof InputSchema>;

export const WorkflowSchema = z.object({
  version: z.number().int().default(1),
  name: z.string(),
  createdBy: z.enum(["compile", "recorder", "manual"]).default("manual"),
  allowedDomains: z.array(z.string()).min(1),
  inputs: z.array(InputSchema).default([]),
  steps: z.array(StepSchema).min(1),
  targets: z.record(TargetSchema).default({}),
  onFailure: z.enum(["heal", "abort", "skipRow"]).default("abort"),
  budget: z
    .object({
      maxTokens: z.number().int().positive().default(200_000),
      maxUsd: z.number().positive().optional(),
    })
    .default({ maxTokens: 200_000 }),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** Parse and validate a workflow JSON object; throws ZodError with details on mismatch. */
export function parseWorkflow(data: unknown): Workflow {
  return WorkflowSchema.parse(data);
}
