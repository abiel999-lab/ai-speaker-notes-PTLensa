const directive = /^(?:GENERATION\s+INTENT|VISUAL\s+LANGUAGE|VISUAL\s+DIRECTION|DESIGN\s+BRIEF|PROJECT\s+STATUS|IMPORTANT|CONTENT\s*\/\s*SLIDE\s+BREAKS\s+BELOW)\s*:/iu;
const slideMarker = /^\s*(?:={3,}\s*)?(?:slide|halaman)\s+0*[1-9]\d?\s*(?:(?:of|dari)\s+0*[1-9]\d?)?\s*(?::|[-–—]|={3,}|$)/iu;
const datedStep = /^\s*(?:(?:19|20|21)\d{2}|Q[1-4]\s+(?:19|20|21)\d{2})\s*(?:[/|:—–-])\s*\S/iu;
const numberedStep = /^\s*(?:step|stage|phase|tahap|langkah|fase)\s+\d{1,2}\s*(?:[:—–.\-/]|\s)\s*\S/iu;
const namedOption = /^\s*(?:site|location|option|alternative|scenario|case|situs|lokasi|opsi|alternatif|skenario|kasus)\s+(?:[A-H]|\d{1,2})\s*(?:[:/—–-]|\s)\s*\S/iu;
const tableYear = /^\s*(?:(?:19|20|21)\d{2}|Q[1-4])\s*\|\s*[^|]+\|\s*[^|]+/iu;
const valueAtEnd = /(?:=|→|:)\s*(?:USD|US\$|Rp|\$)?\s*(-?\d[\d,.]*)(?:\s*(MWh\/day|kWh\/day|m³\/day|t\/day|million|billion|hectares?|ha|M|B|%|MW|MWp|USD|people|orang))?(?:\s*[.;])?$/iu;
function contentLines(atom) {
    return atom.text.split(/\r?\n/u).map(line => line.trim()).filter(line => !!line && !directive.test(line) && !slideMarker.test(line));
}
function densityOf(atoms) {
    const total = atoms.reduce((sum, atom) => sum + atom.text.length, 0);
    return total > 1000 || atoms.length > 18 ? "dense" : total < 280 && atoms.length < 7 ? "compact" : "normal";
}
/** No source prose or numeric values are copied to the returned hints. */
export function inferCreativeVisualIntent(atoms, sectionIndex) {
    const meaningful = atoms.filter(atom => contentLines(atom).length > 0 || (atom.rows?.length || 0) > 0);
    const lines = meaningful.flatMap(atom => contentLines(atom).map(line => ({ line, key: atom.key })));
    const matches = (predicate) => lines.filter(entry => predicate(entry.line));
    const embeddedTables = meaningful.filter(atom => atom.kind === "table" && (atom.rows?.length || 0) >= 3);
    const pipeTables = matches(line => tableYear.test(line) ||
        (line.split("|").length >= 3 && /^\s*[A-Za-z\p{L}].*\|\s*[\d$€]/u.test(line)));
    const temporal = matches(line => datedStep.test(line));
    const sequences = matches(line => numberedStep.test(line));
    const options = matches(line => namedOption.test(line));
    const numeric = lines.flatMap(entry => {
        const result = entry.line.match(valueAtEnd);
        return result ? [{ key: entry.key, unit: (result[2] || "").toLowerCase() }] : [];
    });
    let visualKind = "editorial";
    let confidence = "low";
    let evidence = [];
    if (embeddedTables.length || pipeTables.length >= 3) {
        visualKind = "data-table";
        confidence = "high";
        evidence = [...embeddedTables.map(a => a.key), ...pipeTables.map(v => v.key)];
    }
    else if (temporal.length >= 3) {
        visualKind = "timeline";
        confidence = "high";
        evidence = temporal.map(v => v.key);
    }
    else if (sequences.length >= 3) {
        visualKind = "process";
        confidence = "high";
        evidence = sequences.map(v => v.key);
    }
    else if (options.length >= 3) {
        visualKind = "comparison";
        confidence = "high";
        evidence = options.map(v => v.key);
    }
    else {
        const unitCounts = new Map();
        for (const datum of numeric)
            if (datum.unit)
                unitCounts.set(datum.unit, (unitCounts.get(datum.unit) || 0) + 1);
        const comparable = [...unitCounts].sort((a, b) => b[1] - a[1])[0];
        if (comparable && comparable[1] >= 3) {
            visualKind = "data-chart";
            confidence = "high";
            evidence = numeric.filter(v => v.unit === comparable[0]).map(v => v.key);
        }
        else if (numeric.length >= 3) {
            visualKind = "metrics";
            confidence = "medium";
            evidence = numeric.map(v => v.key);
        }
        else if (lines.length <= 2 && atoms.reduce((total, atom) => total + atom.text.length, 0) < 330) {
            visualKind = "statement";
            confidence = "medium";
            evidence = lines.map(v => v.key);
        }
    }
    // Existing immutable atom keys only; never send user text/figures as metadata.
    return { sectionIndex, visualKind, confidence, density: densityOf(atoms),
        evidenceKeys: [...new Set(evidence)].slice(0, 12) };
}
/** Use bounded authored sections when known, otherwise describe the deck as a whole. */
export function creativeVisualPlan(atoms, sections) {
    const groups = sections?.length ? sections : [atoms];
    return groups.slice(0, 40).map((group, index) => inferCreativeVisualIntent(group, index + 1));
}
