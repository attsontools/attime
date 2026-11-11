import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cronNextRuns,
  describeCron,
  formatDurationHuman,
  formatInZones,
  parseCron,
  parseDuration,
  parseUnixInput,
  wallInZoneToMs
} from '../src/time';

test('user can convert Unix seconds to milliseconds', () => {
  assert.equal(parseUnixInput('1516239022'), 1_516_239_022_000);
});

test('user can enter Unix values at all supported precisions', () => {
  assert.equal(parseUnixInput('1516239022123'), 1_516_239_022_123);
  assert.equal(parseUnixInput('1516239022123456'), 1_516_239_022_123);
  assert.equal(parseUnixInput('1516239022123456789'), 1_516_239_022_123);
  assert.equal(parseUnixInput('abc'), null);
  assert.equal(parseUnixInput(''), null);
});

test('user can view one instant in a selected IANA time zone', () => {
  assert.deepEqual(formatInZones(1_516_239_022_000, ['UTC']), [{
    zone: 'UTC',
    formatted: '2018-01-18 01:30:22',
    offset: 'UTC'
  }]);
});

test('user can interpret wall-clock time in an IANA time zone', () => {
  assert.equal(
    wallInZoneToMs('2026-11-12 14:30:00', 'Asia/Shanghai'),
    Date.UTC(2026, 10, 12, 6, 30, 0)
  );
  assert.equal(wallInZoneToMs('not-a-date', 'Asia/Shanghai'), null);
});

test('user can convert duration expressions with existing unit rules', () => {
  assert.equal(parseDuration('1h30m'), 5_400_000);
  assert.equal(parseDuration('1天2小时30分钟'), 95_400_000);
  assert.equal(parseDuration('1.5h'), 5_400_000);
  assert.equal(parseDuration('-2m'), -120_000);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1hgarbage'), 3_600_000);
  assert.equal(parseDuration('garbage'), null);
});

test('user can read a duration as Chinese units', () => {
  assert.equal(formatDurationHuman(694_861_005), '1 周 1 天 1 小时 1 分钟 1 秒 5 毫秒');
  assert.equal(formatDurationHuman(-60_000), '-1 分钟');
  assert.equal(formatDurationHuman(0), '0 毫秒');
});

test('user can parse supported five-field Cron expressions', () => {
  const everyFiveMinutes = parseCron('*/5 * * * *');
  assert.deepEqual(everyFiveMinutes.minute, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  assert.deepEqual(parseCron('0,15,30,45 9-17 * * 1-5').hour, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(parseCron('0 9 * * 7').dayOfWeek, [0]);
  assert.throws(() => parseCron('* * *'), /Cron 应有 5 段/);
  assert.throws(() => parseCron('60 * * * *'), /字段范围非法/);
});

test('user can see the next eight Cron runs in local time', () => {
  const from = new Date(2026, 0, 1, 0, 0, 30).getTime();
  const runs = cronNextRuns(parseCron('*/5 * * * *'), from, 8);
  assert.equal(runs.length, 8);
  assert.equal(new Date(runs[0]).getMinutes(), 5);
  assert.equal(runs[7] - runs[0], 35 * 60_000);
});

test('user can read a Chinese description of a Cron schedule', () => {
  assert.equal(
    describeCron(parseCron('0 9 * * 1-5')),
    '第 0 分，第 9 时，每日，每月，周 1/2/3/4/5'
  );
});
