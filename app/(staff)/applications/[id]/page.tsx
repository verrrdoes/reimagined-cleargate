import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { registrarPage } from '@/lib/auth/guards';
import { posInt } from '@/lib/input';
import { getApplication } from '@/lib/services/applications';
import { ApplicationReview } from '@/components/applications/ApplicationReview';

export const metadata: Metadata = { title: 'Review application' };

/** /applications/{id}: every field and the photo, then approve (creates the account), reject or reset (§8.3). */
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await registrarPage();
  const { id: raw } = await params;
  const id = posInt(raw);
  if (!id) notFound();
  const detail = await getApplication(id);
  if (!detail) notFound();
  // Keyed by id so moving between applications starts with a clean decision panel.
  return <ApplicationReview key={detail.id} detail={detail} />;
}
