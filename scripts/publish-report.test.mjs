import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportRow, publishReport } from './publish-report.mjs';

test('buildReportRow rejects a malformed date', () => {
  assert.throws(() => buildReportRow({ reportDate: '08-20-2026', markdown: 'x' }), /YYYY-MM-DD/);
});

test('buildReportRow rejects empty markdown', () => {
  assert.throws(() => buildReportRow({ reportDate: '2026-08-20', markdown: '   ' }), /must not be empty/);
});

test('buildReportRow passes through summary and data_availability', () => {
  const row = buildReportRow({ reportDate: '2026-08-20', markdown: '# Report', summary: { call: 'neutral' }, dataAvailability: { vix: 'unavailable' } });
  assert.deepEqual(row, { report_date: '2026-08-20', markdown: '# Report', summary: { call: 'neutral' }, data_availability: { vix: 'unavailable' } });
});

test('buildReportRow defaults summary and data_availability to empty objects', () => {
  const row = buildReportRow({ reportDate: '2026-08-20', markdown: '# Report' });
  assert.deepEqual(row.summary, {});
  assert.deepEqual(row.data_availability, {});
});

function fakeSupabase(response) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        upsert(row, opts) {
          calls.push(['upsert', row, opts]);
          return { select: () => ({ single: async () => response }) };
        },
      };
    },
  };
}

test('publishReport upserts on report_date and returns the saved row', async () => {
  const client = fakeSupabase({ data: { id: '1', report_date: '2026-08-20' }, error: null });
  const result = await publishReport(client, { reportDate: '2026-08-20', markdown: '# R' });
  assert.deepEqual(result, { id: '1', report_date: '2026-08-20' });
  assert.deepEqual(client.calls[0], ['from', 'reports']);
  assert.deepEqual(client.calls[1], ['upsert', { report_date: '2026-08-20', markdown: '# R', summary: {}, data_availability: {} }, { onConflict: 'report_date' }]);
});

test('publishReport throws with a readable message when Supabase errors', async () => {
  const client = fakeSupabase({ data: null, error: { message: 'permission denied' } });
  await assert.rejects(() => publishReport(client, { reportDate: '2026-08-20', markdown: '# R' }), /permission denied/);
});
