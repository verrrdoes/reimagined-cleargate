import type { Metadata } from 'next';
import { registrarPage } from '@/lib/auth/guards';
import { listPasswordRequests } from '@/lib/services/passwordRequests';
import { pageHead, pageHeadSub } from '@/components/ui/recipes';
import { PasswordRequestsTable } from '@/components/staff/PasswordRequestsTable';

export const metadata: Metadata = { title: 'Password requests' };

/**
 * /password-requests: students who forgot their password, for the Registrar and admins. Allowing one lets the
 * device that asked set a new password for 15 minutes.
 */
export default async function PasswordRequestsPage() {
  await registrarPage();
  const rows = await listPasswordRequests();

  return (
    <>
      <div className={pageHead}>
        <h1>Password requests</h1>
        <p className={pageHeadSub}>
          Students who forgot their password and are asking to set a new one. Check their school ID in person, and that
          the code on their screen matches.
        </p>
      </div>

      <PasswordRequestsTable rows={rows} />
    </>
  );
}
