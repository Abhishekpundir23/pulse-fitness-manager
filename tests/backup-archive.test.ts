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

test('writes archive version 2 so older apps cannot silently turn voided payments back into receipts', () => {
  const serialized = serializeBackup(validArchive);
  assert.equal(JSON.parse(serialized).schemaVersion, 2);
  assert.equal(parseBackupArchive(serialized).schemaVersion, 2);
});

test('accepts current version 2 archives and refuses unsupported future versions', () => {
  assert.doesNotThrow(() => validateBackupArchive({ ...validArchive, schemaVersion: 2 }));
  assert.throws(() => validateBackupArchive({ ...validArchive, schemaVersion: 3 }), /not compatible/);
});

test('rejects duplicate primary IDs', () => {
  const broken = structuredClone(validArchive);
  broken.data.plans.push({ ...broken.data.plans[0] });
  assert.throws(() => validateBackupArchive(broken), /duplicate id/);
});

test('preserves legacy members that share a phone number', () => {
  const legacy = structuredClone(validArchive);
  legacy.data.members.push({
    ...legacy.data.members[0],
    id: 11,
    membership_id: 'PF-0011',
  });
  assert.doesNotThrow(() => validateBackupArchive(legacy));
});

test('accepts legacy memberships without a cancellation timestamp', () => {
  const legacy = structuredClone(validArchive);
  delete legacy.data.memberships[0].cancelled_at;
  assert.doesNotThrow(() => validateBackupArchive(legacy));
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

test('rejects unsafe primary and foreign key integers', () => {
  const unsafeId = structuredClone(validArchive);
  unsafeId.data.expenses[0].id = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateBackupArchive(unsafeId), /expenses.*id/);

  const unsafeForeignKey = structuredClone(validArchive);
  unsafeForeignKey.data.attendance[0].member_id = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateBackupArchive(unsafeForeignKey), /attendance.*member_id/);
});

test('rejects invalid JSON', () => {
  assert.throws(() => parseBackupArchive('{not-json'), /valid JSON/);
});

test('normalizes legacy optional history fields without mutating the source archive', () => {
  const parsed = validateBackupArchive(validArchive);
  assert.equal(parsed.data.memberships[0].plan_name, '1 Month');
  assert.equal(parsed.data.payments[0].voided_at, null);
  assert.equal(parsed.data.payments[0].void_reason, null);
  assert.equal('plan_name' in validArchive.data.memberships[0], false);
});

test('preserves plan snapshots and excludes voided payments from the verified paid total', () => {
  const data = structuredClone(validArchive);
  data.data.memberships[0].plan_name = 'Original monthly plan';
  data.data.payments.push({ ...data.data.payments[0], id: 31, amount: 200,
    voided_at: '2026-09-22 12:30:00', void_reason: 'Duplicate entry' });
  const restored = parseBackupArchive(serializeBackup(data));
  assert.equal(restored.data.memberships[0].plan_name, 'Original monthly plan');
  assert.equal(restored.data.payments[1].void_reason, 'Duplicate entry');
  assert.equal(restored.data.memberships[0].paid_amount, 300);
});

test('rejects inconsistent totals and negative money before replacement', () => {
  const mismatch = structuredClone(validArchive);
  mismatch.data.memberships[0].paid_amount = 301;
  assert.throws(() => validateBackupArchive(mismatch), /paid.*total|payment.*total/i);
  const overpaid = structuredClone(validArchive);
  overpaid.data.memberships[0].total_amount = 250;
  assert.throws(() => validateBackupArchive(overpaid), /exceed/i);
  const negative = structuredClone(validArchive);
  negative.data.expenses[0].amount = -1;
  assert.throws(() => validateBackupArchive(negative), /non-negative/);
});

test('rejects incomplete or invalid void metadata', () => {
  for (const fields of [
    { voided_at: '2026-09-22T12:00:00.000Z', void_reason: null },
    { voided_at: null, void_reason: 'Incorrect entry' },
    { voided_at: 'not-a-date', void_reason: 'Incorrect entry' },
    { voided_at: '2026-09-22T12:00:00.000Z', void_reason: '   ' },
  ]) {
    const broken = structuredClone(validArchive);
    Object.assign(broken.data.payments[0], fields);
    assert.throws(() => validateBackupArchive(broken), /void/i);
  }
});

test('rejects invalid archive dates and malformed base64 photo data', () => {
  const broken = structuredClone(validArchive);
  broken.exportedAt = 'not-a-date';
  assert.throws(() => validateBackupArchive(broken), /exportedAt/);
  broken.exportedAt = validArchive.exportedAt;
  broken.memberPhotos!['10'].data = '%%%';
  assert.throws(() => validateBackupArchive(broken), /photo data/);
});
