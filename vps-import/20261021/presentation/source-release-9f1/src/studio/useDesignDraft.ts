import { useState, useEffect, useRef } from "react";
import type { Plan, Settings, Scene } from "../../core/types";
import type { SlideSuggestion } from "../../core/slide-assistant";
import { api } from "../api";
import { manualPlan, visualKey } from "./types";
import type { Studio } from "./useStudio";
export function useDesignDraft(s: Studio) {
  const [plan, setPlan] = useState<Plan | null>(null),
    [preview, setPreview] = useState<Scene | null>(null),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewError, setPreviewError] = useState<unknown>(null),
    [assistantBusy, setAssistantBusy] = useState(false),
    [suggestion, setSuggestion] = useState<SlideSuggestion | null>(null);
  const [undo, setUndo] = useState<{ plan: Plan; settings: Settings }[]>([]),
    [redo, setRedo] = useState<{ plan: Plan; settings: Settings }[]>([]);
  const planRef = useRef(plan);
  planRef.current = plan;
  useEffect(() => {
    if (!s.job?.plan) return;
    const base = manualPlan(s.job.plan);
    let restored: { plan: Plan; settings: Settings } | null = null;
    try {
      const raw = window.sessionStorage.getItem("verbatim-design:" + s.job.id);
      if (raw) {
        const value = JSON.parse(raw);
        if (
          value?.version === 1 &&
          value.baseId === s.job.id &&
          Date.now() - value.savedAt < 7 * 24 * 60 * 60 * 1000 &&
          Array.isArray(value.plan?.slides) &&
          value.plan.slides.length > 0
        )
          restored = { plan: value.plan, settings: value.settings };
      }
    } catch {
      window.sessionStorage.removeItem("verbatim-design:" + s.job.id);
    }
    setPlan(restored?.plan || base);
    if (restored?.settings) s.setSettings(restored.settings);
    setPreview(null);
    setPreviewError(null);
    setSuggestion(null);
    setUndo([]);
    setRedo([]);
  }, [s.job?.id, !!s.job?.plan]);
  const effectivePlan = plan
    ? {
        ...plan,
        slides: plan.slides.map((x) => ({
          ...x,
          ...(!s.settings.images && x.layout === "photo"
            ? { layout: "editorial" as const, imageId: null }
            : {}),
        })),
      }
    : null;
  const planKey = JSON.stringify(effectivePlan),
    styleKey = visualKey(s.settings);
  const dirty =
    !!s.job?.plan &&
    !!effectivePlan &&
    (styleKey !== visualKey(s.job.settings) ||
      planKey !== JSON.stringify(manualPlan(s.job.plan)));
  useEffect(() => {
    if (!s.job?.id || !effectivePlan) return;
    const key = "verbatim-design:" + s.job.id;
    if (!dirty) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        baseId: s.job.id,
        plan: effectivePlan,
        settings: s.settings,
        savedAt: Date.now(),
      }),
    );
  }, [s.job?.id, planKey, styleKey, dirty]);
  useEffect(() => {
    if (!dirty || !s.job || !effectivePlan || s.active) {
      setPreview(null);
      setPreviewBusy(false);
      return;
    }
    const controller = new AbortController();
    setPreviewBusy(true);
    setPreviewError(null);
    const timer = setTimeout(() => {
      api<{ scene: Scene }>(
        "/generations/" + s.job!.id + "/design-preview",
        "POST",
        { settings: s.settings, plan: effectivePlan },
        controller.signal,
      )
        .then((r) => {
          if (!controller.signal.aborted) setPreview(r.scene);
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setPreview(null);
            setPreviewError(e);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewBusy(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [s.job?.id, planKey, styleKey, dirty, s.active]);
  function snapshot() {
    return {
      plan: structuredClone(planRef.current!),
      settings: structuredClone(s.settings),
    };
  }
  function record() {
    if (planRef.current) setUndo((v) => [...v, snapshot()].slice(-40));
    setRedo([]);
  }
  function changeSettings(settings: Settings) {
    record();
    s.setSettings(settings);
  }
  function changePlan(next: Plan) {
    record();
    planRef.current = next;
    setPlan(next);
  }
  function changeDesign(nextPlan: Plan, nextSettings: Settings) {
    record();
    planRef.current = nextPlan;
    setPlan(nextPlan);
    s.setSettings(nextSettings);
  }
  function restore() {
    if (!s.job?.plan) return;
    record();
    setPlan(manualPlan(s.job.plan));
    s.setSettings(s.job.settings);
    setSuggestion(null);
    window.sessionStorage.removeItem("verbatim-design:" + s.job.id);
  }
  function undoChange() {
    const previous = undo.at(-1);
    if (!previous) return;
    setRedo((v) => [...v, snapshot()]);
    setUndo((v) => v.slice(0, -1));
    setPlan(previous.plan);
    s.setSettings(previous.settings);
  }
  function redoChange() {
    const next = redo.at(-1);
    if (!next) return;
    setUndo((v) => [...v, snapshot()]);
    setRedo((v) => v.slice(0, -1));
    setPlan(next.plan);
    s.setSettings(next.settings);
  }
  async function apply() {
    if (!s.job || !effectivePlan) return;
    s.setBusy(true);
    s.setError(null);
    const previousId = s.job.id;
    try {
      const response = await api<{ generation: { id: string } }>(
        "/generations/" + previousId + "/design",
        "POST",
        { settings: s.settings, plan: effectivePlan },
      );
      window.sessionStorage.removeItem("verbatim-design:" + previousId);
      const job = (await api("/generations/" + response.generation.id))
        .generation;
      s.setJob((current) => (current?.id === previousId ? job : current));
    } catch (e) {
      s.setError(e);
    } finally {
      s.setBusy(false);
    }
  }
  async function suggest(slideId: string) {
    if (!s.job || !effectivePlan || assistantBusy) return;
    setAssistantBusy(true);
    setPreviewError(null);
    try {
      const response = await api<{ suggestion: SlideSuggestion }>(
        "/generations/" + s.job.id + "/slide-suggestion",
        "POST",
        { settings: s.settings, plan: effectivePlan, slideId },
      );
      setSuggestion(response.suggestion);
      changePlan({
        ...effectivePlan,
        slides: effectivePlan.slides.map((slide) =>
          slide.id === slideId
            ? {
                ...slide,
                layout: response.suggestion.layout,
                imageId: response.suggestion.imageId,
              }
            : slide,
        ),
      });
    } catch (error) {
      setPreviewError(error);
    } finally {
      setAssistantBusy(false);
    }
  }
  return {
    plan: effectivePlan,
    preview,
    previewBusy,
    previewError,
    dirty,
    changeSettings,
    changePlan,
    changeDesign,
    restore,
    undoChange,
    redoChange,
    canUndo: !!undo.length,
    canRedo: !!redo.length,
    apply,
    suggest,
    suggestion,
    assistantBusy,
  };
}
