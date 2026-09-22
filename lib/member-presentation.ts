import { formatCurrency } from './format';
import type { SnapshotStatus } from './types';

export function memberBalanceLabel(dueAmount: number, latestStatus: SnapshotStatus) {
  if (dueAmount > 0) return `${formatCurrency(dueAmount)} due`;
  return latestStatus === 'cancelled' || latestStatus === 'none' ? 'No due' : 'Paid';
}
