import { requireRegistrar } from '@/lib/auth/guards';
import { csvResponse, toCsv } from '@/lib/csv';
import { route } from '@/lib/result';
import { AUDIT_CSV_HEADER, auditCsvName, auditCsvRows, auditRange, auditRows } from '@/lib/services/audit';

/**
 * GET /api/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD: the audit log for that date range as a CSV file
 * (§8.11). Every row in range up to the 1,000-row cap, regardless of the on-screen search or type filter.
 */
export const GET = route(async (req: Request) => {
  await requireRegistrar();
  const params = new URL(req.url).searchParams;
  const range = auditRange(params.get('from'), params.get('to'));
  const rows = await auditRows(range);
  return csvResponse(auditCsvName(range), toCsv(AUDIT_CSV_HEADER, auditCsvRows(rows)));
});
