import{workspaceSchema}from'./resources.js';
import { z } from "zod";
export const settingsSchema = z
    .object({
    documentMode:z.boolean().optional(),
    fontFamily:z.enum(["Arial", "Aptos", "Calibri", "Cambria", "Century Gothic", "Comic Sans MS", "Garamond", "Georgia", "Helvetica", "Inter", "Lato", "Montserrat", "Open Sans", "Poppins", "Roboto", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"]).optional(),
    includeSpeakerNotes:z.boolean().optional(),
    creationMode: z.enum(["template", "creative"]).optional(),
    creativeAssets: z.array(z.object({ id: z.string().uuid(), description: z.string().trim().min(1).max(160) }).strict()).max(12).refine(v => new Set(v.map(a => a.id)).size === v.length).optional(),
    coverLogos: z.array(z.string().uuid()).max(4).refine(v => new Set(v).size === v.length).optional(),
    creativeSlideCount: z.number().int().min(1).max(40).nullable().optional(),
    interactiveLinks: z.boolean().optional(),
    coverAssetId: z.string().uuid().nullable().optional(),
    creativePrompt: z.string().trim().max(12000).optional(),
    creativeQuality: z.enum(["efficient", "premium"]).optional(),
    presentationLanguage: z.enum(["Bahasa Indonesia", "English", "Chinese (Simplified)", "Chinese (Traditional)", "Japanese", "Korean", "Arabic", "French", "German", "Spanish", "Portuguese", "Russian", "Italian", "Dutch", "Turkish", "Hindi", "Bengali", "Urdu", "Punjabi", "Tamil", "Telugu", "Marathi", "Vietnamese", "Thai", "Malay", "Filipino", "Ukrainian", "Polish", "Czech", "Romanian", "Hungarian", "Greek", "Swedish", "Danish", "Norwegian", "Finnish", "Hebrew", "Persian", "Swahili", "Sundanese", "Javanese", "Acehnese", "Madurese", "Makassarese", "Minangkabau", "Buginese", "Balinese", "Banjarese", "Cantonese (Traditional)", "Portuguese (Brazil)", "Portuguese (Portugal)", "French (Canada)", "Punjabi (Shahmukhi)", "Kannada", "Malayalam", "Gujarati", "Odia", "Assamese", "Nepali", "Sinhala", "Khmer", "Lao", "Burmese", "Tibetan", "Mongolian", "Georgian", "Armenian", "Azerbaijani", "Kazakh", "Uzbek", "Kyrgyz", "Tajik", "Turkmen", "Pashto", "Kurdish (Kurmanji)", "Kurdish (Sorani)", "Sindhi", "Uyghur", "Afrikaans", "Amharic", "Hausa", "Yoruba", "Igbo", "Zulu", "Xhosa", "Somali", "Kinyarwanda", "Malagasy", "Haitian Creole", "Albanian", "Bulgarian", "Croatian", "Serbian", "Slovak", "Slovenian", "Estonian", "Latvian", "Lithuanian", "Icelandic", "Irish", "Indonesian"]).optional(),
    languageReceipt: z.string().max(1500).optional(),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
    motion: z.enum(["none", "keynote"]).optional(),
    theme: z.enum(["midnight", "ivory", "solar", "cobalt", "sage", "graphite"]),
    mode: z.enum(["markdown", "literal"]),
    useAI: z.boolean(),
    images: z.boolean(),
    assetId: z.string().uuid().nullable().optional(),
    model: z.enum(["gpt-6-luna", "gpt-6.1-terra"]).optional(),
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
    workspace: workspaceSchema.optional(),
    name: z.string().trim().min(1).max(120),
    source: z.string(),
    mode: z.enum(["markdown", "literal"]),
})
    .strict();
export const manualPlanSchema = z
    .object({
    engine: z.literal("rules"),
    slides: z
        .array(z
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
        offsets: z.record(z.string().regex(/^b\d+$/), z.object({
            dx: z.number().finite().min(-0.75).max(0.75),
            dy: z.number().finite().min(-0.75).max(0.75),
        }).strict()).refine(v => Object.keys(v).length <= 100, "Too many block offsets").optional(),
    })
        .strict())
        .min(1)
        .max(80),
})
    .strict();
export const terminalStatuses = ["ready", "failed", "cancelled"];
