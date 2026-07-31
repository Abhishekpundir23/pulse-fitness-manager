import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CREATE_MEMBER_PHONE_GUARDS_SQL,
  DROP_MEMBER_PHONE_GUARDS_SQL,
} from '../lib/member-phone-guards.ts';

function execute(dbPath: string, sql: string) {
  return execFileSync('sqlite3', ['-bail', dbPath], {
    encoding: 'utf8',
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('allows a lossless legacy import and reinstates duplicate-phone protection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-phone-guards-'));
  const dbPath = join(directory, 'pulse.db');
  try {
    execute(dbPath, `
      CREATE TABLE members (
        id INTEGER PRIMARY KEY,
        membership_id TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL
      );
      ${CREATE_MEMBER_PHONE_GUARDS_SQL}
      BEGIN IMMEDIATE;
      ${DROP_MEMBER_PHONE_GUARDS_SQL}
      INSERT INTO members VALUES (1, 'PF-0001', '9999999999');
      INSERT INTO members VALUES (2, 'PF-0002', '9999999999');
      ${CREATE_MEMBER_PHONE_GUARDS_SQL}
      COMMIT;
    `);

    assert.equal(execute(dbPath, 'SELECT COUNT(*) FROM members;').trim(), '2');
    assert.throws(
      () => execute(dbPath, "INSERT INTO members VALUES (3, 'PF-0003', '9999999999');"),
      /member with this phone number/i,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
