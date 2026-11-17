import { useState } from "react";
import { api } from "../api";
import type { Language } from "../studio/types";
interface Usage {
  usage: { generations: number; ai: number };
  limits: { generations: number; ai: number };
  enforced: boolean;
}
export function UsageSummary({ lang }: { lang: Language }) {
  const [data, setData] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const id = lang === "id";
  async function refresh(open: boolean) {
    if (!open) return;
    setData(null); setFailed(false);
    try { setData(await api<Usage>("/usage")); }
    catch { setFailed(true); }
  }
  return <details className="usage-menu" onToggle={e => { void refresh(e.currentTarget.open); }}>
    <summary>{id ? "Pemakaian" : "Usage"}</summary>
    <div className="usage-menu-content" role="status">
      {failed ? <p>{id ? "Pemakaian belum tersedia. Coba kembali." : "Usage unavailable. Try again."}</p> : !data ?
        <p>{id ? "Memuat…" : "Loading…"}</p> : <>
          <strong>{id ? "Pemakaian hari ini" : "Today's usage"}</strong>
          <p>{id ? "Generation" : "Generations"}: {data.usage.generations} / {data.limits.generations}</p>
          <p>{id ? "Permintaan AI" : "AI requests"}: {data.usage.ai} / {data.limits.ai}</p>
          <small>{id ? "Reset pukul 07.00 WIB. Upaya yang gagal bisa tetap memakai kuota." : "Resets at 00:00 UTC. Failed attempts may consume quota."}</small>
        </>}
    </div>
  </details>;
}
