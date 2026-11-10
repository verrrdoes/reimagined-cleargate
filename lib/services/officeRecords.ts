import 'server-only';
import { db, type Tx } from '@/lib/db';
import { fail } from '@/lib/result';
import { cut } from '@/lib/input';
import { currentTerm, defaultItem, termText, updateClearanceItem, type Actor } from '@/lib/services/clearance';
import { reviewerName } from '@/lib/services/review';
import { moneyOf, settledItemText, storedValues, templateFor, type RecordValues } from '@/lib/officeRecords';
import type { SessionUser } from '@/lib/auth/session';
import type { ItemStatus, Prisma } from '@/generated/prisma/client';

// Office records (lib/officeRecords.ts has the per-office templates). Records belong to a clearance item; adding one
// makes the item Needs action with text written from the records still open, and settling the last one hands the
// move back to the office.

const actorSelect = {
  select: { role: true, email: true, fullName: true, staffProfile: { select: { fullName: true } } },
} satisfies Prisma.UserDefaultArgs;

type ActorRow = Prisma.UserGetPayload<typeof actorSelect> | null;
const nameOfActor = (u: ActorRow) => (u ? reviewerName(u.staffProfile?.fullName ?? u.fullName, u.role, u.email) : null);

/* ---------- Which office ---------- */

export type RecordsOffice = { id: number; code: string; name: string };

/** Staff work on their own office's records; admins on the office they name. */
export async function recordsOffice(user: SessionUser, officeCode?: string | null): Promise<RecordsOffice> {
  if (user.role === 'staff') {
    if (!user.staffProfile) fail(403, 'no_office', 'Your staff account is not linked to an office.');
    const o = user.staffProfile.office;
    return { id: o.id, code: o.code, name: o.name };
  }
  if (user.role !== 'admin') fail(403, 'forbidden', 'Only office staff can manage records.');
  const office = officeCode ? await db.office.findUnique({ where: { code: officeCode }, select: { id: true, code: true, name: true } }) : null;
  if (!office) fail(400, 'invalid_office', 'Choose an office.');
  return office;
}

/* ---------- Keeping the requirement in step ---------- */

/**
 * Rewrites the student's requirement for this item from its open records: Needs action with the office's own wording
 * while any is open; back to Pending (the office's move) once none is, if it was Needs action: "everything on record is
 * settled", or the office's first-review text when nothing was ever settled (a record removed as a mistake). A cleared
 * item that gets a new record is reopened. The student is told whenever the status changes.
 */
export async function syncItem(tx: Tx, itemId: number, actor: Actor, note: string): Promise<void> {
  const item = await tx.clearanceItem.findUnique({
    where: { id: itemId },
    select: {
      status: true,
      office: { select: { code: true, name: true } },
      records: { where: { settledAt: null }, orderBy: { id: 'asc' }, select: { fields: true } },
    },
  });
  if (!item) return;
  const template = templateFor(item.office.code);
  const open = item.records.map((r) => storedValues(template, r.fields));
  let text;
  let status: ItemStatus;
  if (open.length) {
    text = template.itemText(open, item.office.name);
    status = 'needs_action';
  } else if (item.status === 'needs_action') {
    const settled = await tx.officeRecord.count({ where: { itemId, settledAt: { not: null } } });
    text = settled ? settledItemText(item.office.name) : defaultItem(item.office.name);
    status = 'pending';
  } else return;
  await updateClearanceItem(tx, {
    itemId,
    status,
    task: cut(text.task, 160),
    remarks: cut(text.remarks, 120),
    description: cut(text.description, 255),
    nextStep: cut(text.nextStep, 255),
    note: cut(note, 255),
    actor,
  });
}

/* ---------- The Records page ---------- */

export type RecordRow = {
  id: number;
  itemId: number;
  studentName: string;
  studentNumber: string;
  values: RecordValues;
  money: number;
  createdAt: string;
  createdBy: string | null;
  settledAt: string | null;
  settledBy: string | null;
  settleNote: string | null;
  /** The student's status with this office now. */
  itemStatus: ItemStatus;
  /** Records still open for this student, this one included if it is. */
  openForStudent: number;
};

export type RecordStudent = { itemId: number; number: string; name: string; status: ItemStatus };

