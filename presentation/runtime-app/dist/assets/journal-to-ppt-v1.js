const errors = {
  JOURNAL_OCR_REQUIRED: "This PDF needs OCR before it can be converted.",
  JOURNAL_PAGE_LIMIT: "Use a PDF with at most 40 pages.",
  JOURNAL_BUSY: "Another journal is being processed. Try again shortly.",
  JOURNAL_INVALID: "Choose a readable research journal PDF up to 50 MB.",
  AUTH_REQUIRED: "Please sign in again.",
  CSRF_REJECTED: "Refresh the page and try again.",
};

export async function journalRequest(action, payload, signal) {
  const sessionResponse = await fetch("/api/session",{credentials:"same-origin",cache:"no-store",signal});
  const session = sessionResponse.ok ? await sessionResponse.json() : null;
  if (!session?.user || !session.csrfToken) throw Error(errors.AUTH_REQUIRED);
  const response = await fetch("/api/journal/"+action,{
    method:"POST",credentials:"same-origin",signal,
    headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrfToken},
    body:JSON.stringify(payload),
  });
  if (!response.ok) {
    const result=await response.json().catch(()=>({}));
    throw Error(errors[result.error]||"The journal could not be processed. Try again.");
  }
  if (action !== "export") return response.json();
  const body = await response.blob();
  const length = new DataView(await body.slice(0, 4).arrayBuffer()).getUint32(0);
  if (!length || length + 4 >= body.size) throw Error("The generated PowerPoint could not be read.");
  const review = JSON.parse(await body.slice(4, 4 + length).text());
  if (!Array.isArray(review) || !review.length) throw Error("The generated slide preview could not be read.");
  return {review, blob: body.slice(length + 4, body.size, "application/vnd.openxmlformats-officedocument.presentationml.presentation")};
}
