// notATransaction — the gate that keeps ads and security notices out of the
// ledger. All messages below are INVENTED in the shape of real templates; the
// repo is public, so no real names, numbers or references.
import {notATransaction} from '../src/tools/smsParser';

describe('notATransaction', () => {
  // The incident: an MTN loan ad was filed as a 258,000 RWF expense on MoKash.
  it.each([
    ['English loan ad', 'Yello! Convenience at your fingertips! Dial *182*5*1# and borrow up to Rwf 250000 with MoKash.'],
    ['Kinyarwanda loan ad', 'Yello! Ukeneye amafaranga byihutirwa? Kanda *182*5*1# uhite ubona inguzanyo ya MoKash kugeza kuri Rwf 250000!'],
    ['lottery ad', 'Nawe waba umwe mubanyamahirwe babona umugabane muri 10,000,000Frw! Kanda *456*25# winjire.'],
    ['limit notice', 'Dear customer, maximum transfers to MoMo via the App are temporarily set at 500,000 RWF per day.'],
    ['loan offer', 'Good news! You qualify for a loan top-up starting from RWF 1,200,000 . To receive the amount, dial *334#.'],
    ['one-time code', 'Never share this code with anyone. Use code 123456 to send 50000.00 RWF to TEST USER 0000*****0000.'],
    ['sign-in alert (no amount)', 'ALERT!: New device sign-in detected. Dear TEST USER, your account was accessed from a new device on 2026-01-01 10:00.'],
  ])('rejects a %s', (_label, sms) => {
    expect(notATransaction(sms)).toBe(true);
  });

  it.each([
    ['MoKash deposit', "Y'ello. You have deposited RWF 1000 into Mokash from your Mobile Money Account. Your new  Mokash balance is RWF 1500.Ref 10000000001"],
    ['MoMo side of a deposit', "*164*S*Y'ello, A transaction of 1000 RWF by Mokash Savings Account was completed at 2026-01-01 10:00:00. Balance:2000 RWF. Fee  0 RWF. FT Id: 10000000001.*EN#"],
    ['loan repayment ("Rwf." with a full stop)', "Y'ello. Rwf. 1500 has been deducted from your Mobile Money account to repay your overdue loan. Your current loan balance is now Rwf. 10000."],
    ['bundle purchase', 'You bought 5GB bundle for 2,000 RWF.'],
    ['bundle activation', 'Yello!You have successfully activated 10000Frw=30720MB worth 10,000 RWF'],
    ['Kinyarwanda airtime send', 'Ibyo mwasabye byakunze! woherereje 0780000000 Me2u ya 2000Frw=3GB'],
    ['Kinyarwanda airtime received', 'Yello, wohererejwe inite za 3000RWF avuye kuri nomero 0780000000 byagenze neza.'],
    ['Kinyarwanda "it went through"', 'Yello, kohereza inite za 500RWF kuri nomero 0780000000 byagenze neza'],
    ['Kinyarwanda loan paid off', 'Umaze kwishyura ideni rya Ihereze 1150.00 Frw. Ideni ryawe ryose rirarangiye.'],
    ['card authorisation', 'Dear TEST, Auth for card 0000..0000 Date:2026-01-01 10:00:00 Amt: RWF 5 000.00 Details:TEST SHOP . Customer Care: +250700000000'],
    ['BankRef deposit', 'TESTBANK would like notify you about a mobile Money deposit of 5,500 FRW by TEST USER Msg:thanks BankRef: 2601010000'],
    ['loan repayment success', 'Dear Customer, Your loan repayment of RWF 677.0 was successful.'],
  ])('keeps a %s', (_label, sms) => {
    expect(notATransaction(sms)).toBe(false);
  });
});
