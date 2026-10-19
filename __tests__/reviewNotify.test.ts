// withAnswerLocation — when a fix taken as the user answers a review question
// may stand for where the money was spent. Invented data only.
jest.mock('../src/native/NativeReviewNotifier', () => ({__esModule: true, default: null}));
jest.mock('../src/tools/database', () => ({db: {}}));
jest.mock('../src/tools/supabase', () => ({supabase: {auth: {}}}));
jest.mock('../src/tools/balance', () => ({syncAccountBalance: jest.fn()}));
jest.mock('../src/widgets/refreshWidget', () => ({refreshBalanceWidget: jest.fn()}));

import {withAnswerLocation} from '../src/tools/reviewNotify';

const paidAt = Date.parse('2026-01-01T10:00:00.000Z');
const record = {id: 'r', date_time: '2026-01-01T10:00:00.000Z', lat: null};
const fix = (minutesAfter: number) => ({
  lat: -1.95,
  lon: 30.06,
  accuracy: 20,
  locationAt: paidAt + minutesAfter * 60_000,
});

describe('withAnswerLocation', () => {
  it('attaches a fix taken soon after paying, as a real device fix', () => {
    const out = withAnswerLocation(record, fix(5), true);
    expect(out).toMatchObject({lat: -1.95, lon: 30.06, accuracy_m: 20, location_source: 'device'});
  });

  it('refuses a fix taken long after — that is where you are now, not where you paid', () => {
    expect(withAnswerLocation(record, fix(60), true).lat).toBeNull();
  });

  it('never places money coming IN (same privacy rule as live capture)', () => {
    expect(withAnswerLocation(record, fix(1), false).lat).toBeNull();
  });

  it('never overwrites a position the SMS already had', () => {
    const had = {...record, lat: 1, lon: 2, location_source: 'device'};
    expect(withAnswerLocation(had, fix(1), true)).toBe(had);
  });

  it('ignores an answer with no fix', () => {
    expect(withAnswerLocation(record, {}, true)).toBe(record);
  });
});
