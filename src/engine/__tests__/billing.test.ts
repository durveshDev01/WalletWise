/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  billDateInMonth,
  billReminders,
  dateInDays,
  daysInMonth,
  daysUntilDue,
  daysUntilExpiry,
  isValidBillDay,
  localIsoDate,
  ordinalDay,
  parseBillDay,
  upcomingDueDates,
} from '../billing';

const day = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (dates: Date[]) => dates.map(localIsoDate);

describe('bill day validation', () => {
  it('accepts 1 to 31 only', () => {
    assert.equal(isValidBillDay(1), true);
    assert.equal(isValidBillDay(31), true);
    assert.equal(isValidBillDay(0), false);
    assert.equal(isValidBillDay(32), false);
    assert.equal(isValidBillDay(5.5), false);
    assert.equal(isValidBillDay('5'), false);
  });

  it('parses typed text', () => {
    assert.equal(parseBillDay('5'), 5);
    assert.equal(parseBillDay(' 28 '), 28);
    assert.equal(parseBillDay(''), undefined);
    assert.equal(parseBillDay('0'), undefined);
    assert.equal(parseBillDay('45'), undefined);
  });
});

describe('months with fewer days', () => {
  it('knows month lengths, including leap years', () => {
    assert.equal(daysInMonth(2026, 1), 28);
    assert.equal(daysInMonth(2028, 1), 29);
    assert.equal(daysInMonth(2026, 3), 30);
    assert.equal(daysInMonth(2026, 11), 31);
  });

  it('moves day 31 to the last day of a short month', () => {
    assert.equal(localIsoDate(billDateInMonth(2026, 1, 31)), '2026-02-28');
    assert.equal(localIsoDate(billDateInMonth(2028, 1, 30)), '2028-02-29');
    assert.equal(localIsoDate(billDateInMonth(2026, 3, 31)), '2026-04-30');
    assert.equal(localIsoDate(billDateInMonth(2026, 0, 31)), '2026-01-31');
  });

  it('rolls month 12 into January of the next year', () => {
    assert.equal(localIsoDate(billDateInMonth(2026, 12, 5)), '2027-01-05');
  });
});

describe('upcomingDueDates', () => {
  it('uses this month when the due day has not passed', () => {
    assert.deepEqual(iso(upcomingDueDates(25, day(2026, 10, 20))), ['2026-10-25', '2026-11-25']);
  });

  it('counts today as upcoming', () => {
    assert.deepEqual(iso(upcomingDueDates(20, day(2026, 10, 20, 18))), ['2026-10-20', '2026-11-20']);
  });

  it('moves to next month once the day has passed', () => {
    assert.deepEqual(iso(upcomingDueDates(5, day(2026, 10, 20))), ['2026-11-05', '2026-12-05']);
  });

  it('crosses the year end', () => {
    assert.deepEqual(iso(upcomingDueDates(10, day(2026, 12, 15))), ['2027-01-10', '2027-02-10']);
  });

  it('handles day 31 through February', () => {
    assert.deepEqual(iso(upcomingDueDates(31, day(2027, 1, 31, 12), 3)), ['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('returns nothing for an invalid day', () => {
    assert.deepEqual(upcomingDueDates(0, day(2026, 10, 20)), []);
  });
});

describe('daysUntilDue', () => {
  it('counts whole days', () => {
    assert.equal(daysUntilDue(25, day(2026, 10, 20, 22)), 5);
    assert.equal(daysUntilDue(20, day(2026, 10, 20, 8)), 0);
    assert.equal(daysUntilDue(1, day(2026, 10, 31)), 1);
  });
});

describe('billReminders', () => {
  it('reminds 3 days and 1 day before, at 9 AM', () => {
    const r = billReminders(25, day(2026, 10, 1));
    assert.deepEqual(
      r.map((x) => [localIsoDate(x.fireAt), x.fireAt.getHours(), x.daysBefore, localIsoDate(x.dueDate)]),
      [
        ['2026-10-22', 9, 3, '2026-10-25'],
        ['2026-10-24', 9, 1, '2026-10-25'],
        ['2026-11-22', 9, 3, '2026-11-25'],
        ['2026-11-24', 9, 1, '2026-11-25'],
      ],
    );
  });

  it('skips reminders whose time has passed and fills from later months', () => {
    // Due on the 22nd; at 10 AM on the 21st both reminders for this month have gone.
    const r = billReminders(22, day(2026, 10, 21, 10));
    assert.deepEqual(iso(r.map((x) => x.fireAt)), ['2026-11-19', '2026-11-21', '2026-12-19', '2026-12-21']);
  });

  it('keeps the 1-day reminder when only the 3-day one has passed', () => {
    const r = billReminders(25, day(2026, 10, 23));
    assert.deepEqual(iso(r.map((x) => x.fireAt)), ['2026-10-24', '2026-11-22', '2026-11-24', '2026-12-22']);
  });

  it('crosses month starts: due on the 1st reminds at the end of the month before', () => {
    const r = billReminders(1, day(2026, 2, 20));
    assert.deepEqual(iso(r.map((x) => x.fireAt)), ['2026-02-26', '2026-02-28', '2026-03-29', '2026-03-31']);
  });

  it('uses the last day of a short month as the due date', () => {
    const r = billReminders(31, day(2026, 2, 1));
    assert.equal(localIsoDate(r[0].dueDate), '2026-02-28');
    assert.equal(localIsoDate(r[0].fireAt), '2026-02-25');
  });

  it('never returns more than two months of reminders', () => {
    assert.equal(billReminders(15, day(2026, 10, 1)).length, 4);
  });
});

describe('ordinalDay', () => {
  it('writes days in plain English', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinalDay), [
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ]);
  });
});

describe('daysUntilExpiry and dateInDays', () => {
  it('counts days remaining until an expiry date', () => {
    const from = day(2026, 11, 5);
    assert.equal(daysUntilExpiry('2026-11-23', from), 18);
    assert.equal(daysUntilExpiry('2026-11-06', from), 1);
    assert.equal(daysUntilExpiry('2026-11-05', from), 0);
    // past date returns 0
    assert.equal(daysUntilExpiry('2026-10-31', from), 0);
    // invalid string returns null
    assert.equal(daysUntilExpiry('', from), null);
    assert.equal(daysUntilExpiry(undefined, from), null);
    assert.equal(daysUntilExpiry('not-a-date', from), null);
  });

  it('generates future ISO date given a day offset', () => {
    const from = day(2026, 11, 5);
    assert.equal(dateInDays(18, from), '2026-11-23');
    assert.equal(dateInDays(0, from), '2026-11-05');
  });
});

