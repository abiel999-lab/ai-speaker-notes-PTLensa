const marker = /^\s*(?:={3,}\s*)?(?:slide|halaman)\s+0*([1-9]\d?)\s*(?:(?:of|dari)\s+0*([1-9]\d?)\s*)?(?::|[-–—]|={3,}|$)/iu;
export function isSlideBoundaryText(text) {
    return marker.test(text);
}
export function sourceSlideSections(atoms, requested) {
    if (!atoms.length)
        return null;
    const marks = [];
    for (const [index, atom] of atoms.entries()) {
        const match = atom.text.match(marker);
        if (match)
            marks.push({ index, number: Number(match[1]), ...(match[2] ? { total: Number(match[2]) } : {}) });
    }
    if (!marks.length || marks.length > 40 || (requested != null && marks.length !== requested))
        return null;
    if (marks.some((mark, i) => mark.number !== i + 1 || (mark.total != null && mark.total !== marks.length)))
        return null;
    // Include source preamble in slide one, not as an orphan slide. This may force
    // an additional safe reflow slide if the source is too dense; text is never removed.
    const sections = marks.map((mark, i) => atoms.slice(i === 0 ? 0 : mark.index, marks[i + 1]?.index ?? atoms.length));
    return sections;
}
/** Structural guard for model-produced compositions.
 * Every explicit authored section must be represented by one or more distinct
 * physical slides. More than one authored section on one slide is never valid.
 * A dense authored section may span multiple slides when slideCount is unset.
 * This does not erase or rewrite source material.
 */
export function authoredSectionViolation(sections, slides) {
    if (!sections.length)
        return null;
    const sectionForKey = new Map();
    for (const [index, section] of sections.entries()) {
        for (const atom of section)
            sectionForKey.set(atom.key, index);
    }
    let last = -1;
    for (const slide of slides) {
        if (!slide.boxes.length)
            return "SOURCE_SECTION_ORDER";
        const owners = new Set(slide.boxes.map(box => sectionForKey.get(box.key)));
        if (owners.size !== 1 || owners.has(undefined))
            return "SOURCE_SECTION_MERGE";
        const owner = [...owners][0];
        if (owner < last || owner > last + 1)
            return "SOURCE_SECTION_ORDER";
        last = owner;
    }
    return last === sections.length - 1 ? null : "SOURCE_SECTION_ORDER";
}
