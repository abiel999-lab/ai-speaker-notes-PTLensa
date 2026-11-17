import fs from 'node:fs';
export const MAINTENANCE_FILE='/app/.notepreso-v2-maintenance';
export function isReleaseMaintenance(pathname,file=MAINTENANCE_FILE){return fs.existsSync(file)&&pathname!=='/api/health';}
