function parseMonthKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error('Invalid month value.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('Invalid month value.');
  return { year, month };
}

export function currentMonthKey(today = new Date().toISOString().slice(0, 10)) {
  return today.slice(0, 7);
}

export function shiftMonth(monthKey: string, delta: number) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

export function snapshotDateForMonth(monthKey: string, today = new Date().toISOString().slice(0, 10)) {
  const end = monthRange(monthKey).end;
  return end > today ? today : end;
}

export function formatMonthLabel(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}
