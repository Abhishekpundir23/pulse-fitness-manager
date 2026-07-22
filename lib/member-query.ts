import type { MemberFilter } from './types.ts';

type Input = {
  search: string;
  filter: MemberFilter;
  snapshotDate: string;
  attendanceDate: string;
};

function filterClause(filter: MemberFilter) {
  const snapshot = '(SELECT snapshot_date FROM snapshot)';
  const cancelled = `(ms.status = 'cancelled' AND (ms.cancelled_at IS NULL OR ms.cancelled_at <= ${snapshot}))`;
  switch (filter) {
    case 'active':
      return `AND ms.id IS NOT NULL AND NOT ${cancelled} AND ms.end_date >= ${snapshot}`;
    case 'due':
      return `AND ms.id IS NOT NULL AND NOT ${cancelled} AND MAX(COALESCE(ms.total_amount, 0) - COALESCE(sp.paid_amount, 0), 0) > 0`;
    case 'paid':
      return 'AND ms.id IS NOT NULL AND MAX(COALESCE(ms.total_amount, 0) - COALESCE(sp.paid_amount, 0), 0) = 0';
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
  const sql = `WITH snapshot(snapshot_date) AS (VALUES (?)),
    snapshot_payments AS (
      SELECT membership_id, SUM(amount) AS paid_amount
      FROM payments
      WHERE paid_at <= (SELECT snapshot_date FROM snapshot)
      GROUP BY membership_id
    )
    SELECT m.id, m.membership_id, m.name, m.gender, m.phone, m.photo_uri,
    m.status, m.joined_at, ms.plan_id, p.name AS plan_name, ms.status AS membership_status,
    ms.end_date, COALESCE(ms.total_amount, 0) AS total_amount,
    COALESCE(sp.paid_amount, 0) AS paid_amount,
    CASE WHEN ms.id IS NOT NULL AND NOT (
      ms.status = 'cancelled' AND (
        ms.cancelled_at IS NULL OR ms.cancelled_at <= (SELECT snapshot_date FROM snapshot)
      )
    ) THEN MAX(COALESCE(ms.total_amount, 0) - COALESCE(sp.paid_amount, 0), 0)
      ELSE 0 END AS due_amount,
    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended_today,
    CASE WHEN ms.id IS NULL THEN 'none'
      WHEN ms.status = 'cancelled' AND (
        ms.cancelled_at IS NULL OR ms.cancelled_at <= (SELECT snapshot_date FROM snapshot)
      ) THEN 'cancelled'
      WHEN ms.end_date < (SELECT snapshot_date FROM snapshot) THEN 'expired'
      ELSE 'active' END AS snapshot_status,
    (SELECT snapshot_date FROM snapshot) AS snapshot_date
    FROM members m
    LEFT JOIN memberships ms ON ms.id = (
      SELECT ms.id FROM memberships ms
      WHERE ms.member_id = m.id
        AND ms.start_date <= (SELECT snapshot_date FROM snapshot)
      ORDER BY ms.start_date DESC, ms.id DESC LIMIT 1)
    LEFT JOIN snapshot_payments sp ON sp.membership_id = ms.id
    LEFT JOIN plans p ON p.id = ms.plan_id
    LEFT JOIN attendance a ON a.member_id = m.id AND a.attendance_date = ?
    WHERE m.status != 'archived'
      AND m.joined_at <= (SELECT snapshot_date FROM snapshot)
      AND (m.name LIKE ? OR m.phone LIKE ? OR m.membership_id LIKE ?)
      ${filter}
    ORDER BY m.created_at DESC`;
  return {
    sql,
    args: [input.snapshotDate, input.attendanceDate, normalized, normalized, normalized],
  };
}
