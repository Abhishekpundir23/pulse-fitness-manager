import type { SQLiteDatabase } from 'expo-sqlite';

import { todayIso } from './format';
import { buildMemberSnapshotQuery } from './member-query';
import type { MemberListItem } from './types';

export type AttendanceFilter = 'all' | 'present' | 'absent';
export type AttendanceData = { date: string; members: MemberListItem[]; presentCount: number };

function validateAttendanceDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date || date > todayIso()) {
    throw new Error('Choose a valid attendance date no later than today.');
  }
}

export async function getAttendanceData(
  db: SQLiteDatabase,
  { date, search, filter }: { date: string; search: string; filter: AttendanceFilter },
): Promise<AttendanceData> {
  validateAttendanceDate(date);
  const query = buildMemberSnapshotQuery({
    search, filter: 'all', snapshotDate: date, attendanceDate: date, currentView: date === todayIso(),
  });
  const [members, count] = await Promise.all([
    db.getAllAsync<MemberListItem>(query.sql, ...query.args),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attendance WHERE attendance_date = ?', date),
  ]);
  return {
    date,
    members: members.filter((member) => filter === 'all' || (member.attended_today === 1) === (filter === 'present')),
    presentCount: count?.count ?? 0,
  };
}

/** Explicit desired state makes a retried check-in harmless instead of undoing it. */
export async function setAttendance(db: SQLiteDatabase, memberId: number, date: string, present: boolean) {
  return writeAttendance(db, memberId, date, present);
}

export async function toggleMemberAttendance(db: SQLiteDatabase, memberId: number, date: string) {
  return writeAttendance(db, memberId, date);
}

async function writeAttendance(db: SQLiteDatabase, memberId: number, date: string, desired?: boolean) {
  validateAttendanceDate(date);
  let present = false;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const member = await transaction.getFirstAsync<{ joined_at: string }>('SELECT joined_at FROM members WHERE id = ?', memberId);
    if (!member) throw new Error('This member could not be found.');
    if (date < todayIso() && date < member.joined_at) {
      throw new Error('Attendance cannot be recorded before this member joined.');
    }
    const existing = await transaction.getFirstAsync<{ id: number }>(
      'SELECT id FROM attendance WHERE member_id = ? AND attendance_date = ?', memberId, date,
    );
    present = desired ?? !existing;
    if (!present) {
      await transaction.runAsync('DELETE FROM attendance WHERE member_id = ? AND attendance_date = ?', memberId, date);
    } else if (!existing) {
      const checkIn = date === todayIso()
        ? new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : 'Added later';
      await transaction.runAsync(
        'INSERT INTO attendance(member_id, attendance_date, check_in_time) VALUES (?, ?, ?)', memberId, date, checkIn,
      );
    }
  });
  return present;
}
