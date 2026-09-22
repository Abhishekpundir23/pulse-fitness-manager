import { monthRange } from './history-period.ts';
import type { PaymentHistoryFilters } from './types.ts';

export function buildPaymentHistoryQuery(filters: PaymentHistoryFilters) {
  const search = `%${filters.search.trim()}%`;
  const clauses = [
    '(m.name LIKE ? OR m.phone LIKE ? OR m.membership_id LIKE ?)',
  ];
  if (!filters.includeVoided) clauses.push('p.voided_at IS NULL');
  const args: (string | number)[] = [search, search, search];

  if (filters.method !== 'all') {
    clauses.push('p.method = ?');
    args.push(filters.method);
  }
  if (filters.month) {
    const range = monthRange(filters.month);
    clauses.push('p.paid_at BETWEEN ? AND ?');
    args.push(range.start, range.end);
  }

  return {
    sql: `SELECT p.*, m.name AS member_name, m.phone AS member_phone,
      m.membership_id AS member_code
      FROM payments p
      JOIN members m ON m.id = p.member_id
      WHERE ${clauses.join('\n        AND ')}
      ORDER BY p.paid_at DESC, p.id DESC`,
    args,
  };
}
