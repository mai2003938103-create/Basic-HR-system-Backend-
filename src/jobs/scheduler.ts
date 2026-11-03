import cron from 'node-cron';
import { localDate } from '../lib/dates.js';
import { markAbsences } from './mark-absences.js';

export function startScheduler() {
  cron.schedule(
    '55 23 * * *',
    async () => {
      try {
        const r = await markAbsences(localDate(new Date()));
        console.log(`[job] marked ${r.created} absences`);
      } catch (e) {
        console.error('[job] markAbsences failed', e);
      }
    },
    { timezone: 'Asia/Vientiane' },
  );
}
