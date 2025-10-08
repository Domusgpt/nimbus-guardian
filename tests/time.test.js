import { describe, it, expect, vi } from 'vitest';
import {
  parseDateLike,
  formatRelativeTime,
  extractTimestamp,
  describeRelativeTime,
  DEFAULT_TIMESTAMP_FIELDS,
  defaultRelativeFormatter
} from '../public/js/shared/time.js';

const NOW = new Date('2024-01-01T00:00:00Z');

describe('shared/time utilities', () => {
  describe('parseDateLike', () => {
    it('parses ISO strings and numbers', () => {
      expect(parseDateLike('2024-01-01T00:00:00Z')).toBeInstanceOf(Date);
      expect(parseDateLike(1704067200000)).toBeInstanceOf(Date);
      expect(parseDateLike(1704067200)).toBeInstanceOf(Date);
    });

    it('returns null for invalid input', () => {
      expect(parseDateLike('not-a-date')).toBeNull();
      expect(parseDateLike(null)).toBeNull();
      expect(parseDateLike({})).toBeNull();
    });
  });

  describe('formatRelativeTime', () => {
    it('formats using Intl when available', () => {
      if (!defaultRelativeFormatter) {
        expect(formatRelativeTime(new Date(NOW.getTime() - 60_000), { now: NOW.getTime() }))
          .toContain('ago');
        return;
      }

      const spy = vi.spyOn(defaultRelativeFormatter, 'format');
      formatRelativeTime(new Date(NOW.getTime() - 60_000), { now: NOW.getTime() });
      expect(spy).toHaveBeenCalledWith(-1, 'minute');
      spy.mockRestore();
    });

    it('falls back to string formatting when Intl throws', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const formatter = { format: vi.fn(() => { throw new Error('boom'); }) };
      const result = formatRelativeTime(new Date(NOW.getTime() - 30_000), {
        now: NOW.getTime(),
        formatter
      });
      expect(result).toContain('seconds ago');
      expect(formatter.format).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns empty string when date cannot be parsed', () => {
      expect(formatRelativeTime('nope')).toBe('');
    });
  });

  describe('extractTimestamp', () => {
    it('resolves timestamp from standard fields', () => {
      const result = extractTimestamp({ updatedAt: NOW.toISOString() });
      expect(result?.toISOString()).toBe(NOW.toISOString());
    });

    it('falls back to provided timestamp when no fields match', () => {
      const later = new Date(NOW.getTime() + 1000);
      const result = extractTimestamp({}, { fallback: later });
      expect(result?.toISOString()).toBe(later.toISOString());
    });

    it('respects custom field order', () => {
      const record = { meta: { completedAt: NOW.toISOString(), finishedAt: new Date(NOW.getTime() + 1000).toISOString() } };
      const result = extractTimestamp(record, {
        fields: ['finishedAt', 'completedAt'],
        fallback: null
      });
      expect(result?.toISOString()).toBe(record.meta.finishedAt);
    });
  });

  describe('describeRelativeTime', () => {
    it('returns fallback when timestamp missing', () => {
      expect(describeRelativeTime()).toBe('Awaiting update');
    });

    it('uses formatter output when timestamp available', () => {
      const formatter = vi.fn(() => 'moments ago');
      expect(describeRelativeTime({ timestamp: NOW, formatter })).toBe('moments ago');
      expect(formatter).toHaveBeenCalled();
    });
  });

  it('exposes default timestamp fields for reuse', () => {
    expect(DEFAULT_TIMESTAMP_FIELDS).toContain('updatedAt');
  });
});
