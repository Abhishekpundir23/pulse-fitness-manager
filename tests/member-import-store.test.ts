import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateDbIfNeeded, createPlan, updatePlan } from '../lib/database.ts';
import { getImportPreview, importReviewedMembers } from '../lib/member-import-store.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

const csv = 'name,phone,plan_name,start_date,paid_amount,payment_method\nAsha,9876543210,My plan,2026-09-01,200,Cash\nBob,9876543211,My plan,2026-09-01,500,UPI';

async function setup() {
  const database = memoryDatabase();
  await migrateDbIfNeeded(database.db);
  await createPlan(database.db, 'My plan', 2, 900);
  return database;
}

test('imports reviewed members, memberships and opening payments as one consistent batch', async () => {
  const { db, close } = await setup();
  try {
    const preview = await getImportPreview(db, csv);
    const result = await importReviewedMembers(db, csv, preview);
    assert.equal(result.length, 2);
    assert.deepEqual({ ...await db.getFirstAsync<Record<string, number>>('SELECT COUNT(*) AS count, SUM(total_amount-paid_amount) AS due FROM memberships') }, { count: 2, due: 1100 });
    assert.deepEqual({ ...await db.getFirstAsync<Record<string, number>>('SELECT SUM(amount) AS amount FROM payments') }, { amount: 700 });
    await assert.rejects(importReviewedMembers(db, csv, preview), /already exists/);
    assert.deepEqual({ ...await db.getFirstAsync<Record<string, number>>('SELECT COUNT(*) AS count FROM members') }, { count: 2 });
  } finally { close(); }
});

test('changed plan prices or durations invalidate the reviewed preview without writes', async () => {
  const { db, close } = await setup();
  try {
    const preview = await getImportPreview(db, csv);
    const plan = await db.getFirstAsync<{id: number}>('SELECT id FROM plans LIMIT 1');
    await updatePlan(db, plan!.id, 'My plan', 3, 900);
    await assert.rejects(importReviewedMembers(db, csv, preview), /changed/);
    assert.deepEqual({ ...await db.getFirstAsync<Record<string, number>>('SELECT COUNT(*) AS count FROM members') }, { count: 0 });
  } finally { close(); }
});

test('a write failure on a later row rolls back earlier members and payments', async () => {
  const { db, close } = await setup();
  try {
    const preview = await getImportPreview(db, csv);
    await db.execAsync("CREATE TRIGGER fail_import BEFORE INSERT ON members WHEN NEW.name = 'Bob' BEGIN SELECT RAISE(ABORT, 'Simulated storage failure'); END;");
    await assert.rejects(importReviewedMembers(db, csv, preview), /Simulated storage failure/);
    for (const table of ['members', 'memberships', 'payments']) {
      assert.deepEqual({ ...await db.getFirstAsync<Record<string, number>>(`SELECT COUNT(*) AS count FROM ${table}`) }, { count: 0 });
    }
  } finally { close(); }
});
