import { requireUser } from '@/lib/auth/guards';
import { fail, route } from '@/lib/result';
import { verifyPath } from '@/lib/certificate';
import { certificatePdf } from '@/lib/certificatePdf';
import { certificateFor, latestClearanceId } from '@/lib/services/certificate';

/**
 * GET /api/certificate[?download=1]: the signed-in student's clearance certificate as a PDF, once every office has
 * cleared them. Inline by default (opens in the browser's PDF viewer to print), attachment with ?download=1.
 * The QR code points at this site's own /verify page, so a certificate from the live site checks on the live site.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(['student']);
  const clearanceId = user.student ? await latestClearanceId(user.student.id) : null;
  const data = clearanceId === null ? null : await certificateFor(clearanceId);
  if (!data) fail(404, 'no_clearance', 'You have no clearance yet.');
  if (!data.valid) fail(409, 'not_cleared', 'Your certificate is ready once every office has cleared you.');

  const url = new URL(req.url);
  const pdf = certificatePdf(data, `${url.origin}${verifyPath(data.code)}`);
  const name = `Clearance-Certificate-${data.student.number.replace(/[^\w-]/g, '')}.pdf`;
  const download = url.searchParams.get('download') === '1';
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
