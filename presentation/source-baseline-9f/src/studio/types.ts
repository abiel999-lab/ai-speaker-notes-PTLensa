import type { Generation, Project, Settings, Plan } from "../../core/types";
export type Language = "en" | "id";
export interface ProjectSummary extends Omit<Project, "source" | "ownerId"> {
  latest: null | {
    id: string;
    status: Generation["status"];
    slides: number;
    theme: Settings["theme"];
    engine?: Plan["engine"];
    preview?: Generation["preview"];
  };
}
export interface Capabilities {
  ai: boolean;
  model: string | null;
  render: boolean;
  mode: string;
  models: string[];
  creativeModels?: string[];
  localAdmin: boolean;
}
export type Job = Generation & { source: string };
export const DEFAULT_SETTINGS: Settings = {
  creationMode: "template",
  creativeQuality: "efficient",
  creativeAssets: [],
  creativeSlideCount: null,
  interactiveLinks: true,
  motion: "none",
  theme: "midnight",
  mode: "markdown",
  useAI: true,
  images: false,
  template: "editorial",
  density: "comfortable",
  fontScale: 1,
  accent: null,
  intent: "auto",
};
export const visualKey = (s: Settings) =>
  JSON.stringify({
    theme: s.theme,
    mode: s.mode,
    images: s.images,
    assetId: s.assetId || null,
    template: s.template || "editorial",
    density: s.density || "comfortable",
    fontScale: s.fontScale || 1,
    accent: s.accent || null,
    intent: s.intent || "auto",
  });
export const manualPlan = (plan: Plan): Plan => ({
  engine: "rules",
  slides: plan.slides.map((s) => ({ ...s })),
});
