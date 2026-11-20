// Ordinary generators recover queued and building jobs from the same table.
// Keep Journal work outside those states so only the PDF exporter handles it.
export const JOURNAL_BUILDING = 'journal-building';

export function journalIsBuilding(job) {
    return Boolean(job?.journal && (job.status === JOURNAL_BUILDING || job.status === 'building'));
}
