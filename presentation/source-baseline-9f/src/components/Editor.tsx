import { TemplateTextEditor } from "./TemplateTextEditor";
import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Image,
  ShieldCheck,
  Check,
  Undo2,
  Redo2,
  RotateCcw,
  Loader2,
  Play,
  X,
  Upload,
  Download,
  GitMerge,
  Split,
  Eye,
  LockKeyhole,
  Sparkles,
  ListTree,
  ArrowUpToLine,
  ArrowDownToLine,
  History,
  NotebookPen,
  MousePointer2,
} from "lucide-react";
import type { LayoutId } from "../../core/types";
import { slideNotes } from "../../core/notes";
import { api, ApiError } from "../api";
import { Slide } from "../Slide";
import { CanvasPositionOverlay } from "./CanvasPositionOverlay";
import { DesignControls } from "./DesignControls";
import { ErrorBanner, Toggle, IntegrityBadge } from "./Common";
import { useDesignDraft } from "../studio/useDesignDraft";
import type { Studio } from "../studio/useStudio";
import type { Language, Job } from "../studio/types";
import { en, id } from "../i18n";
const layouts: LayoutId[] = [
  "editorial",
  "columns",
  "process",
  "cards",
  "timeline",
  "statement",
  "photo",
  "section",
  "table",
];
function retainBlockOffsets(
  offsets: Record<string, { dx: number; dy: number }> | undefined,
  ids: string[],
) {
  if (!offsets) return undefined;
  const entries = Object.entries(offsets).filter(([key]) => ids.includes(key));
  return entries.length ? Object.fromEntries(entries) : undefined;
}
function transferBlockOffset(
  from: { offsets?: Record<string, { dx: number; dy: number }> },
  to: { offsets?: Record<string, { dx: number; dy: number }> },
  id: string,
) {
  const moved = from.offsets?.[id];
  const fromOffsets = { ...from.offsets };
  delete fromOffsets[id];
  from.offsets = Object.keys(fromOffsets).length ? fromOffsets : undefined;
  if (moved) to.offsets = { ...to.offsets, [id]: moved };
}
function frozenElement(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable='true']")
  );
}
export function Editor({
  studio: s,
  lang,
}: {
  studio: Studio;
  lang: Language;
}) {
  const d = useDesignDraft(s);
  const t = lang === "en" ? en : id;
  const tr = (en: string, id: string) => (lang === "en" ? en : id);
  const [index, setIndex] = useState(0),
    [tab, setTab] = useState<"outline" | "design" | "assets" | "source">(
      "design",
    ),
    [panel, setPanel] = useState(true),
    [zoom, setZoom] = useState(100),
    [present, setPresent] = useState(false),
    [blocks, setBlocks] = useState<
      { id: string; text: string; kind: string; raw?: string }[]
    >([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [nudgeStep, setNudgeStep] = useState<0.05 | 0.1 | 0.25>(0.05);
  const [canvasPositionMode, setCanvasPositionMode] = useState(false);
  const photoFile = useRef<HTMLInputElement>(null);
  const presentDialog = useRef<HTMLDivElement>(null);
  const scene = d.preview || s.job?.scene;
  const slide = scene?.slides[Math.min(index, (scene?.slides.length || 1) - 1)];
  useEffect(() => {
    setIndex(0);
  }, [s.job?.id]);
  useEffect(() => {
    if (scene && index >= scene.slides.length)
      setIndex(Math.max(0, scene.slides.length - 1));
  }, [scene?.slides.length, index]);
  useEffect(() => {
    if (!s.job?.source) return;
    const controller = new AbortController();
    api(
      "/analyze",
      "POST",
      { source: s.job.source, mode: s.job.settings.mode },
      controller.signal,
    )
      .then((r) => setBlocks(r.blocks))
      .catch((e) => {
        if (!controller.signal.aborted) s.setError(e);
      });
    return () => controller.abort();
  }, [s.job?.id]);
  useEffect(() => {
    if (!present) return;
    presentDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Tab") {
        const buttons = Array.from(
          presentDialog.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) || [],
        );
        const first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      if (e.key === "Escape") setPresent(false);
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, (scene?.slides.length || 1) - 1));
      }
      if (["ArrowLeft", "PageUp"].includes(e.key))
        setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      setTimeout(
        () =>
          document
            .querySelector<HTMLButtonElement>('[aria-label="Present slides"]')
            ?.focus(),
        0,
      );
    };
  }, [present, scene?.slides.length]);
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || frozenElement(event.target))
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) d.redoChange();
        else d.undoChange();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        d.redoChange();
      }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [d.canUndo, d.canRedo]);
  if (!s.job || s.job.status !== "ready" || !scene || !slide)
    return (
      <div className="editor-empty">
        <Loader2 size={25} className="spin" />
        <h2>
          {s.active
            ? t.progress
            : tr(
                "Select a completed version.",
                "Pilih versi yang sudah selesai.",
              )}
        </h2>
        <p>{s.active ? t.progressHelp : ""}</p>
      </div>
    );
  const groupIndex =
    d.plan?.slides.findIndex((p) =>
      p.blockIds.some((id) => slide.blockIds.includes(id)),
    ) ?? -1;
  const group = groupIndex >= 0 ? d.plan?.slides[groupIndex] : undefined;
  const groupBlocks =
    group?.blockIds
      .map((id) => blocks.find((b) => b.id === id))
      .filter(Boolean) || [];
  const frozen = s.active || s.busy || s.draft.mode !== s.job.settings.mode || s.draft.source !== s.job.source;
  const canExport =
    s.job.status === "ready" && !d.dirty && !s.active && !s.busy;
  const imageUrl =
    s.settings.assetId && s.draft.id
      ? `/api/projects/${s.draft.id}/image/${s.settings.assetId}`
      : undefined;
  const groupAssetId =
    group?.imageId && group.imageId !== "city" ? group.imageId : null;
  const editableBlocks = (group?.blockIds || []).filter((id) =>
    slide.objects.some((object) => object.sourceId === id &&
      (object.type === "text" || object.type === "table")),
  );
  const editableBlockId = selectedSourceId && editableBlocks.includes(selectedSourceId)
    ? selectedSourceId : editableBlocks[0] || null;
  const currentOffset = editableBlockId ? group?.offsets?.[editableBlockId] : undefined;
  function nudge(dx: number, dy: number, sourceId = editableBlockId) {
    if (frozen || !d.plan || !group || !sourceId || !editableBlocks.includes(sourceId)) return;
    const previous = group.offsets?.[sourceId];
    const nextX = Math.round(((previous?.dx || 0) + dx) * 100) / 100;
    const nextY = Math.round(((previous?.dy || 0) + dy) * 100) / 100;
    if (Math.abs(nextX) > 0.75 || Math.abs(nextY) > 0.75) return;
    if (nextX === (previous?.dx || 0) && nextY === (previous?.dy || 0)) return;
    const offsets = { ...(group.offsets || {}) };
    if (nextX === 0 && nextY === 0) delete offsets[sourceId];
    else offsets[sourceId] = { dx: nextX, dy: nextY };
    d.changePlan({
      ...d.plan,
      slides: d.plan.slides.map((item, i) =>
        i === groupIndex ? { ...item, offsets: Object.keys(offsets).length ? offsets : undefined } : item),
    });
  }
  function layout(value: LayoutId) {
    if (!d.plan || !group) return;
    d.changePlan({
      ...d.plan,
      slides: d.plan.slides.map((p, i) =>
        i === groupIndex
          ? { ...p, layout: value, imageId: value === "photo" ? "city" : null }
          : p,
      ),
    });
  }
  function photo(imageId: string | null) {
    if (!d.plan || !group) return;
    d.changeDesign(
      {
        ...d.plan,
        slides: d.plan.slides.map((item, itemIndex) =>
          itemIndex === groupIndex
            ? {
                ...item,
                layout: imageId ? ("photo" as const) : ("editorial" as const),
                imageId,
              }
            : item,
        ),
      },
      {
        ...s.settings,
        images: !!imageId || s.settings.images,
        assetId: null,
      },
    );
  }
  function split() {
    if (!d.plan || !group || group.blockIds.length < 2) return;
    const mid = Math.ceil(group.blockIds.length / 2);
    const first = group.blockIds.slice(0, mid);
    const second = group.blockIds.slice(mid);
    const slides = [...d.plan.slides];
    slides.splice(
      groupIndex,
      1,
      { ...group, blockIds: first, offsets: retainBlockOffsets(group.offsets, first) },
      {
        ...group,
        id: "split-" + Date.now(),
        blockIds: second,
        offsets: retainBlockOffsets(group.offsets, second),
        layout: "editorial",
        imageId: null,
      },
    );
    d.changePlan({ ...d.plan, slides });
  }
  function merge() {
    if (!d.plan || !group || !d.plan.slides[groupIndex + 1]) return;
    const slides = [...d.plan.slides];
    const next = slides[groupIndex + 1];
    const blockIds = [...group.blockIds, ...next.blockIds];
    slides.splice(groupIndex, 2, {
      ...group,
      blockIds,
      offsets: retainBlockOffsets({ ...group.offsets, ...next.offsets }, blockIds),
      layout: "editorial",
      imageId: null,
    });
    d.changePlan({ ...d.plan, slides });
  }
  function normalizeGroup<T extends { blockIds: string[]; layout: LayoutId }>(
    candidate: T,
  ): T {
    const kinds = candidate.blockIds.map(
      (id) => blocks.find((block) => block.id === id)?.kind,
    );
    const sectionValid =
      candidate.blockIds.length === 1 && kinds[0] === "heading";
    const tablePresent = kinds.includes("table");
    if (
      (candidate.layout === "section" && !sectionValid) ||
      (candidate.layout === "table" && !tablePresent) ||
      (candidate.layout === "photo" && tablePresent)
    )
      return { ...candidate, layout: "editorial" };
    return candidate;
  }
  function shiftFirstToPrevious(targetIndex = groupIndex) {
    if (!d.plan || targetIndex <= 0) return;
    const currentGroup = d.plan.slides[targetIndex];
    if (!currentGroup || currentGroup.blockIds.length < 2) return;
    const slides = d.plan.slides.map((item) => ({
      ...item,
      blockIds: [...item.blockIds],
    }));
    const moved = slides[targetIndex].blockIds.shift()!;
    transferBlockOffset(slides[targetIndex], slides[targetIndex - 1], moved);
    slides[targetIndex - 1].blockIds.push(moved);
    slides[targetIndex - 1] = normalizeGroup(slides[targetIndex - 1]);
    slides[targetIndex] = normalizeGroup(slides[targetIndex]);
    d.changePlan({ ...d.plan, slides });
  }
  function shiftLastToNext(targetIndex = groupIndex) {
    if (!d.plan || targetIndex < 0 || targetIndex >= d.plan.slides.length - 1)
      return;
    const currentGroup = d.plan.slides[targetIndex];
    if (!currentGroup || currentGroup.blockIds.length < 2) return;
    const slides = d.plan.slides.map((item) => ({
      ...item,
      blockIds: [...item.blockIds],
    }));
    const moved = slides[targetIndex].blockIds.pop()!;
    transferBlockOffset(slides[targetIndex], slides[targetIndex + 1], moved);
    slides[targetIndex + 1].blockIds.unshift(moved);
    slides[targetIndex] = normalizeGroup(slides[targetIndex]);
    slides[targetIndex + 1] = normalizeGroup(slides[targetIndex + 1]);
    d.changePlan({ ...d.plan, slides });
  }
  function selectGroup(planIndex: number) {
    const firstBlock = d.plan?.slides[planIndex]?.blockIds[0];
    if (!firstBlock || !scene) return;
    const sceneIndex = scene.slides.findIndex((item) =>
      item.blockIds.includes(firstBlock),
    );
    if (sceneIndex >= 0) setIndex(sceneIndex);
  }
  async function uploadPhoto(f?: File) {
    if (!f || !s.draft.id) return;
    s.setBusy(true);
    s.setError(null);
    try {
      if (f.size > 2 * 1024 * 1024) throw new ApiError("IMAGE_TYPE");
      const bytes = new Uint8Array(await f.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.slice(i, i + 8192));
      const r = await api("/projects/" + s.draft.id + "/image", "POST", {
        base64: btoa(binary),
      });
      photo(r.assetId);
    } catch (e) {
      s.setError(e);
    } finally {
      s.setBusy(false);
    }
  }
  async function version(id: string) {
    s.setBusy(true);
    s.setError(null);
    try {
      const r = await api<{ generation: Job }>("/generations/" + id);
      s.setJob(r.generation);
      s.setSettings(r.generation.settings);
    } catch (e) {
      s.setError(e);
    } finally {
      s.setBusy(false);
    }
  }
  const slideContent = (shownIndex: number) => {
    const selected = scene.slides[shownIndex];
    return !d.dirty && s.job?.preview === "rendered" ? (
      <img
        src={`/api/generations/${s.job.id}/preview/${shownIndex}`}
        alt={`${t.preview} ${shownIndex + 1}`}
      />
    ) : (
      <Slide
        slide={selected}
        generationId={s.job?.id}
        imageUrl={imageUrl}
        projectId={s.draft.id || undefined}
        label={`${t.preview} ${shownIndex + 1}`}
      />
    );
  };
  if (present)
    return (
      <div
        className="present-mode"
        ref={presentDialog}
        role="dialog"
        aria-modal="true"
        aria-label="Presentation mode"
      >
        <button className="button quiet" onClick={() => setPresent(false)}>
          <X size={18} />
          {tr("Exit · Esc", "Keluar · Esc")}
        </button>
        <div className="present-slide">{slideContent(index)}</div>
        <div className="present-controls">
          <button
            className="icon-button"
            aria-label="Previous slide"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft />
          </button>
          <span>
            {index + 1} / {scene.slides.length}
          </span>
          <button
            className="icon-button"
            aria-label="Next slide"
            disabled={index === scene.slides.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    );
  return (
    <div className="editor">
      <div className="editor-toolbar">
        <div>
          <button
            className="icon-button"
            aria-label="Undo design change"
            disabled={!d.canUndo || frozen}
            onClick={d.undoChange}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo design change"
            disabled={!d.canRedo || frozen}
            onClick={d.redoChange}
          >
            <Redo2 size={17} />
          </button>
          <span className="toolbar-divider" />
          <button
            className="text-button"
            disabled={!d.dirty || frozen}
            onClick={d.restore}
          >
            <RotateCcw size={14} />
            {tr("Reset changes", "Reset perubahan")}
          </button>
        </div>
        <div>
          <button
            type="button"
            className={canvasPositionMode ? "button canvas-position-toggle active" : "button quiet canvas-position-toggle"}
            aria-label="Toggle canvas position editing"
            aria-pressed={canvasPositionMode}
            disabled={frozen || !editableBlocks.length}
            onClick={() => { setCanvasPositionMode((value) => !value); setPanel(true); setTab("design"); }}
          >
            <MousePointer2 size={15} />
            {tr("Move on slide", "Geser di slide")}
          </button>
          <button type="button" className="button quiet" onClick={() => { setPanel(true); setTab("source"); }}>Edit text</button>
          <span className="preview-label">
            {d.dirty
              ? tr("Design draft", "Draf desain")
              : s.job.preview === "rendered"
                ? t.finalPreview
                : t.layoutPreview}
          </span>
          <select
            aria-label="Canvas zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[75, 100, 125, 150].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
          <button
            className="button quiet"
            aria-label="Present slides"
            onClick={() => setPresent(true)}
          >
            <Play size={14} />
            {tr("Present", "Presentasikan")}
          </button>
          <button
            className="icon-button"
            aria-label="Toggle inspector"
            aria-expanded={panel}
            onClick={() => setPanel(!panel)}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>
      <div className={`editor-grid ${panel ? "" : "no-inspector"}`}>
        <aside className="slide-list" aria-label="Slide thumbnails">
          <div>
            {scene.slides.length} {t.slides}
          </div>
          {scene.slides.map((slide, i) => (
            <button
              key={slide.id}
              aria-label={`Slide ${i + 1}`}
              aria-pressed={index === i}
              className={index === i ? "selected" : ""}
              onClick={() => setIndex(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>{slideContent(i)}</div>
            </button>
          ))}
        </aside>
        <section className="canvas-column">
          <div className="canvas-scroll">
            <div
              className="canvas-frame"
              style={{
                width: zoom + "%",
                maxWidth: zoom > 100 ? "none" : undefined,
              }}
            >
              {slideContent(index)}
              {canvasPositionMode && (
                <CanvasPositionOverlay
                  slide={slide}
                  eligibleIds={editableBlocks}
                  selectedId={editableBlockId}
                  offsets={group?.offsets}
                  step={nudgeStep}
                  disabled={frozen}
                  onSelect={setSelectedSourceId}
                  onMove={(sourceId, dx, dy) => nudge(dx, dy, sourceId)}
                  lang={lang}
                />
              )}
            </div>
          </div>
          {canvasPositionMode && (
            <div className="canvas-position-hint" role="status">
              <MousePointer2 size={14} />
              {tr("Drag a highlighted text/table block, or use arrow keys. Click Apply design to save to PPTX.",
                  "Tarik blok teks/tabel, atau gunakan tombol panah. Klik Terapkan desain untuk menyimpan ke PPTX.")}
            </div>
          )}
          <div className="canvas-footer">
            <span>
              {s.job.plan?.ai?.outcome === "used"
                ? s.job.plan.ai.model
                : s.job.plan?.ai?.outcome === "manual"
                  ? tr("Manual design", "Desain manual")
                  : t.engineRules}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous slide"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {index + 1} / {scene.slides.length}
              </span>
              <button
                className="icon-button"
                aria-label="Next slide"
                disabled={index === scene.slides.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <IntegrityBadge
              label={
                d.dirty
                  ? tr("Draft text checked", "Teks draf diperiksa")
                  : t.textVerified
              }
            />
          </div>
          {d.previewBusy && (
            <div className="preview-progress" role="status">
              <Loader2 size={15} className="spin" />
              {tr("Updating layout preview…", "Memperbarui preview layout…")}
            </div>
          )}
          <ErrorBanner
            error={d.previewError}
            lang={lang}
            dismiss={() => d.restore()}
          />
          {s.job.plan?.warning && (
            <div className="notice">
              <Eye size={16} />
              {s.job.plan.warning}
            </div>
          )}
          {s.job.previewWarning && (
            <p className="help-text preview-disclaimer">
              {s.job.previewWarning}
            </p>
          )}
          {d.dirty && (
            <div className="design-commit">
              <div>
                <strong>
                  {tr(
                    "Your design changes are ready.",
                    "Perubahan desain siap diterapkan.",
                  )}
                </strong>
                <span>
                  {tr(
                    "No AI request. Your source stays exactly the same.",
                    "Tanpa pemanggilan AI. Sumber tetap sama persis.",
                  )}
                </span>
              </div>
              <button
                className="button primary"
                disabled={
                  frozen || d.previewBusy || !!d.previewError || !d.preview
                }
                onClick={d.apply}
              >
                {s.busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Check size={16} />
                )}{" "}
                {t.regenerate}
              </button>
            </div>
          )}
        </section>
        {panel && (
          <aside className="inspector">
            <details className="presenter-notes-panel">
              <summary><NotebookPen size={16} /> {tr("Presenter notes", "Catatan presenter")}</summary>
              <p>{tr("Source-based text, included in PPTX and editable in PowerPoint. Not AI-generated.", "Teks dari sumber, disertakan dalam PPTX dan dapat diedit di PowerPoint. Bukan hasil AI.")}</p>
              <textarea
                aria-label="Slide presenter notes"
                readOnly
                value={slideNotes(slide, index + 1, scene.slides.length)}
                rows={5}
              />
            </details>
            <div className="inspector-tabs" role="tablist">
              {(["outline", "design", "assets", "source"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={tab === v}
                  onClick={() => setTab(v)}
                >
                  {v === "outline" ? (
                    <ListTree size={15} />
                  ) : v === "design" ? (
                    <SlidersHorizontal size={15} />
                  ) : v === "assets" ? (
                    <Image size={15} />
                  ) : (
                    <ShieldCheck size={15} />
                  )}{" "}
                  {v === "outline"
                    ? tr("Outline", "Struktur")
                    : v === "design"
                      ? t.design
                      : v === "assets"
                        ? tr("Assets", "Aset")
                        : t.source}
                </button>
              ))}
            </div>
            <div className="inspector-body" role="tabpanel">
              {tab === "outline" ? (
                <>
                  <div className="outline-heading">
                    <div>
                      <span className="eyebrow">
                        {tr("Source-locked story", "Alur terkunci sumber")}
                      </span>
                      <h2>{tr("Slide outline", "Struktur slide")}</h2>
                    </div>
                    <span>{d.plan?.slides.length || 0}</span>
                  </div>
                  <p className="help-text">
                    {tr(
                      "Adjust slide boundaries without changing the original order. Content cannot be deleted or duplicated.",
                      "Atur batas slide tanpa mengubah urutan asli. Konten tidak dapat dihapus atau diduplikasi.",
                    )}
                  </p>
                  <div className="outline-list">
                    {d.plan?.slides.map((item, planIndex) => {
                      const itemBlocks = item.blockIds
                        .map((blockId) =>
                          blocks.find((block) => block.id === blockId),
                        )
                        .filter(Boolean);
                      const selected = planIndex === groupIndex;
                      return (
                        <article
                          key={item.id}
                          className={selected ? "selected" : ""}
                        >
                          <button
                            className="outline-select"
                            aria-label={`Outline slide ${planIndex + 1}`}
                            aria-pressed={selected}
                            onClick={() => selectGroup(planIndex)}
                          >
                            <span>
                              {String(planIndex + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <strong>
                                {itemBlocks[0]?.text.slice(0, 72) ||
                                  tr("Untitled group", "Grup tanpa judul")}
                              </strong>
                              <small>
                                {item.layout} · {item.blockIds.length}{" "}
                                {t.blocks}
                              </small>
                            </div>
                          </button>
                          {selected && (
                            <div className="outline-boundaries">
                              <button
                                className="icon-button"
                                aria-label="Move first block to previous slide"
                                title={tr(
                                  "Move first block to previous slide",
                                  "Pindahkan blok pertama ke slide sebelumnya",
                                )}
                                disabled={
                                  frozen ||
                                  planIndex === 0 ||
                                  item.blockIds.length < 2
                                }
                                onClick={() => shiftFirstToPrevious(planIndex)}
                              >
                                <ArrowUpToLine size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label="Move last block to next slide"
                                title={tr(
                                  "Move last block to next slide",
                                  "Pindahkan blok terakhir ke slide berikutnya",
                                )}
                                disabled={
                                  frozen ||
                                  planIndex ===
                                    (d.plan?.slides.length || 0) - 1 ||
                                  item.blockIds.length < 2
                                }
                                onClick={() => shiftLastToNext(planIndex)}
                              >
                                <ArrowDownToLine size={15} />
                              </button>
                              <span>{tr("Move boundary", "Geser batas")}</span>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : tab === "design" ? (
                <>
                  <section className="inspector-section">
                    <h2>{t.layout}</h2>
                    <div className="layout-grid">
                      {layouts.map((value) => {
                        const unavailable =
                          (value === "photo" && !s.settings.images) ||
                          (value === "table" &&
                            !groupBlocks.some((b) => b?.kind === "table")) ||
                          (value === "section" &&
                            (groupBlocks.length !== 1 ||
                              groupBlocks[0]?.kind !== "heading"));
                        return (
                          <button
                            key={value}
                            aria-label={`Layout ${value}`}
                            title={
                              unavailable
                                ? tr(
                                    "Not available for this source group.",
                                    "Tidak tersedia untuk kelompok sumber ini.",
                                  )
                                : value
                            }
                            aria-pressed={group?.layout === value}
                            disabled={frozen || unavailable}
                            className={
                              group?.layout === value ? "selected" : ""
                            }
                            onClick={() => layout(value)}
                          >
                            <span className={`layout-icon ${value}`}>
                              <i />
                              <i />
                              <i />
                            </span>
                            <span>{value}</span>
                          </button>
                        );
                      })}
                    </div>
                    <section className="position-editor" aria-label="Block position editor">
                      <h3>{tr("Position text / table", "Posisi teks / tabel")}</h3>
                      <p className="help-text">{tr(
                        "Select a block here or use Move on slide to drag it. Updates are verified before export; source wording is locked.",
                        "Pilih blok di sini atau aktifkan Geser di slide untuk menariknya. Perubahan diverifikasi sebelum ekspor; teks sumber terkunci.",
                      )}</p>
                      <label className="field">
                        {tr("Select source block", "Pilih blok sumber")}
                        <select
                          aria-label="Select editable source block"
                          value={editableBlockId || ""}
                          disabled={frozen || !editableBlocks.length}
                          onChange={(e) => setSelectedSourceId(e.target.value)}
                        >
                          {!editableBlocks.length && <option value="">—</option>}
                          {editableBlocks.map((id) => (
                            <option key={id} value={id}>
                              {blocks.find((b) => b.id === id)?.text.slice(0, 48) || id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field position-increment">
                        {tr("Move step", "Langkah geser")}
                        <select aria-label="Move step size" value={nudgeStep}
                          disabled={frozen || !editableBlockId}
                          onChange={(e) => setNudgeStep(Number(e.target.value) as 0.05 | 0.1 | 0.25)}>
                          <option value={0.05}>0.05″</option>
                          <option value={0.1}>0.10″</option>
                          <option value={0.25}>0.25″</option>
                        </select>
                      </label>
                      <div className="position-step-buttons">
                        <button className="button quiet" aria-label="Move block left"
                          disabled={frozen || !editableBlockId || (currentOffset?.dx || 0) - nudgeStep < -0.75}
                          onClick={() => nudge(-nudgeStep, 0)}>←</button>
                        <button className="button quiet" aria-label="Move block up"
                          disabled={frozen || !editableBlockId || (currentOffset?.dy || 0) - nudgeStep < -0.75}
                          onClick={() => nudge(0, -nudgeStep)}>↑</button>
                        <button className="button quiet" aria-label="Move block down"
                          disabled={frozen || !editableBlockId || (currentOffset?.dy || 0) + nudgeStep > 0.75}
                          onClick={() => nudge(0, nudgeStep)}>↓</button>
                        <button className="button quiet" aria-label="Move block right"
                          disabled={frozen || !editableBlockId || (currentOffset?.dx || 0) + nudgeStep > 0.75}
                          onClick={() => nudge(nudgeStep, 0)}>→</button>
                      </div>
                      <div className="position-readout">
                        <span aria-label="Block displacement">
                          X {(currentOffset?.dx || 0).toFixed(2)}″ · Y {(currentOffset?.dy || 0).toFixed(2)}″
                        </span>
                        <button className="text-button" aria-label="Reset block position"
                          disabled={frozen || !editableBlockId || (!currentOffset?.dx && !currentOffset?.dy)}
                          onClick={() => nudge(-(currentOffset?.dx || 0), -(currentOffset?.dy || 0))}>
                          {tr("Reset position", "Reset posisi")}
                        </button>
                      </div>
                    </section>
                    <div className="group-actions">
                      <button
                        className="button ai-action"
                        disabled={frozen || !group || d.assistantBusy}
                        onClick={() => group && d.suggest(group.id)}
                      >
                        {d.assistantBusy ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        {tr("AI restyle slide", "AI tata ulang slide")}
                      </button>
                      <button
                        className="button quiet"
                        disabled={frozen || !group || group.blockIds.length < 2}
                        onClick={split}
                      >
                        <Split size={14} />
                        {tr("Split group", "Pisah grup")}
                      </button>
                      <button
                        className="button quiet"
                        disabled={
                          frozen ||
                          groupIndex < 0 ||
                          !d.plan?.slides[groupIndex + 1]
                        }
                        onClick={merge}
                      >
                        <GitMerge size={14} />
                        {tr("Merge next", "Gabung berikutnya")}
                      </button>
                    </div>
                    {d.suggestion && d.suggestion.slideId === group?.id && (
                      <div className="assistant-result" role="status">
                        <Sparkles size={15} />
                        <div>
                          <strong>
                            {d.suggestion.trace.outcome === "used"
                              ? tr(
                                  "AI suggestion applied",
                                  "Saran AI diterapkan",
                                )
                              : tr(
                                  "Safe fallback applied",
                                  "Fallback aman diterapkan",
                                )}
                          </strong>
                          <span>
                            {d.suggestion.layout} ·{" "}
                            {d.suggestion.trace.model || "layout engine"}
                            {d.suggestion.trace.reason
                              ? ` · ${d.suggestion.trace.reason}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="help-text">
                      {tr(
                        "A source group can span multiple slides. Layout changes apply to the entire group.",
                        "Satu grup sumber dapat mencakup beberapa slide. Perubahan layout berlaku untuk seluruh grup.",
                      )}
                    </p>
                  </section>
                  <DesignControls
                    compact
                    settings={s.settings}
                    onChange={d.changeSettings}
                    lang={lang}
                    disabled={frozen}
                  />
                </>
              ) : tab === "assets" ? (
                <>
                  <h2>{tr("Photography", "Foto")}</h2>
                  <Toggle
                    label={t.photos}
                    checked={s.settings.images}
                    onChange={(v) =>
                      d.changeSettings({ ...s.settings, images: v })
                    }
                    disabled={frozen}
                  />
                  <p className="help-text">{t.photosHelp}</p>
                  <input
                    hidden
                    ref={photoFile}
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => {
                      uploadPhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="button full"
                    onClick={() => photoFile.current?.click()}
                    disabled={frozen || !group}
                  >
                    <Upload size={16} />
                    {tr("Upload your photograph", "Unggah foto sendiri")}
                  </button>
                  <p className="help-text">JPEG / PNG · 2 MB · 16 MP</p>
                  {groupAssetId && (
                    <>
                      <img
                        className="asset-preview"
                        src={`/api/projects/${s.draft.id}/image/${groupAssetId}`}
                        alt="Selected photograph"
                      />
                      <button
                        className="text-button"
                        disabled={frozen}
                        onClick={() => photo(null)}
                      >
                        {tr("Remove from this slide", "Hapus dari slide ini")}
                      </button>
                    </>
                  )}
                  {!groupAssetId && group?.imageId !== "city" && (
                    <button
                      className="text-button"
                      disabled={frozen || !group}
                      onClick={() => photo("city")}
                    >
                      {tr("Use reference image", "Gunakan foto referensi")}
                    </button>
                  )}
                  <div className="notice">
                    {tr(
                      "The image is assigned to the selected source group only. Images never replace source text.",
                      "Gambar hanya digunakan pada grup sumber yang dipilih. Gambar tidak menggantikan teks sumber.",
                    )}
                  </div>
                </>
              ) : (
                <>
                  <TemplateTextEditor studio={s} blocks={blocks} blockId={editableBlockId} disabled={frozen || d.dirty}
                    disabledReason={s.draft.source !== s.job.source ? "Open the latest source version to edit its text. Earlier exports remain downloadable." : undefined} />
                  <div className="integrity-card">
                    <ShieldCheck size={29} />
                    <h3>
                      {d.dirty
                        ? tr("Draft text checked", "Teks draf diperiksa")
                        : t.textVerified}
                    </h3>
                    <p>
                      {s.job.report?.blocks || blocks.length} {t.blocks}
                    </p>
                    <div>
                      {[t.changed, t.missing, t.added, t.duplicates].map(
                        (label) => (
                          <span key={label}>
                            <strong>0</strong>
                            {label}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <section className="inspector-section">
                    <h2>
                      {t.original}
                      <LockKeyhole size={14} />
                    </h2>
                    <p className="help-text">{t.snapshot}</p>
                    <div className="source-blocks">
                      {blocks
                        .filter((b) => slide.blockIds.includes(b.id))
                        .map((b) => (
                          <article key={b.id}>
                            <span>
                              {b.kind} · {b.id}
                            </span>
                            <p>{b.text}</p>
                          </article>
                        ))}
                    </div>
                  </section>
                  <h2>{t.sourceHash}</h2>
                  <code className="fingerprint">{s.job.sourceHash}</code>
                  <section className="ai-trace">
                    <h2>{tr("AI trace", "Jejak AI")}</h2>
                    <dl>
                      <div>
                        <dt>{tr("Outcome", "Hasil")}</dt>
                        <dd>
                          {s.job.plan?.ai?.outcome || "legacy / untracked"}
                        </dd>
                      </div>
                      <div>
                        <dt>Model</dt>
                        <dd>{s.job.plan?.ai?.model || "—"}</dd>
                      </div>
                      <div>
                        <dt>Tokens</dt>
                        <dd>
                          {s.job.plan?.usage
                            ? (
                                s.job.plan.usage.input + s.job.plan.usage.output
                              ).toLocaleString(lang)
                            : "—"}
                        </dd>
                      </div>
                      {s.job.plan?.ai?.reason && (
                        <div>
                          <dt>{tr("Reason", "Alasan")}</dt>
                          <dd>{s.job.plan.ai.reason}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                  <section className="quality-trace">
                    <h2>{tr("Design quality", "Kualitas desain")}</h2>
                    <dl>
                      <div>
                        <dt>Status</dt>
                        <dd>{s.job.report?.quality?.status || "legacy"}</dd>
                      </div>
                      <div>
                        <dt>{tr("Overflow", "Teks keluar")}</dt>
                        <dd>{s.job.report?.quality?.overflow ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>{tr("Overlaps", "Tumpang tindih")}</dt>
                        <dd>{s.job.report?.quality?.overlaps ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>{tr("Minimum text", "Teks minimum")}</dt>
                        <dd>
                          {s.job.report?.quality?.minimumFontSize
                            ? `${s.job.report.quality.minimumFontSize} pt`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </>
              )}
              <section className="inspector-section versions">
                <div className="version-heading">
                  <History size={15} />
                  <h2>{t.history}</h2>
                  <span>{s.history.length}</span>
                </div>
                <label className="field version-select">
                  {tr("Selected version", "Versi terpilih")}
                  <select
                    aria-label={t.history}
                    value={s.job.id}
                    disabled={s.busy || s.active}
                    onChange={(e) => version(e.target.value)}
                  >
                    {!s.history.some((h) => h.id === s.job!.id) && (
                      <option value={s.job.id}>
                        {new Date(s.job.createdAt).toLocaleString(lang)}
                      </option>
                    )}
                    {s.history.map((h) => (
                      <option key={h.id} value={h.id}>
                        {new Date(h.createdAt).toLocaleString(lang)} ·{" "}
                        {h.kind || "generation"} · {h.status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="version-list">
                  {s.history.slice(0, 5).map((item, versionIndex) => (
                    <button
                      key={item.id}
                      className={item.id === s.job!.id ? "selected" : ""}
                      disabled={s.busy || s.active || item.status !== "ready"}
                      onClick={() => version(item.id)}
                    >
                      <span>V{s.history.length - versionIndex}</span>
                      <div>
                        <strong>
                          {item.kind === "text-edit" ? "Text revision" : item.kind === "design"
                            ? tr("Design revision", "Revisi desain")
                            : tr("Generated deck", "Hasil generation")}
                        </strong>
                        <small>
                          {new Date(item.createdAt).toLocaleString(lang)} ·{" "}
                          {item.plan?.ai?.outcome || item.status}
                        </small>
                      </div>
                      {item.id === s.job!.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
                {s.history[0]?.id !== s.job.id && (
                  <button
                    className="button quiet full restore-version"
                    disabled={frozen}
                    title={s.draft.source !== s.job.source ? "Earlier source versions remain available for download." : undefined}
                    onClick={d.apply}
                  >
                    <History size={14} />
                    {tr(
                      "Restore as new version",
                      "Pulihkan sebagai versi baru",
                    )}
                  </button>
                )}
              </section>
            </div>
          </aside>
        )}
      </div>
      <div className="editor-exportbar">
        <span>
          <LockKeyhole size={14} />
          {s.job.kind === "text-edit" ? "Edited source revision verified" : "Source revision preserved"}
        </span>
        <div>
          <button
            className="button quiet"
            disabled={!canExport}
            onClick={() => window.location.assign("/api/generations/" + s.job!.id + "/notes")}
          >
            <NotebookPen size={15} />
            {tr("Notes", "Catatan")}
          </button>
          <button
            className="button quiet"
            disabled={!canExport}
            onClick={() =>
              window.location.assign(
                "/api/generations/" + s.job!.id + "/validation",
              )
            }
          >
            <ShieldCheck size={15} />
            {tr("Validation", "Validasi")}
          </button>
          <button
            className="button quiet"
            disabled={!canExport || s.job.preview !== "rendered"}
            onClick={() =>
              window.location.assign("/api/generations/" + s.job!.id + "/pdf")
            }
          >
            <Download size={15} />
            PDF
          </button>
          <button
            className="button primary"
            disabled={!canExport}
            onClick={() =>
              window.location.assign(
                "/api/generations/" + s.job!.id + "/export",
              )
            }
          >
            <Download size={16} />
            {t.export}
          </button>
        </div>
      </div>
    </div>
  );
}
