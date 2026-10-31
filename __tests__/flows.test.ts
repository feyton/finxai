// Savings and loans totals. Invented data.
import {loanPosition, netSaved} from '../src/tools/flows';

const momo = {id: 'momo', name: 'MTN MoMo', type: 'Mobile Money'};
const mokash = {id: 'mokash', name: 'MoKash Savings', type: 'Savings'};
const row = (over: any) => ({category: null, amount: 0, transfer_direction: null, account_id: 'momo', sms: '', ...over});

describe('netSaved', () => {
  it('a MoKash deposit recorded on BOTH legs counts once', () => {
    const rows = [
      row({category: 'to_savings', amount: 1000, transfer_direction: 'out', account_id: 'momo', sms: 'A transaction of 1000 RWF by Mokash Savings Account was completed'}),
      row({category: 'to_savings', amount: 1000, transfer_direction: 'in', account_id: 'mokash', sms: 'You have deposited RWF 1000 into Mokash'}),
    ];
    expect(netSaved(rows, [momo, mokash])).toBe(1000);
  });

  it('a withdrawal from MoKash reduces it', () => {
    const rows = [
      row({category: 'to_savings', amount: 5000, transfer_direction: 'in', account_id: 'mokash', sms: 'deposited into Mokash'}),
      row({category: 'from_savings', amount: 2000, transfer_direction: 'out', account_id: 'mokash', sms: 'transferred from your Mokash account'}),
      row({category: 'from_savings', amount: 2000, transfer_direction: 'in', account_id: 'momo', sms: 'received from Mokash'}),
    ];
    expect(netSaved(rows, [momo, mokash])).toBe(3000);
  });

  it('savings with no tracked account (Ejo Heza) count from the leg that left', () => {
    const rows = [row({category: 'to_savings', amount: 2000, transfer_direction: 'out', account_id: 'momo', sms: 'Payment to EJO HEZA'})];
    expect(netSaved(rows, [momo, mokash])).toBe(2000);
  });

  it('without a tracked MoKash account, the MoMo leg is the one counted', () => {
    const rows = [row({category: 'to_savings', amount: 1000, transfer_direction: 'out', account_id: 'momo', sms: 'by Mokash Savings Account'})];
    expect(netSaved(rows, [momo])).toBe(1000);
  });

  it('ignores everything that is not savings', () => {
    expect(netSaved([row({category: 'groceries', amount: 5000, transfer_direction: null})], [momo, mokash])).toBe(0);
  });
});

describe('loanPosition', () => {
  it('owed = borrowed − repaid, never negative; lending tracked separately', () => {
    const p = loanPosition([
      row({category: 'loan_received', amount: 98100}),
      row({category: 'loan_repayment', amount: 40000}),
      row({category: 'lent_out', amount: 50000}),
      row({category: 'repaid_to_me', amount: 20000}),
    ]);
    expect(p).toEqual({borrowed: 98100, repaid: 40000, owed: 58100, lent: 50000, repaidToMe: 20000, owedToMe: 30000});
    expect(loanPosition([row({category: 'loan_repayment', amount: 10})]).owed).toBe(0);
  });
});
