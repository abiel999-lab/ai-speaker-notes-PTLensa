import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "../api";
import type { Studio } from "../studio/useStudio";
/** Uploads stay in the current project's private asset directory. Removing a
 * selection never removes images used by historical generations. */
export function CreativeAssets({ studio: s }: { studio: Studio }) {
  const [inventory, setInventory] = useState<{ id: string }[]>([]), [error, setError] = useState<unknown>(null);
  const live = useRef(s); live.current = s;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selected = s.settings.creativeAssets || [];
  useEffect(() => {
    let stopped = false; setInventory([]); setError(null);
    if (s.draft.id) void api<{ assets: { id: string }[] }>(`/projects/${s.draft.id}/images`)
      .then(data => { if (!stopped) setInventory(data.assets); }).catch(error => { if (!stopped) setError(error); });
    return () => { stopped = true; };
  }, [s.draft.id]);
  function add(id: string) {
    s.setSettings(v => ({ ...v, creativeAssets: [...(v.creativeAssets || []), { id, description: "Describe this image" }].slice(0, 12) }));
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.length + selected.length > 12) { setError(new ApiError("CREATIVE_ASSET_LIMIT")); return; }
    s.setBusy(true); setError(null);
    const source = s.draft.source;
    try {
      for (const file of files) if (file.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png"].includes(file.type)) throw new ApiError("IMAGE_TYPE");
      const project = await s.save();
      if (!project) throw new ApiError("EMPTY_SOURCE");
      for (const file of files) {
        if (!mounted.current || live.current.draft.source !== source || (live.current.draft.id && live.current.draft.id !== project.id)) throw new ApiError("DRAFT_CHANGED");
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        const { assetId } = await api<{ assetId: string }>(`/projects/${project.id}/image`, "POST", { base64: btoa(binary) });
        if (!mounted.current || live.current.draft.source !== source || (live.current.draft.id && live.current.draft.id !== project.id)) throw new ApiError("DRAFT_CHANGED");
        const description = file.name.replace(/\.[^.]+$/, "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 160) || "Uploaded image";
        s.setSettings(v => ({ ...v, creativeAssets: [...(v.creativeAssets || []), { id: assetId, description }].slice(0, 12) }));
        setInventory(v => [...v, { id: assetId }]);
      }
    } catch (error) { if (mounted.current) setError(error); }
    finally { if (mounted.current) s.setBusy(false); }
  }
  return <section className="creative-assets" aria-label="Creative images">
    <h3>Images for your presentation</h3>
    <p className="help-text">Upload up to 12 JPG/PNG images, 2 MB each. Describe the subject and empty space so Luna can place them. Only descriptions are sent for composition. No image-generation service is called.</p>
    <label className="field">Upload images<input type="file" accept="image/jpeg,image/png" multiple aria-label="Upload creative images"
      disabled={s.busy || s.active || selected.length >= 12} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void upload(files); }} /></label>
    {!!error && <p className="notice" role="alert">{errorMessage(error, "en").message}</p>}
    <div className="creative-asset-grid">{selected.map((asset, i) => <div className="creative-asset" key={asset.id}>
      {s.draft.id && <img src={`/api/projects/${s.draft.id}/image/${asset.id}`} alt={`Selected image ${i + 1}`} />}
      <label className="field">Image {i + 1} description<input aria-label={`Image ${i + 1} description`} maxLength={160} value={asset.description}
        disabled={s.busy || s.active} onChange={e => s.setSettings(v => ({ ...v, creativeAssets: (v.creativeAssets || []).map(a => a.id === asset.id ? { ...a, description: e.target.value } : a) }))} /></label>
      <button type="button" className="text-button" disabled={s.busy || s.active}
        onClick={() => s.setSettings(v => ({ ...v, creativeAssets: (v.creativeAssets || []).filter(a => a.id !== asset.id) }))}>Remove from selection</button>
    </div>)}</div>
    {!!inventory.filter(a => !selected.some(s => s.id === a.id)).length && <details><summary>Previously uploaded images</summary><div className="creative-asset-library">
      {inventory.filter(a => !selected.some(s => s.id === a.id)).map((asset, i) => <button key={asset.id} type="button" aria-label={`Select uploaded image ${i + 1}`}
        disabled={s.busy || s.active || selected.length >= 12} onClick={() => add(asset.id)}>
        <img src={`/api/projects/${s.draft.id}/image/${asset.id}`} alt="" /><span>Select image</span></button>)}
    </div></details>}
  </section>;
}