export type OfficeRecords = {
  office: RecordsOffice;
  termLabel: string;
  rows: RecordRow[];
  /** Every student with a clearance this term, for adding a record. */
  students: RecordStudent[];
  /** Students marked Needs action with nothing open on record (set by hand on Clearance status). */
  untracked: number;
};

const studentName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;

export async function officeRecords(office: RecordsOffice): Promise<OfficeRecords | null> {
  const term = await currentTerm();
  if (!term) return null;
  const itemWhere: Prisma.ClearanceItemWhereInput = {
    officeId: office.id,
    clearance: { academicYearId: term.academicYearId, term: term.term },
  };
  const template = templateFor(office.code);
  const [records, items] = await Promise.all([
    db.officeRecord.findMany({
      where: { item: itemWhere },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        itemId: true,
        fields: true,
        createdAt: true,
        settledAt: true,
        settleNote: true,
        createdBy: actorSelect,
        settledBy: actorSelect,
        item: { select: { status: true, clearance: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } } } },
      },
    }),
    db.clearanceItem.findMany({
      where: itemWhere,
      select: { id: true, status: true, clearance: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } } },
    }),
  ]);

  const openCount = new Map<number, number>();
  for (const r of records) if (!r.settledAt) openCount.set(r.itemId, (openCount.get(r.itemId) ?? 0) + 1);

  return {
    office,
    termLabel: termText(term),
    rows: records.map((r) => {
      const values = storedValues(template, r.fields);
      const s = r.item.clearance.student;
      return {
        id: r.id,
        itemId: r.itemId,
        studentName: studentName(s),
        studentNumber: s.studentNumber,
        values,
        money: moneyOf(template, values),
        createdAt: r.createdAt.toISOString(),
        createdBy: nameOfActor(r.createdBy),
        settledAt: r.settledAt?.toISOString() ?? null,
        settledBy: nameOfActor(r.settledBy),
        settleNote: r.settleNote,
        itemStatus: r.item.status,
        openForStudent: openCount.get(r.itemId) ?? 0,
      };
    }),
    untracked: items.filter((i) => i.status === 'needs_action' && !openCount.has(i.id)).length,
    students: items
      .map((i) => ({ itemId: i.id, number: i.clearance.student.studentNumber, name: studentName(i.clearance.student), status: i.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Open records for the staff Dashboard: how many, for how many students, and the money they add up to. */
export async function openRecordCounts(officeId: number, officeCode: string) {
  const term = await currentTerm();
  if (!term) return { records: 0, students: 0, money: 0 };
  const rows = await db.officeRecord.findMany({
    where: { settledAt: null, item: { officeId, clearance: { academicYearId: term.academicYearId, term: term.term } } },
    select: { itemId: true, fields: true },
  });
  const template = templateFor(officeCode);
  return {
    records: rows.length,
    students: new Set(rows.map((r) => r.itemId)).size,
    money: rows.reduce((t, r) => t + moneyOf(template, storedValues(template, r.fields)), 0),
  };
}

/* ---------- The student's view ---------- */

export type StudentRecord = { id: number; main: string; details: string[]; settledAt: string | null; settledWord: string; settleNote: string | null };

/** Each item's records for the student, open ones first, keyed by item id. */
export async function studentRecords(itemIds: number[], officeCodeOf: Map<number, string>): Promise<Map<number, StudentRecord[]>> {
  const out = new Map<number, StudentRecord[]>();
  if (!itemIds.length) return out;
  const rows = await db.officeRecord.findMany({
    where: { itemId: { in: itemIds } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, itemId: true, fields: true, settledAt: true, settleNote: true },
  });
  for (const r of rows) {
    const template = templateFor(officeCodeOf.get(r.itemId) ?? '');
    const d = template.describe(storedValues(template, r.fields));
    const rec: StudentRecord = {
      id: r.id,
      main: d.main,
      details: d.details,
      settledAt: r.settledAt?.toISOString() ?? null,
      settledWord: template.settle.done,
      settleNote: r.settleNote,
    };
    out.set(r.itemId, [...(out.get(r.itemId) ?? []), rec]);
  }
  for (const list of out.values()) list.sort((a, b) => Number(a.settledAt !== null) - Number(b.settledAt !== null));
  return out;
}
