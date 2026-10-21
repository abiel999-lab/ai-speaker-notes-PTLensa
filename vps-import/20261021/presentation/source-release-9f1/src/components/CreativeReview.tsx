import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Slide } from "../Slide";
import type { Studio } from "../studio/useStudio";
export function CreativeReview({ studio: s }: { studio: Studio }) {
  const [index, setIndex] = useState(0);
  const job = s.job!, slides = job.scene?.slides || [];
  const current = Math.min(index, Math.max(0, slides.length - 1)), slide = slides[current];
  const ready = job.status === "ready" && job.report?.exportVerified;
  return <section className="creative-review">
    <header><div><p className="eyebrow">CREATIVE AI · DOWNLOAD ONLY</p><h1>Your custom presentation</h1>
      <p>Created from your visual brief. This mode offers preview and downloads; choose Template for in-app editing.</p></div></header>
    <div className="creative-review-layout">
      <nav className="creative-thumbnails" aria-label="Creative slides">{slides.map((item, i) =>
        <button key={item.id} type="button" aria-label={"Slide " + (i + 1)} aria-current={i === current ? "true" : undefined}
          onClick={() => setIndex(i)}><Slide slide={item} generationId={job.id} projectId={job.projectId} /><span>{i + 1}</span></button>)}</nav>
      <div className="creative-preview">{slide ? (job.preview === "rendered" ?
        <img src={`/api/generations/${job.id}/preview/${current}`} alt={"Rendered slide " + (current + 1)} /> :
        <Slide slide={slide} generationId={job.id} projectId={job.projectId} />) : <p>Preparing your custom presentation…</p>}
        <div className="creative-pagination"><button className="icon-button" aria-label="Previous slide" disabled={current === 0} onClick={() => setIndex(current - 1)}><ChevronLeft size={18} /></button>
          <span>{slides.length ? current + 1 : 0} / {slides.length}</span>
          <button className="icon-button" aria-label="Next slide" disabled={current >= slides.length - 1} onClick={() => setIndex(current + 1)}><ChevronRight size={18} /></button></div>
      </div>
    </div>
    {slide && <nav className="creative-content-links" aria-label="Links on this slide">{slide.objects.filter(o => o.targetSlide).map((o, i) =>
      <button type="button" className="text-button" key={i} onClick={() => setIndex(o.targetSlide! - 1)}>{(o.text || "Open slide").slice(0, 90)} → {o.targetSlide}</button>)}</nav>}
    {job.report?.interactive && <p className="help-text">{job.report.interactive.uploadedImages} image placements · {job.report.interactive.links} internal content links{job.report.interactive.menuSlide ? ` · menu on slide ${job.report.interactive.menuSlide}` : ""}. The same content links are available in the PowerPoint Slide Show.</p>}
    {job.report?.motion && <p className="notice">PowerPoint motion included · {job.report.motion.transitionSlides} slide transitions · {job.report.motion.animatedObjects} animated content objects · {job.report.motion.navigationSlides} slides with navigation. Download the PPTX and start Slide Show to play the effects. Web previews and PDF remain static.</p>}
    {job.plan?.ai?.model && <p className="help-text">Composition model: {job.plan.ai.model}</p>}
    {job.previewWarning && <p className="notice">{job.previewWarning}</p>}
    <footer>{ready ? <><a className="button primary" href={`/api/generations/${job.id}/export`}><Download size={16} />Download PowerPoint</a>
      {job.preview === "rendered" && <a className="button" href={`/api/generations/${job.id}/pdf`}>Download PDF</a>}
      <a className="text-button" href={`/api/generations/${job.id}/validation`}>Validation report</a></> : <p>Downloads are available after export verification.</p>}</footer>
  </section>;
}
