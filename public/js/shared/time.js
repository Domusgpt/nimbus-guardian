const DEFAULT_TIMESTAMP_FIELDS = [
  'timestamp',
  'updatedAt',
  'generatedAt',
  'scannedAt',
  'completedAt',
  'finishedAt',
  'createdAt'
];

const DEFAULT_DIVISIONS = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' }
];

const defaultRelativeTimeFormatter = typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
  ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  : null;

export function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const millis = value > 1e12 ? value : value * 1000;
    const numericDate = new Date(millis);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate;
  }

  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

function fallbackRelativeFormatter(rounded, unit) {
  const absolute = Math.abs(rounded);
  const pluralizedUnit = absolute === 1 ? unit : `${unit}s`;
  const suffix = rounded > 0 ? 'from now' : 'ago';
  return `${absolute} ${pluralizedUnit} ${suffix}`;
}

export function formatRelativeTime(value, {
  now = Date.now(),
  formatter = defaultRelativeTimeFormatter,
  divisions = DEFAULT_DIVISIONS
} = {}) {
  const date = value instanceof Date ? value : parseDateLike(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const diffInSeconds = (date.getTime() - now) / 1000;
  let duration = diffInSeconds;
  let unit = 'second';

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      unit = division.unit;
      break;
    }
    duration /= division.amount;
  }

  const rounded = Math.round(duration);

  if (formatter && typeof formatter.format === 'function') {
    try {
      return formatter.format(rounded, unit);
    } catch (error) {
      console.warn('RelativeTimeFormat failed, falling back to string formatter.', error);
    }
  }

  return fallbackRelativeFormatter(rounded, unit);
}

export function extractTimestamp(record, {
  fields = DEFAULT_TIMESTAMP_FIELDS,
  fallback,
  parse = parseDateLike
} = {}) {
  if (!record || typeof record !== 'object') {
    return fallback ? parse(fallback) : null;
  }

  for (const field of fields) {
    const candidate = parse(record[field] || record.meta?.[field]);
    if (candidate) {
      return candidate;
    }
  }

  return fallback ? parse(fallback) : null;
}

export function describeRelativeTime({
  timestamp,
  fallbackMessage = 'Awaiting update',
  formatter = formatRelativeTime,
  now = Date.now()
} = {}) {
  const date = timestamp instanceof Date ? timestamp : parseDateLike(timestamp);
  if (!date) {
    return fallbackMessage;
  }

  const relative = formatter(date, { now });
  return relative || fallbackMessage;
}

export { DEFAULT_TIMESTAMP_FIELDS };
export const defaultRelativeFormatter = defaultRelativeTimeFormatter;
