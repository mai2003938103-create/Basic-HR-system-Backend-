/** ISO instant for a Vientiane local date and HH:mm (UTC+7, no DST). */
export const localIso = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
