import { requireRegistrar } from '@/lib/auth/guards';
import { csvResponse, toCsv } from '@/lib/csv';
import { route } from '@/lib/result';
import { reportCsvData } from '@/lib/services/reports';

/**
 * GET /api/reports/export: the current term's clearances as a CSV file for Excel (§8.10).
 * 404 no_term when no academic year is current.
 */
export const GET = route(async () => {
  await requireRegistrar();
  const { filename, header, rows } = await reportCsvData();
  return csvResponse(filename, toCsv(header, rows));
});
