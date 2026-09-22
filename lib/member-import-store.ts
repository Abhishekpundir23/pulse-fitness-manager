import type { SQLiteDatabase } from 'expo-sqlite';

import { createMember, getAllPlans } from './database';
import { previewMemberImport, type MemberImportPreview } from './member-import';

export async function getImportPreview(db: SQLiteDatabase, csv: string) {
  const [plans, members] = await Promise.all([
    getAllPlans(db),
    db.getAllAsync<{ phone: string }>('SELECT phone FROM members'),
  ]);
  return previewMemberImport(csv, plans, members.map((member) => member.phone));
}

export async function importReviewedMembers(db: SQLiteDatabase, csv: string, reviewed: MemberImportPreview) {
  if (!reviewed.canImport || reviewed.errors.length) throw new Error('Resolve every CSV error and review the file before importing.');
  const memberIds: number[] = [];
  await db.withExclusiveTransactionAsync(async (transaction) => {
    // Recheck inside the write transaction: an owner may have edited a plan since preview.
    const current = await getImportPreview(transaction, csv);
    if (!current.canImport) throw new Error(current.errors.join('\n'));
    if (JSON.stringify(current.rows) !== JSON.stringify(reviewed.rows)) {
      throw new Error('Plan or member details changed after preview. Choose the CSV again and review the new totals.');
    }
    for (const row of current.rows) {
      memberIds.push(await createMember(transaction, row.input, { inTransaction: true }));
    }
  });
  return memberIds;
}
