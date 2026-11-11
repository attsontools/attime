export function parseUnixInput(input: string): number | null {
  const value = input.trim();
  if (!/^-?\d{1,19}$/.test(value)) return null;
  const number = Number(value);
  if (value.length <= 10) return number * 1000;
  if (value.length <= 13) return number;
  if (value.length <= 16) return Math.floor(number / 1000);
  return Math.floor(number / 1_000_000);
}

export interface TimezoneDisplay {
  zone: string;
  formatted: string;
  offset: string;
}

export const DEFAULT_DISPLAY_ZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC'
];

export function formatInZones(
  ms: number,
  zones: string[] = DEFAULT_DISPLAY_ZONES
): TimezoneDisplay[] {
  return zones.map((zone) => {
    try {
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      }).formatToParts(new Date(ms));
      const part = (type: Intl.DateTimeFormatPartTypes) => (
        parts.find((item) => item.type === type)?.value ?? ''
      );
      return {
        zone,
        formatted: `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`,
        offset: part('timeZoneName')
      };
    } catch {
      return { zone, formatted: '<不支持的时区>', offset: '' };
    }
  });
}

export function wallInZoneToMs(wall: string, zone: string): number | null {
  const match = wall.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const asUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0
  );
  return asUtc - zoneOffsetMs(asUtc, zone);
}

function zoneOffsetMs(atMs: number, zone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(atMs));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(
      parts.find((item) => item.type === type)?.value
    );
    return Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    ) - atMs;
  } catch {
    return 0;
  }
}

const DURATION_PATTERN = /(-?\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|毫秒|秒|分钟?|小时|天|周)/gi;

const UNIT_MILLISECONDS: Record<string, number> = {
  ms: 1,
  毫秒: 1,
  s: 1000,
  秒: 1000,
  m: 60_000,
  分: 60_000,
  分钟: 60_000,
  h: 3_600_000,
  小时: 3_600_000,
  d: 86_400_000,
  天: 86_400_000,
  w: 604_800_000,
  周: 604_800_000
};

export function parseDuration(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  let matched = false;
  let total = 0;
  value.replace(DURATION_PATTERN, (_full, number: string, unit: string) => {
    matched = true;
    total += Number(number) * UNIT_MILLISECONDS[unit.toLowerCase()];
    return '';
  });
  return matched ? total : null;
}

export function formatDurationHuman(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const sign = ms < 0 ? '-' : '';
  let remaining = Math.abs(ms);
  const values = [
    ['周', 604_800_000],
    ['天', 86_400_000],
    ['小时', 3_600_000],
    ['分钟', 60_000],
    ['秒', 1000],
    ['毫秒', 1]
  ] as const;
  const parts: string[] = [];
  for (const [label, unit] of values) {
    const count = Math.floor(remaining / unit);
    remaining -= count * unit;
    if (count) parts.push(`${count} ${label}`);
  }
  return parts.length ? `${sign}${parts.join(' ')}` : '0 毫秒';
}

export interface CronParts {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function parseCronField(spec: string, min: number, max: number): number[] {
  const value = spec.trim();
  if (!value) throw new Error('空字段');
  const result = new Set<number>();
  for (const part of value.split(',')) {
    let step = 1;
    let range = part;
    if (range.includes('/')) {
      const [rangeValue, stepValue] = range.split('/');
      step = Math.max(1, Number.parseInt(stepValue, 10));
      range = rangeValue;
    }
    let low = min;
    let high = max;
    if (range === '*') {
      // The defaults already cover the full field range.
    } else if (range.includes('-')) {
      const [start, end] = range.split('-');
      low = Number.parseInt(start, 10);
      high = Number.parseInt(end, 10);
    } else {
      low = high = Number.parseInt(range, 10);
    }
    if (Number.isNaN(low) || Number.isNaN(high) || low < min || high > max || low > high) {
      throw new Error(`字段范围非法：${part}（应在 ${min}..${max}）`);
    }
    for (let current = low; current <= high; current += step) result.add(current);
  }
  return [...result].sort((left, right) => left - right);
}

export function parseCron(expression: string): CronParts {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron 应有 5 段（分 时 日 月 周），当前 ${fields.length}`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    minute: parseCronField(minute, 0, 59),
    hour: parseCronField(hour, 0, 23),
    dayOfMonth: parseCronField(dayOfMonth, 1, 31),
    month: parseCronField(month, 1, 12),
    dayOfWeek: parseCronField(dayOfWeek.replace(/\b7\b/g, '0'), 0, 6)
  };
}

export function cronNextRuns(parts: CronParts, from: number, count: number): number[] {
  const runs: number[] = [];
  const current = new Date(from);
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);
  const end = from + 366 * 24 * 60 * 60 * 1000;
  while (current.getTime() <= end && runs.length < count) {
    if (
      parts.minute.includes(current.getMinutes()) &&
      parts.hour.includes(current.getHours()) &&
      parts.dayOfMonth.includes(current.getDate()) &&
      parts.month.includes(current.getMonth() + 1) &&
      parts.dayOfWeek.includes(current.getDay())
    ) {
      runs.push(current.getTime());
    }
    current.setMinutes(current.getMinutes() + 1);
  }
  return runs;
}

export function describeCron(parts: CronParts): string {
  const describe = (values: number[], min: number, max: number, label: string) => {
    if (values.length === max - min + 1) return `每${label}`;
    if (values.length === 1) return `第 ${values[0]} ${label}`;
    return `${label} ${values.slice(0, 8).join('/')}${values.length > 8 ? '…' : ''}`;
  };
  return [
    describe(parts.minute, 0, 59, '分'),
    describe(parts.hour, 0, 23, '时'),
    describe(parts.dayOfMonth, 1, 31, '日'),
    describe(parts.month, 1, 12, '月'),
    describe(parts.dayOfWeek, 0, 6, '周')
  ].join('，');
}
