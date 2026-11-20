const errors = {
  JOURNAL_OCR_REQUIRED: "This PDF needs OCR before it can be converted.",
  JOURNAL_PAGE_LIMIT: "Use a PDF with at most 40 pages.",
  JOURNAL_BUSY: "Another PDF is being processed. Wait briefly, then retry.",
  JOURNAL_PDF_UNREADABLE: "The server could not read the PDF structure. Re-export a fresh PDF and retry.",
  JOURNAL_PDF_PASSWORD_REQUIRED: "This PDF is password protected. Export an unlocked copy first.",
  JOURNAL_LAYOUT_LIMIT: "The PDF layout is too complex to analyze in one pass. Split it into smaller sections.",
  JOURNAL_TEXT_LIMIT: "This PDF has too much text to analyze in one pass. Split it into smaller sections.",
  JOURNAL_ANALYSIS_TIMEOUT: "The server reached its time limit while processing the PDF. Try a smaller page range.",
  JOURNAL_PAGE_SIZE: "A PDF page has unsupported dimensions. Re-export the PDF, then retry.",
  JOURNAL_TOOLS_UNAVAILABLE: "The PDF analyzer is temporarily unavailable.",
  JOURNAL_GENERATION_FAILED: "The server could not finish this PDF operation.",
  JOURNAL_INVALID: "Choose a readable research journal PDF up to 50 MB.",
  AUTH_REQUIRED: "Please sign in again.",
  CSRF_REJECTED: "Refresh the page and try again.",
};

export async function journalRequest(action, payload, signal, onProgress) {
  const sessionResponse = await fetch("/api/session",{credentials:"same-origin",cache:"no-store",signal});
  const session = sessionResponse.ok ? await sessionResponse.json() : null;
  if (!session?.user || !session.csrfToken) throw Error(errors.AUTH_REQUIRED);
  const response = await window.NotePresoUpload.request("/api/journal/"+action,{
    method:"POST",credentials:"same-origin",signal,
    headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrfToken},
    body:JSON.stringify(payload),timeout:480000,
  },onProgress);
  if (!response.ok) {
    const result=await response.json().catch(()=>({}));
    const oversized = response.status === 413;
    const message = oversized ? "The PDF exceeds the upload limit of 50 MB." :
      result.error === "JOURNAL_PAGE_LIMIT" && payload.sourcePagesOnly ? "Source page copy supports up to 200 pages per PDF." :
      errors[result.error] || (response.status >= 500 ? "The server could not confirm the result. Try again shortly." : "The PDF operation was rejected.");
    const error = Error(message+(result.requestId ? " · Request "+result.requestId : ""));
    if (oversized) error.phase = "upload";
    throw error;
  }
  if (action !== "export") return response.json();
  const body = await response.blob();
  const length = new DataView(await body.slice(0, 4).arrayBuffer()).getUint32(0);
  if (!length || length + 4 >= body.size) throw Error("The generated PowerPoint could not be read.");
  const meta = JSON.parse(await body.slice(4, 4 + length).text());
  const start=4+length;
  const type="application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (!payload.renderPreview) {
    if (!Array.isArray(meta) || !meta.length) throw Error("The generated slide preview could not be read.");
    return {review:meta,blob:body.slice(start,body.size,type)};
  }
  if (!Number.isSafeInteger(meta.pptxBytes)||meta.pptxBytes<4||!Number.isSafeInteger(meta.slides)||meta.slides<1
      ||!Array.isArray(meta.sizes)||(meta.sizes.length&&meta.sizes.length!==meta.slides)) throw Error("The generated PowerPoint could not be read.");
  let end=start+meta.pptxBytes;
  const blob=body.slice(start,end,type);
  const images=meta.sizes.map(size=>{
    if(!Number.isSafeInteger(size)||size<4||end+size>body.size)throw Error("The generated slide preview could not be read.");
    const image=body.slice(end,end+size,"image/jpeg");
    end+=size;
    return image;
  });
  if(end!==body.size)throw Error("The generated PowerPoint download is incomplete.");
  return {blob,images,slides:meta.slides};
}
