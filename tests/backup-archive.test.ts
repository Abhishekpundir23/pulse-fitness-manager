import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseBackupArchive,
  serializeBackup,
  summarizeBackup,
  validateBackupArchive,
  type BackupArchive,
} from '../lib/backup-archive.ts';

const validArchive: BackupArchive = {
  app: 'Pulse Fitness Manager',
  schemaVersion: 1,
  exportedAt: '2026-07-21T10:00:00.000Z',
  data: {
    settings: [{ key: 'gym_name', value: 'Pulse Fitness' }],
    plans: [{ id: 1, name: '1 Month', duration_months: 1, amount: 600, active: 1 }],
    members: [{
      id: 10,
      membership_id: 'PF-0010',
      name: 'Asha',
      gender: 'female',
      phone: '9999999999',
      email: null,
      date_of_birth: null,
      address: null,
      notes: null,
      photo_uri: 'file:///old/member.jpg',
      status: 'active',
      joined_at: '2026-07-01',
      created_at: '2026-07-01 09:00:00',
      updated_at: '2026-07-01 09:00:00',
    }],
    memberships: [{
      id: 20,
      member_id: 10,
      plan_id: 1,
      start_date: '2026-07-01',
      end_date: '2026-08-01',
      base_amount: 600,
      discount_amount: 0,
      admission_fee: 100,
      total_amount: 700,
      paid_amount: 300,
      status: 'active',
      created_at: '2026-07-01 09:00:00',
    }],
    payments: [{
      id: 30,
      member_id: 10,
      membership_id: 20,
      amount: 300,
      method: 'cash',
      paid_at: '2026-07-01',
      note: null,
      created_at: '2026-07-01 09:00:00',
    }],
    attendance: [{
      id: 40,
      member_id: 10,
      attendance_date: '2026-07-21',
      check_in_time: '07:30',
      created_at: '2026-07-21 07:30:00',
    }],
    expenses: [{
      id: 50,
      title: 'Cleaning supplies',
      amount: 250,
      expense_date: '2026-07-20',
      category: 'General',
      notes: null,
      created_at: '2026-07-20 12:00:00',
    }],
  },
  memberPhotos: {
    '10': { data: 'cGhvdG8=', extension: 'jpg' },
  },
};

test('round-trips and summarizes a valid archive', () => {
  const parsed = parseBackupArchive(serializeBackup(validArchive));
  assert.deepEqual(summarizeBackup(parsed), { members: 1, payments: 1, attendance: 1 });
});

test('rejects missing required tables before restore', () => {
  const broken = structuredClone(validArchive) as BackupArchive;
  delete (broken.data as Partial<BackupArchive['data']>).payments;
  assert.throws(() => validateBackupArchive(broken), /payments table/);
});

test('rejects orphaned membership references', () => {
  const broken = structuredClone(validArchive);
  broken.data.memberships[0].member_id = 999;
  assert.throws(() => validateBackupArchive(broken), /unknown member/);
});

test('accepts version 1 backups created by the current app', () => {
  assert.doesNotThrow(() => validateBackupArchive(validArchive));
});

test('rejects duplicate primary IDs', () => {
  const broken = structuredClone(validArchive);
  broken.data.plans.push({ ...broken.data.plans[0] });
  assert.throws(() => validateBackupArchive(broken), /duplicate id/);
});

test('rejects memberships with unknown plans', () => {
  const broken = structuredClone(validArchive);
  broken.data.memberships[0].plan_id = 999;
  assert.throws(() => validateBackupArchive(broken), /unknown plan/);
});

test('rejects payments with unknown or mismatched relationships', () => {
  const unknownMembership = structuredClone(validArchive);
  unknownMembership.data.payments[0].membership_id = 999;
  assert.throws(() => validateBackupArchive(unknownMembership), /unknown membership/);

  const mismatchedMember = structuredClone(validArchive);
  mismatchedMember.data.members.push({
    ...mismatchedMember.data.members[0],
    id: 11,
    membership_id: 'PF-0011',
    phone: '8888888888',
  });
  mismatchedMember.data.payments[0].member_id = 11;
  assert.throws(() => validateBackupArchive(mismatchedMember), /does not belong to member/);
});

test('rejects attendance for an unknown member', () => {
  const broken = structuredClone(validArchive);
  broken.data.attendance[0].member_id = 999;
  assert.throws(() => validateBackupArchive(broken), /unknown member/);
});

test('rejects malformed and orphaned member photos', () => {
  const unsafeExtension = structuredClone(validArchive);
  unsafeExtension.memberPhotos!['10'].extension = '../jpg';
  assert.throws(() => validateBackupArchive(unsafeExtension), /photo extension/);

  const emptyData = structuredClone(validArchive);
  emptyData.memberPhotos!['10'].data = '';
  assert.throws(() => validateBackupArchive(emptyData), /photo data/);

  const orphaned = structuredClone(validArchive);
  orphaned.memberPhotos!['999'] = { data: 'cGhvdG8=', extension: 'png' };
  assert.throws(() => validateBackupArchive(orphaned), /unknown member/);
});

test('rejects missing and incorrectly typed required fields', () => {
  const missingId = structuredClone(validArchive) as BackupArchive;
  delete (missingId.data.expenses[0] as Partial<BackupArchive['data']['expenses'][number]>).id;
  assert.throws(() => validateBackupArchive(missingId), /expenses.*id/);

  const wrongAmount = structuredClone(validArchive) as unknown as {
    data: { plans: { amount: unknown }[] };
  };
  wrongAmount.data.plans[0].amount = '600';
  assert.throws(() => validateBackupArchive(wrongAmount), /plans.*amount/);
});

test('rejects invalid JSON', () => {
  assert.throws(() => parseBackupArchive('{not-json'), /valid JSON/);
});
