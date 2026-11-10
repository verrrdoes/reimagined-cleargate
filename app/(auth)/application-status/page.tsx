import type { Metadata } from 'next';
import { ApplicationStatus } from '@/components/applications/ApplicationStatus';
import { manilaYear } from '@/lib/time';

export const metadata: Metadata = { title: 'Application status' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Public: where an applicant follows their application (HANDOFF §8.3). The browser that applied checks with
 * its saved status token; anyone else looks the application up by reference, personal email and birthday.
 * ?ref= picks the application (and prefills the lookup form).
 */
export default async function ApplicationStatusPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const reference = (raw ?? '').trim().toUpperCase().slice(0, 20);
  return <ApplicationStatus initialReference={reference} year={manilaYear()} />;
}
