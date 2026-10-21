import { z } from "zod";

export const settingsSchema = z
  .object({
    creationMode: z.enum(["template", "creative"]).optional(),
    creativeAssets: z.array(z.object({ id: z.string().uuid(), description: z.string().trim().min(1).max(160) }).strict()).max(12).refine(v => new Set(v.map(a => a.id)).size === v.length).optional(),
    creativeSlideCount: z.number().int().min(1).max(40).nullable().optional(),
    interactiveLinks: z.boolean().optional(),
    creativePrompt: z.string().trim().max(3000).optional(),
    creativeQuality: z.enum(["efficient", "premium"]).optional(),
    motion: z.enum(["none", "keynote"]).optional(),
    theme: z.enum(["midnight", "ivory", "solar", "cobalt", "sage", "graphite"]),
    mode: z.enum(["markdown", "literal"]),
    useAI: z.boolean(),
    images: z.boolean(),
    assetId: z.string().uuid().nullable().optional(),
    model: z.enum(["gpt-6-luna", "gpt-4.1-mini"]).optional(),
    template: z
      .enum(["editorial", "minimal", "studio", "executive"])
      .optional(),
    density: z.enum(["comfortable", "compact"]).optional(),
    fontScale: z.number().min(0.85).max(1.15).optional(),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    intent: z
      .enum(["auto", "executive", "educational", "proposal", "report"])
      .optional(),
  })
  .strict();

export const sourceInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    source: z.string(),
    mode: z.enum(["markdown", "literal"]),
  })
  .strict();

export const manualPlanSchema = z
  .object({
    engine: z.literal("rules"),
    slides: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            blockIds: z.array(z.string()).min(1).max(10000),
            layout: z.enum([
              "cover",
              "section",
              "editorial",
              "columns",
              "process",
              "cards",
              "timeline",
              "statement",
              "photo",
              "table",
            ]),
            imageId: z.union([z.literal("city"), z.string().uuid()]).nullable(),
            offsets: z.record(
              z.string().regex(/^b\d+$/),
              z.object({
                dx: z.number().finite().min(-0.75).max(0.75),
                dy: z.number().finite().min(-0.75).max(0.75),
              }).strict(),
            ).refine(v => Object.keys(v).length <= 100, "Too many block offsets").optional(),
          })
          .strict(),
      )
      .min(1)
      .max(80),
  })
  .strict();

export const terminalStatuses = ["ready", "failed", "cancelled"];
