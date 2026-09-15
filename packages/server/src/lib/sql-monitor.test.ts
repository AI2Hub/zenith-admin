import { describe, expect, it } from 'vitest';
import { scrubSqlText } from './sql-monitor';

describe('scrubSqlText', () => {
  it('removes literals, comments, and dollar-quoted bodies while preserving SQL shape', () => {
    expect(scrubSqlText("SELECT * FROM users WHERE email = 'alice@example.com' AND id = 42 -- secret"))
      .toBe('SELECT * FROM users WHERE email = ? AND id = ?');
    expect(scrubSqlText("DO $$ BEGIN RAISE NOTICE 'secret'; END $$;"))
      .toBe('DO ?;');
  });

  it('truncates long statements and hides incomplete quotes', () => {
    expect(scrubSqlText("SELECT 'unfinished", 100)).toBe('[SQL 已隐藏]');
    expect(scrubSqlText('SELECT ' + 'x'.repeat(100), 20)).toBe('SELECT xxxxxxxxxxxx…');
  });

  it('returns null for empty input', () => {
    expect(scrubSqlText(null)).toBeNull();
    expect(scrubSqlText('   ')).toBeNull();
  });
});
