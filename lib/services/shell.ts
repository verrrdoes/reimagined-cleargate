import 'server-only';
import { db } from '@/lib/db';
import { sha256Hex } from '@/lib/ids';
import { displayName, isRegistrar, type SessionUser } from '@/lib/auth/guards';
import { notificationList } from '@/lib/services/notifications';
import { initialsOf } from '@/components/ui/initials';
import type { Portal, ShellData } from '@/lib/types';

/** "Student · 2026-00012", "Library staff", "Administrator", or "Staff" for a staff account without an office. */
export function roleLine(user: SessionUser): string {
  if (user.role === 'admin') return 'Administrator';
  if (user.role === 'student') return user.student ? `Student · ${user.student.studentNumber}` : 'Student';
  return user.staffProfile ? `${user.staffProfile.office.name} staff` : 'Staff';
}

/** The avatar route with a version from the stored key, so a new photo is not served from cache. */
export function avatarUrl(user: Pick<SessionUser, 'id' | 'avatarKey'>): string | null {
  if (!user.avatarKey) return null;
  return `/api/files/avatar/${user.id}?v=${sha256Hex(user.avatarKey).slice(0, 8)}`;
}

/**
 * Unread office messages for the sidebar badge (legacy unread_messages).
 * Staff: messages from students on their office's items. Admins: every office.
 * Students: replies from offices on the items of their latest clearance.
 */
export async function countUnreadMessages(user: SessionUser): Promise<number> {
  if (user.role === 'student') {
    if (!user.student) return 0;
    const latest = await db.clearance.findFirst({
      where: { studentId: user.student.id },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { term: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!latest) return 0;
    return db.officeMessage.count({
      where: { readAt: null, senderRole: { not: 'student' }, item: { clearanceId: latest.id } },
    });
  }
  if (user.role === 'staff') {
    if (!user.staffProfile) return 0;
    return db.officeMessage.count({
      where: { readAt: null, senderRole: 'student', item: { officeId: user.staffProfile.officeId } },
    });
  }
  return db.officeMessage.count({ where: { readAt: null, senderRole: 'student' } });
}

/** Everything the app shell shows: the account chip, the bell and the message badge. Also used by GET /api/me. */
export async function getShellData(user: SessionUser, portal: Portal): Promise<ShellData> {
  const [unreadMessages, notifications] = await Promise.all([countUnreadMessages(user), notificationList(user.id)]);
  const name = displayName(user);
  return {
    portal,
    userId: user.id,
    email: user.email,
    role: user.role,
    name,
    initials: initialsOf(name),
    roleLine: roleLine(user),
    avatarUrl: avatarUrl(user),
    isRegistrar: isRegistrar(user),
    isAdmin: user.role === 'admin',
    unreadMessages,
    notifications,
    serverNow: new Date().toISOString(),
  };
}
