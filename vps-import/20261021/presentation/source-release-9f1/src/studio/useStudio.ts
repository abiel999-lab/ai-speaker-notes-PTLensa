import { useState, useRef, useCallback, useEffect } from "react";
import { api, ApiError } from "../api";
import type { Project, Settings } from "../../core/types";
import {
  DEFAULT_SETTINGS,
  type Job,
  type ProjectSummary,
  type Capabilities,
} from "./types";

type Draft = {
  id: string | null;
  name: string;
  source: string;
  mode: Settings["mode"];
  revision: number;
};
const blank = (): Draft => ({
  id: null,
  name: "",
  source: "",
  mode: "markdown",
  revision: 0,
});
export function useStudio() {
  const [draft, setDraft] = useState<Draft>(blank),
    [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [projects, setProjects] = useState<ProjectSummary[]>([]),
    [job, setJob] = useState<Job | null>(null),
    [history, setHistory] = useState<Job[]>([]);
  const [caps, setCaps] = useState<Capabilities>({
    ai: false,
    model: null,
    render: false,
    mode: "local",
    models: [],
    localAdmin: false,
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [saveState, setSaveState] = useState<
      "saved" | "saving" | "unsaved" | "failed"
    >("unsaved");
  const [analysis, setAnalysis] = useState<{
    words: number;
    blocks: { id: string; text: string; kind: string }[];
    headings: number;
  } | null>(null);
  const current = useRef(draft);
  current.current = draft;
  const epoch = useRef(0),
    saveTail = useRef<Promise<Project | null>>(Promise.resolve(null)),
    lastSaved = useRef("");
  const active =
    !!job && !["ready", "failed", "cancelled"].includes(job.status);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const listQuery = useRef({ search: "", sort: "recent", filter: "all" });
  const listVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++listVersion.current;
    const query = new URLSearchParams(listQuery.current);
    const data = await api<{ projects: ProjectSummary[]; nextOffset: number | null }>("/projects?" + query);
    if (version !== listVersion.current) return;
    setProjects(data.projects); setNextOffset(data.nextOffset ?? null);
  }, []);
  const searchProjects = useCallback(async (options: { search: string; sort: string; filter: string }) => {
    if (JSON.stringify(options) === JSON.stringify(listQuery.current)) return;
    listQuery.current = options;
    await refresh();
  }, [refresh]);
  async function loadMore() {
    if (nextOffset === null || listBusy) return;
    setListBusy(true);
    const version = listVersion.current;
    try {
      const query = new URLSearchParams({ ...listQuery.current, offset: String(nextOffset) });
      const data = await api<{ projects: ProjectSummary[]; nextOffset: number | null }>("/projects?" + query);
      if (version !== listVersion.current) return;
      setProjects(current => [...new Map([...current, ...data.projects].map(p => [p.id, p])).values()]);
      setNextOffset(data.nextOffset ?? null);
    } catch (error) { setError(error); }
    finally { setListBusy(false); }
  }
  useEffect(() => {
    let stopped = false;
    Promise.all([
      api("/session"),
      api<Capabilities>("/capabilities"),
      refresh(),
    ])
      .then(([, cap]) => {
        if (stopped) return;
        setCaps(cap);
        setSettings((s) => ({ ...s, useAI: cap.ai, model: undefined }));
      })
      .catch((e) => {
        if (!stopped) setError(e);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [refresh]);
  function edit(value: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...value }));
    setSaveState("unsaved");
  }
  function reset() {
    epoch.current++;
    lastSaved.current = "";
    const next = blank();
    current.current = next;
    setDraft(next);
    setJob(null);
    setHistory([]);
    setAnalysis(null);
    setSettings({
      ...DEFAULT_SETTINGS,
      useAI: caps.ai,
      model: undefined,
    });
    setError(null);
    setSaveState("unsaved");
  }
  const save = useCallback(async (): Promise<Project | null> => {
    const requestedEpoch = epoch.current;
    const work = saveTail.current
      .catch(() => null)
      .then(async () => {
        if (epoch.current !== requestedEpoch)
          throw new ApiError("DRAFT_CHANGED");
        const snapshot = { ...current.current };
        if (!snapshot.source.trim()) return null;
        const signature = JSON.stringify([
          snapshot.id,
          snapshot.name,
          snapshot.source,
          snapshot.mode,
        ]);
        if (signature === lastSaved.current) {
          const { project } = await api<{ project: Project }>(
            "/projects/" + snapshot.id,
          );
          if (
            project.source !== snapshot.source ||
            project.mode !== snapshot.mode ||
            project.name !== (snapshot.name.trim() || "Untitled presentation")
          )
            throw new ApiError("PROJECT_CONFLICT");
          return project;
        }
        setSaveState("saving");
        const payload = {
          name: snapshot.name.trim() || "Untitled presentation",
          source: snapshot.source,
          mode: snapshot.mode,
        };
        const response = await api<{ project: Project }>(
          snapshot.id ? "/projects/" + snapshot.id : "/projects",
          snapshot.id ? "PATCH" : "POST",
          {
            ...payload,
            ...(snapshot.id ? { expectedRevision: snapshot.revision } : {}),
          },
        );
        if (epoch.current !== requestedEpoch)
          throw new ApiError("DRAFT_CHANGED");
        current.current = {
          ...current.current,
          id: response.project.id,
          revision: response.project.revision || 0,
        };
        setDraft((d) => ({
          ...d,
          id: response.project.id,
          revision: response.project.revision || 0,
        }));
        lastSaved.current = JSON.stringify([
          response.project.id,
          snapshot.name,
          snapshot.source,
          snapshot.mode,
        ]);
        const unchanged =
          current.current.name === snapshot.name &&
          current.current.source === snapshot.source &&
          current.current.mode === snapshot.mode;
        setSaveState(unchanged ? "saved" : "unsaved");
        await refresh();
        return response.project;
      });
    saveTail.current = work;
    try {
      return await work;
    } catch (e) {
      if (requestedEpoch === epoch.current) setSaveState("failed");
      throw e;
    }
  }, [refresh]);
  useEffect(() => {
    if (!draft.source.trim() || active || loading) return;
    const timer = setTimeout(() => {
      save().catch(setError);
    }, 1100);
    return () => clearTimeout(timer);
  }, [draft.source, draft.name, draft.mode, active, loading, save]);
  useEffect(() => {
    if (!draft.source.trim()) {
      setAnalysis(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(
        "/analyze",
        "POST",
        { source: draft.source, mode: draft.mode },
        controller.signal,
      )
        .then(setAnalysis)
        .catch((e) => {
          if (!controller.signal.aborted) {
            setAnalysis(null);
            setError(e);
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft.source, draft.mode]);
  useEffect(() => {
    if (!job || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = job.id;
    async function poll() {
      try {
        const result = await api<{ generation: Job }>("/generations/" + id);
        if (stopped) return;
        setJob((j) => (j?.id === id ? result.generation : j));
        if (
          ["ready", "failed", "cancelled"].includes(result.generation.status)
        ) {
          await refresh();
          const p = await api<{ history: Job[] }>(
            "/projects/" + result.generation.projectId,
          );
          if (!stopped) setHistory(p.history);
          return;
        }
      } catch (e) {
        if (!stopped) setError(e);
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    timer = setTimeout(poll, 700);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job?.id, active, refresh]);
  async function open(id: string) {
    epoch.current++;
    const token = epoch.current;
    setBusy(true);
    setError(null);
    try {
      const { project, history: versions } = await api<{
        project: Project;
        history: Job[];
      }>("/projects/" + id);
      const generation = project.latestId
        ? (await api<{ generation: Job }>("/generations/" + project.latestId))
            .generation
        : null;
      if (token !== epoch.current) return;
      const next = {
        id: project.id,
        name: project.name,
        source: project.source,
        mode: project.mode,
        revision: project.revision || 0,
      };
      current.current = next;
      setDraft(next);
      lastSaved.current = JSON.stringify([
        next.id,
        next.name,
        next.source,
        next.mode,
      ]);
      setHistory(versions);
      setJob(generation);
      setSettings({
        ...DEFAULT_SETTINGS,
        ...(generation?.settings || {}),
        mode: project.mode,
      });
      setSaveState("saved");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError(null);
    const token = epoch.current;
    try {
      const project = await save();
      if (!project) throw new ApiError("EMPTY_SOURCE");
      if (token !== epoch.current) throw new ApiError("DRAFT_CHANGED");
      const response = await api<{ generation: { id: string } }>(
        "/projects/" + project.id + "/generate",
        "POST",
        { settings: { ...settings, mode: project.mode } },
      );
      const data = await api<{ generation: Job }>(
        "/generations/" + response.generation.id,
      );
      if (token === epoch.current) setJob(data.generation);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function editText(blockId: string, text: string) {
    if (!job || active || busy) return;
    const token = epoch.current;
    setBusy(true); setError(null);
    try {
      await saveTail.current;
      const response = await api<{ project: Project; generation: { id: string } }>("/generations/" + job.id + "/text", "POST", {
        blockId, text, expectedRevision: current.current.revision, expectedSourceHash: job.sourceHash,
      });
      if (token !== epoch.current) return;
      const p = response.project;
      const next = { id: p.id, name: p.name, source: p.source, mode: p.mode, revision: p.revision || 0 };
      current.current = next; setDraft(next);
      lastSaved.current = JSON.stringify([p.id, p.name, p.source, p.mode]);
      setSaveState("saved");
      const result = await api<{ generation: Job }>("/generations/" + response.generation.id);
      if (token === epoch.current) { setJob(result.generation); setSettings(result.generation.settings); }
      await refresh();
    } catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  async function sample() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ name: string; source: string }>("/sample");
      edit({ name: data.name, source: data.source, mode: "markdown" });
      setSettings((s) => ({ ...s, mode: "markdown" }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job) return;
    try {
      await api("/generations/" + job.id + "/cancel", "POST");
      const data = await api<{ generation: Job }>("/generations/" + job.id);
      setJob(data.generation);
    } catch (e) {
      setError(e);
    }
  }
  return {
    draft,
    edit,
    settings,
    setSettings,
    projects,
    nextOffset,
    listBusy,
    loadMore,
    searchProjects,
    job,
    setJob,
    history,
    setHistory,
    caps,
    loading,
    busy,
    setBusy,
    error,
    setError,
    saveState,
    analysis,
    active,
    save,
    reset,
    refresh,
    open,
    start,
    editText,
    sample,
    cancel,
  };
}
export type Studio = ReturnType<typeof useStudio>;
