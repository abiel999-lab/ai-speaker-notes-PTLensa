export function slideNotes(slide, _slideNumber, _total) {
    // Source-bearing content only. Never add headers, instructions or truncation.
    const chunks = slide.objects.flatMap((item) => {
        if (!item.sourceId)
            return [];
        if (item.type === "text" && item.text)
            return [item.text];
        if (item.type === "table" && item.rows)
            return [item.rows.map((row) => row.join(" | ")).join("\n")];
        return [];
    });
    const credits = (slide.visualCredits || []).slice(0,1).map(c =>
        ['Visual credit', c.title, c.artist, c.license, c.licenseUrl, c.source, c.changes].join(' | '));
    return [...chunks, ...credits].join("\n\n");
}
export function notesForScene(doc, scene) {
    if (scene.sourceHash !== doc.sha256)
        throw new Error("SOURCE_CHANGED");
    return scene.slides.map((slide, i) => slideNotes(slide, i + 1, scene.slides.length));
}
export function notesTranscript(doc, scene) {
    return `NotePreso | PowerPoint Maker — Presenter Notes\nSource fingerprint: ${doc.sha256}\nGenerated from slide text, not an AI commentary.\n\n` + notesForScene(doc, scene).join("\n\n---\n\n") + "\n";
}
