// Shapes shared by server code and client components. Dates cross the boundary as ISO strings.

export type RoleName = 'student' | 'staff' | 'admin';
export type ItemStatus = 'needs_action' | 'pending' | 'approved';
export type Tone = ItemStatus | 'info';
export type SubmissionStatusName = 'submitted' | 'approved' | 'returned' | 'replaced';
export type TermName = 'first_semester' | 'second_semester' | 'summer';
export type Portal = 'student' | 'staff';

export type NotificationView = {
  id: number;
  tone: Tone;
  title: string;
  body: string;
  link: string | null;
  officeIcon: string | null;
  unread: boolean;
  createdAt: string;
};

/** What the app shell needs: the user chip, the bell and the sidebar badge. Refreshed by GET /api/me. */
export type ShellData = {
  portal: Portal;
  userId: number;
  email: string;
  role: RoleName;
  name: string;
  initials: string;
  roleLine: string;
  avatarUrl: string | null;
  isRegistrar: boolean;
  isAdmin: boolean;
  unreadMessages: number;
  notifications: NotificationView[];
  serverNow: string;
};

export type MePoll = Pick<ShellData, 'unreadMessages' | 'notifications' | 'serverNow'>;

export type OfficeRef = { code: string; name: string };
