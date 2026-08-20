import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function buildReportRow({ reportDate, markdown, summary = {}, dataAvailability = {} }) {
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error(`reportDate must be YYYY-MM-DD, got: ${reportDate}`);
  }
  if (!markdown || markdown.trim().length === 0) {
    throw new Error('markdown must not be empty');
  }
  return {
    report_date: reportDate,
    markdown,
    summary,
    data_availability: dataAvailability,
  };
}

export async function publishReport(supabaseClient, params) {
  const row = buildReportRow(params);
  const { data, error } = await supabaseClient
    .from('reports')
    .upsert(row, { onConflict: 'report_date' })
    .select()
    .single();
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return data;
}

export function createSupabaseClient({ url, serviceRoleKey } = {}) {
  const supabaseUrl = url ?? process.env.SUPABASE_URL;
  const key = serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [, , markdownPath, reportDate, summaryPath, availabilityPath] = process.argv;
  if (!markdownPath || !reportDate) {
    console.error('Usage: node publish-report.mjs <markdown-file> <YYYY-MM-DD> [summary.json] [availability.json]');
    process.exit(1);
  }
  const markdown = await readFile(markdownPath, 'utf-8');
  const summary = summaryPath ? JSON.parse(await readFile(summaryPath, 'utf-8')) : {};
  const dataAvailability = availabilityPath ? JSON.parse(await readFile(availabilityPath, 'utf-8')) : {};
  const client = createSupabaseClient({});
  const row = await publishReport(client, { reportDate, markdown, summary, dataAvailability });
  console.log(`Published report for ${row.report_date}`);
}
