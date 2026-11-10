// Deadline and reminder dialogs, reusable from other staff pages (for example the office status list).
// Each one is a client component; render it once and drive it with `open`.
export { OfficeDeadlineDialog, type OfficeDeadlineTarget } from './OfficeDeadlineDialog';
export { StudentDeadlineDialog } from './StudentDeadlineDialog';
export { ReminderDialog } from './ReminderDialog';
export { ConfirmDialog } from './ConfirmDialog';
export { StudentPicker } from './StudentPicker';
export { DueText } from './shared';
export type { DeadlineItem, DeadlineOffice, OfficeChoice, ReminderAudienceName, ReminderRow, DeadlinesView } from './types';
