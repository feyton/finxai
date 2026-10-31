// A description typed while offline must survive however the record is filed.
// Invented data only.
import {keepPendingNote, pendingNoteFor} from '../src/tools/pendingNotes';
import {promoteAutoRecord} from '../src/tools/smsIngest';

jest.mock('../src/tools/balance', () => ({syncAccountBalance: jest.fn()}));

function fakeDb(filed = false) {
  const calls: {sql: string; params: any[]}[] = [];
  return {
    calls,
    execute: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({sql, params});
      if (/SELECT 1 FROM transactions WHERE id/.test(sql)) {
        return {rows: {_array: filed ? [{1: 1}] : []}};
      }
      return {rows: {_array: []}};
    }),
  };
}

const record = {
  id: 'rec-1',
  amount: 3000,
  account_id: 'acct-1',
  category: 'groceries',
  transaction_type: 'expense',
  merchant: 'Test Market',
  sms: 'payment of 3000 RWF to Test Market',
  date_time: '2026-01-01T10:00:00.000Z',
};

it('a plain Confirm files the note typed while offline — and forgets it after', async () => {
  await keepPendingNote('rec-1', 'fruits 2000 and vegetables 1000');
  const db = fakeDb();
  await promoteAutoRecord(db, {record, ownerId: 'o', direction: 'debit', balanceAfter: null});
  const ins = db.calls.find(c => c.sql.includes('INSERT INTO transactions'))!;
  expect(ins.params).toContain('fruits 2000 and vegetables 1000');
  expect(await pendingNoteFor('rec-1')).toBeNull();
});

it('also when the transaction was already filed (a stale pending copy)', async () => {
  await keepPendingNote('rec-1', 'bread for the house');
  const db = fakeDb(true);
  await promoteAutoRecord(db, {record, ownerId: 'o', direction: 'debit', balanceAfter: null});
  const upd = db.calls.find(c => c.sql.includes('SET note = COALESCE(note, ?)'))!;
  expect(upd.params).toEqual(['bread for the house', 'rec-1']);
});

it('a note typed in the Fix sheet wins over a kept one', async () => {
  await keepPendingNote('rec-1', 'old words');
  const db = fakeDb();
  await promoteAutoRecord(db, {
    record,
    ownerId: 'o',
    direction: 'debit',
    balanceAfter: null,
    overrides: {note: 'new words'},
  });
  const ins = db.calls.find(c => c.sql.includes('INSERT INTO transactions'))!;
  expect(ins.params).toContain('new words');
  expect(ins.params).not.toContain('old words');
});
