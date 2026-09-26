import type { MemberFilter, MemberListItem } from './types.ts';

export type MemberSort = 'recent' | 'name' | 'expiry' | 'due';

export function sortDirectoryMembers<T extends Pick<MemberListItem, 'id' | 'name' | 'due_amount' | 'end_date'>>(
  members: readonly T[],
  order: MemberSort,
): T[] {
  if (order === 'recent') return [...members];
  return [...members].sort((first, second) => {
    const primary = order === 'due'
      ? second.due_amount - first.due_amount
      : order === 'expiry'
        ? (first.end_date ?? '9999-12-31').localeCompare(second.end_date ?? '9999-12-31')
        : first.name.localeCompare(second.name, 'en-IN', { sensitivity: 'base', numeric: true });
    return primary || first.name.localeCompare(second.name, 'en-IN') || first.id - second.id;
  });
}

type Input = {
  search: string;
  filter: MemberFilter;
  snapshotDate: string;
  attendanceDate: string;
  currentView?: boolean;
};

function filterClause(filter: MemberFilter) {
  const snapshot = '(SELECT snapshot_date FROM snapshot)';
  const cancelled = `(ms.status = 'cancelled' AND (ms.cancelled_at IS NULL OR ms.cancelled_at <= ${snapshot}))`;
  switch (filter) {
    case 'active':
      return `AND m.status = 'active' AND ms.id IS NOT NULL AND NOT ${cancelled} AND ms.status != 'frozen'
        AND ms.start_date <= ${snapshot} AND ms.end_date >= ${snapshot}`;
    case 'expiring':
      return `AND m.status = 'active' AND ms.id IS NOT NULL AND NOT ${cancelled} AND ms.status != 'frozen'
        AND ms.start_date <= ${snapshot}
        AND ms.end_date BETWEEN ${snapshot} AND date(${snapshot}, '+7 day')`;
    case 'due':
      return 'AND COALESCE(sd.due_amount, 0) > 0';
    case 'paid':
      return 'AND ms.id IS NOT NULL AND COALESCE(sd.due_amount, 0) = 0';
    case 'expired':
      return `AND ms.id IS NOT NULL AND NOT ${cancelled} AND ms.end_date < ${snapshot}`;
    case 'cancelled':
      return `AND ${cancelled}`;
    default:
      return '';
  }
}

export function buildMemberSnapshotQuery(input: Input) {
  const normalized = `%${input.search.trim()}%`;
  const filter = filterClause(input.filter);
  // The live directory is an operational ledger, including future purchases.
  // Dated snapshots retain access-period and receipt-date cutoffs.
  const membershipCutoff = input.currentView ? '1 = 1' : 'ms.start_date <= (SELECT snapshot_date FROM snapshot)';
  const paymentCutoff = input.currentView ? '1 = 1' : 'paid_at <= (SELECT snapshot_date FROM snapshot)';
  const memberCutoff = input.currentView ? '' : 'AND m.joined_at <= (SELECT snapshot_date FROM snapshot)';
  const visibleMembers = input.currentView && input.filter === 'due' ? '1 = 1' : "m.status != 'archived'";
  const sql = `WITH snapshot(snapshot_date) AS (VALUES (?)),
    snapshot_payments AS (
      SELECT membership_id, ROUND(SUM(amount), 2) AS paid_amount
      FROM payments
      WHERE ${paymentCutoff}
        AND voided_at IS NULL
      GROUP BY membership_id
    ),
    snapshot_dues AS (
      SELECT ms.member_id,
        ROUND(SUM(MAX(ROUND(COALESCE(ms.total_amount, 0) - COALESCE(sp.paid_amount, 0), 2), 0)), 2) AS due_amount
      FROM memberships ms
      LEFT JOIN snapshot_payments sp ON sp.membership_id = ms.id
      WHERE ${membershipCutoff}
        AND NOT (ms.status = 'cancelled' AND (
          ms.cancelled_at IS NULL OR ms.cancelled_at <= (SELECT snapshot_date FROM snapshot)
        ))
      GROUP BY ms.member_id
    )
    SELECT m.id, m.membership_id, m.name, m.gender, m.phone, m.photo_uri,
    m.status, m.joined_at, ms.plan_id, COALESCE(ms.plan_name, p.name) AS plan_name, ms.status AS membership_status,
    ms.end_date, COALESCE(ms.total_amount, 0) AS total_amount,
    COALESCE(sp.paid_amount, 0) AS paid_amount,
    COALESCE(sd.due_amount, 0) AS due_amount,
    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended_today,
    CASE WHEN ms.id IS NULL THEN 'none'
      WHEN ms.status = 'cancelled' AND (
        ms.cancelled_at IS NULL OR ms.cancelled_at <= (SELECT snapshot_date FROM snapshot)
      ) THEN 'cancelled'
      WHEN ms.status = 'frozen' THEN 'frozen'
      WHEN ms.start_date > (SELECT snapshot_date FROM snapshot) THEN 'upcoming'
      WHEN ms.end_date < (SELECT snapshot_date FROM snapshot) THEN 'expired'
      ELSE 'active' END AS snapshot_status,
    (SELECT snapshot_date FROM snapshot) AS snapshot_date
    FROM members m
    LEFT JOIN memberships ms ON ms.id = (
      SELECT ms.id FROM memberships ms
      WHERE ms.member_id = m.id
        AND ${membershipCutoff}
      ORDER BY ms.start_date DESC, ms.id DESC LIMIT 1)
    LEFT JOIN snapshot_payments sp ON sp.membership_id = ms.id
    LEFT JOIN snapshot_dues sd ON sd.member_id = m.id
    LEFT JOIN plans p ON p.id = ms.plan_id
    LEFT JOIN attendance a ON a.member_id = m.id AND a.attendance_date = ?
    WHERE ${visibleMembers}
      ${memberCutoff}
      AND (m.name LIKE ? OR m.phone LIKE ? OR m.membership_id LIKE ?)
      ${filter}
    ORDER BY m.created_at DESC`;
  return {
    sql,
    args: [input.snapshotDate, input.attendanceDate, normalized, normalized, normalized],
  };
}
