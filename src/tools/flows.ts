// Savings and loans — the money taxonomy v2 moved OUT of income and spending.
//
// Moving savings and loans to transfers fixed the spending totals (a MoKash
// deposit is not money spent), but it also made them invisible: nothing showed
// how much was put aside, or what is still owed on a MoKash loan. These are
// those numbers.
//
// THE TRAP: when the savings pocket is itself a tracked account (MoKash), every
// deposit is recorded TWICE — the MoMo leg going out ("A transaction of 1000 RWF
// by Mokash Savings Account") and the MoKash leg coming in ("You have deposited
// RWF 1000 into Mokash"). Both are To Savings. Summing both would double every
// deposit. So: for MoKash, count only the savings-account side; for savings with
// no tracked account (Ejo Heza, ibimina, SACCO), count the leg that left.

export interface FlowRow {
  category: string | null;
  amount: number | null;
  transfer_direction: string | null;
  account_id: string | null;
  sms?: string | null;
}

export interface AccountLite {
  id: string;
  name?: string | null;
  type?: string | null;
}

/** Accounts that ARE a savings pocket (so their legs are the ones to count). */
export function savingsAccountIds(accounts: AccountLite[]): Set<string> {
  return new Set(
    accounts
      .filter(a => a.type === 'Savings' || /mokash|savings/i.test(a.name ?? ''))
      .map(a => a.id),
  );
}

/** Net put aside: deposits into savings minus withdrawals from it. */
export function netSaved(rows: FlowRow[], accounts: AccountLite[]): number {
  const savings = savingsAccountIds(accounts);
  const tracked = savings.size > 0;
  let net = 0;
  for (const r of rows) {
    const amt = Math.round(r.amount ?? 0);
    const onSavings = !!r.account_id && savings.has(r.account_id);
    // The MoMo leg of a MoKash move, when MoKash is tracked: its twin on the
    // MoKash account is the one counted.
    const twinElsewhere = !onSavings && tracked && /mokash/i.test(r.sms ?? '');
    if (r.category === 'to_savings') {
      if (onSavings ? r.transfer_direction === 'in' : !twinElsewhere && r.transfer_direction === 'out') {
        net += amt;
      }
    } else if (r.category === 'from_savings') {
      if (onSavings ? r.transfer_direction === 'out' : !twinElsewhere && r.transfer_direction === 'in') {
        net -= amt;
      }
    }
  }
  return net;
}

export interface LoanPosition {
  borrowed: number;
  repaid: number;
  /** What is still owed, never negative (interest/fees make repaid > borrowed). */
  owed: number;
  lent: number;
  repaidToMe: number;
  /** What others still owe the user. */
  owedToMe: number;
}

export function loanPosition(rows: FlowRow[]): LoanPosition {
  let borrowed = 0;
  let repaid = 0;
  let lent = 0;
  let repaidToMe = 0;
  for (const r of rows) {
    const amt = Math.round(r.amount ?? 0);
    if (r.category === 'loan_received') borrowed += amt;
    else if (r.category === 'loan_repayment') repaid += amt;
    else if (r.category === 'lent_out') lent += amt;
    else if (r.category === 'repaid_to_me') repaidToMe += amt;
  }
  return {
    borrowed,
    repaid,
    owed: Math.max(0, borrowed - repaid),
    lent,
    repaidToMe,
    owedToMe: Math.max(0, lent - repaidToMe),
  };
}
