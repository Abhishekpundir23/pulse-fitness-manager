export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', options ?? {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso() {
  return toIsoDate(new Date());
}

export function addMonths(dateValue: string, months: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'GM';
}

export function daysUntil(value?: string | null) {
  if (!value) return null;
  const today = new Date(`${todayIso()}T00:00:00`).getTime();
  const target = new Date(`${value}T00:00:00`).getTime();
  return Math.ceil((target - today) / 86_400_000);
}

