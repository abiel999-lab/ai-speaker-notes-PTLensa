import {parseSource, hash} from '../core/source.js';

// Read the immutable generation snapshot. Download paths must never translate,
// contact the provider, or compare translated slide text to the original input.
export function generationDocument(job) {
    const originalHash = hash(job.source);
    if (originalHash !== job.sourceHash) throw Error('EXPORT_CORRUPTED');
    const snapshot = job.presentationLanguageSource;
    let source = job.source;
    if (snapshot != null) {
        if (!job.settings.presentationLanguage ||
            snapshot.sourceHash !== originalHash ||
            snapshot.language !== job.settings.presentationLanguage ||
            typeof snapshot.source !== 'string' || !snapshot.source.trim())
            throw Error('EXPORT_CORRUPTED');
        source = snapshot.source;
    }
    let doc;
    try { doc = parseSource(source, job.settings.mode); }
    catch { throw Error('EXPORT_CORRUPTED'); }
    if (!job.scene || doc.sha256 !== job.scene.sourceHash ||
        doc.sha256 !== job.report?.sourceHash)
        throw Error('EXPORT_CORRUPTED');
    return doc;
}
