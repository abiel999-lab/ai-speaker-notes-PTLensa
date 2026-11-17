export type ImportMode = "markdown" | "literal";
export type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "reference"
  | "code"
  | "table";
export interface SourceBlock {
  id: string;
  start: number;
  end: number;
  raw: string;
  text: string;
  kind: BlockKind;
  level: number;
  cells?: string[][];
}
export interface SourceDocument {
  raw: string;
  sha256: string;
  mode: ImportMode;
  blocks: SourceBlock[];
  ledger: { start: number; end: number; role: "content" | "format" }[];
  words: number;
  version: string;
}
export type LayoutId =
  | "cover"
  | "section"
  | "editorial"
  | "columns"
  | "process"
  | "cards"
  | "timeline"
  | "statement"
  | "photo"
  | "table";
export type ThemeId =
  | "midnight"
  | "ivory"
  | "solar"
  | "cobalt"
  | "sage"
  | "graphite";
export type TemplateId = "editorial" | "minimal" | "studio" | "executive";
export type PresentationIntent =
  | "auto"
  | "executive"
  | "educational"
  | "proposal"
  | "report";
export interface VisualSettings {
  template?: TemplateId;
  density?: "comfortable" | "compact";
  fontScale?: number;
  accent?: string | null;
  intent?: PresentationIntent;
}
export interface AITrace {
  requested: boolean;
  outcome: "used" | "fallback" | "disabled" | "manual";
  model?: string;
  reason?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}
/** Position adjustments in presentation inches, keyed by immutable source block ID.
 * Source text and order are never mutated by these adjustments. */
export interface BlockOffset {
  dx: number;
  dy: number;
}
export interface SlidePlan {
  id: string;
  blockIds: string[];
  layout: LayoutId;
  imageId: string | null;
  offsets?: Record<string, BlockOffset>;
}
export interface Plan {
  slides: SlidePlan[];
  engine: "rules" | "openai";
  warning?: string;
  usage?: { input: number; output: number; model: string };
  ai?: AITrace;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface SceneObject extends Rect {
  type: "text" | "shape" | "image" | "table";
  text?: string;
  lines?: string[];
  sourceId?: string;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  fill?: string;
  line?: string;
  shape?: "rect" | "ellipse" | "line" | "roundRect" | "chevron" | "hexagon" | "triangle" | "parallelogram";
  align?: "left" | "center" | "right";
  stroke?: string | null;
  strokeWidth?: number;
  fillOpacity?: number;
  asset?: string;
  backgroundImage?: boolean;
  imageTreatment?: "none" | "dark" | "light";
  imageTextSide?: "left" | "right" | "full";
  targetSlide?: number;
  rows?: string[][];
  cellLines?: string[][][];
  rowHeights?: number[];
}
export interface SceneSlide {
  id: string;
  layout: LayoutId;
  background: string;
  objects: SceneObject[];
  blockIds: string[];
}
export interface Scene {
  menuSlide?: number;
  slides: SceneSlide[];
  theme: ThemeId;
  sourceHash: string;
  version: string;
}
export interface FidelityReport {
  passed: boolean;
  sourceHash: string;
  blocks: number;
  characters: number;
  missing: string[];
  changed: string[];
  extra: string[];
  duplicate: string[];
  orderValid: boolean;
  exportVerified: boolean;
  interactive?: { links: number; uploadedImages: number; menuSlide: number | null };
  motion?: { preset: "keynote"; animatedObjects: number; transitionSlides: number; navigationSlides: number; preview: "static" };
  quality?: {
    status: "verified" | "warning" | "blocked";
    overflow: number;
    overlaps: number;
    minimumFontSize: number;
  };
}
export interface Settings extends VisualSettings {
  creationMode?: "template" | "creative";
  creativePrompt?: string;
  creativeQuality?: "efficient" | "premium";
  creativeAssets?: { id: string; description: string }[];
  creativeSlideCount?: number | null;
  interactiveLinks?: boolean;
  motion?: "none" | "keynote";
  theme: ThemeId;
  mode: ImportMode;
  useAI: boolean;
  images: boolean;
  assetId?: string | null;
  model?: "gpt-6-luna" | "gpt-4.1-mini";
}
export interface Generation {
  id: string;
  projectId: string;
  status:
    | "queued"
    | "planning"
    | "building"
    | "verifying"
    | "rendering"
    | "ready"
    | "failed"
    | "cancelled";
  progress: number;
  stage: string;
  createdAt: string;
  sourceHash: string;
  settings: Settings;
  plan?: Plan;
  scene?: Scene;
  report?: FidelityReport;
  error?: string;
  preview: "rendered" | "layout" | "none";
  previewWarning?: string;
  kind?: "generation" | "design" | "text-edit";
  durationMs?: number;
}
export interface Project {
  id: string;
  ownerId: string;
  name: string;
  source: string;
  sourceHash: string;
  mode: ImportMode;
  createdAt: string;
  updatedAt: string;
  latestId: string | null;
  revision?: number;
}
