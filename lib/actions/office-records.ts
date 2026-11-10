'use server';

import { revalidatePath } from 'next/cache';
import { db, type Tx } from '@/lib/db';
import { fail, runAction, type Result } from '@/lib/result';
import { actorOf, requireStaff, staffOfficeId, type SessionUser } from '@/lib/auth/guards';
import { loadCurrentTerm, termText, updateClearanceItem } from '@/lib/services/clearance';
import { logAdmin, plural } from '@/lib/services/adminLog';
import { recordsOffice, syncItem, type RecordsOffice } from '@/lib/services/officeRecords';
import { checkRecord, readImport, storedValues, templateFor, type RecordValues } from '@/lib/officeRecords';
import { bool, optStr, posInt, str } from '@/lib/input';

// Office records (Records page): staff add, settle, reopen and remove their own office's records, or import a list.
// Every change rewrites the student's requirement for that office (syncItem), so the student sees it at once.

/** The longest list one import takes. */
const MAX_IMPORT_ROWS = 500;
/** Interactive transactions default to 5 s; an import rewrites one requirement per student. */
const LONG_TX = { timeout: 60_000, maxWait: 10_000 };

function after() {
  revalidatePath('/records');
  revalidatePath('/office-status');
  revalidatePath('/overview');
}

function officeCode(input: unknown): string | null {
  return optStr((input as { office?: unknown } | null)?.office, 40);
}

/** This term's requirement for the office and item, or 404. */
async function termItem(tx: Tx, office: RecordsOffice, itemId: number) {
  const term = await loadCurrentTerm(tx);
  if (!term) fail(400, 'no_term', 'No current academic year is set.');
  const item = await tx.clearanceItem.findFirst({
    where: { id: itemId, officeId: office.id, clearance: { academicYearId: term.academicYearId, term: term.term } },
    select: { id: true, clearance: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } } },
  });
  if (!item) fail(404, 'no_student', `That student has no ${office.name} clearance this term.`);
  return item;
}

/** A record the user may change: staff only their own office's. */
async function ownRecord(tx: Tx, user: SessionUser, recordId: number) {
  const r = await tx.officeRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      itemId: true,
      fields: true,
      settledAt: true,
      item: {
        select: {
          officeId: true,
          office: { select: { code: true, name: true } },
          clearance: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } },
        },
      },
    },
  });
  if (!r) fail(404, 'no_record', 'That record is gone. Refresh the page.');
  const own = staffOfficeId(user);
  if (own !== null && own !== r.item.officeId) fail(403, 'forbidden', "You can't change another office's records.");
  const template = templateFor(r.item.office.code);
  const s = r.item.clearance.student;
  return {
    ...r,
    template,
    main: template.describe(storedValues(template, r.fields)).main,
    student: `${s.firstName} ${s.lastName} (${s.studentNumber})`,
  };
}

/* ---------- Add ---------- */

export async function addRecord(input: { office?: string; itemId: number; values: Record<string, string> }): Promise<Result<{ id: number }>> {
  return runAction(async () => {
    const user = await requireStaff();
    const office = await recordsOffice(user, officeCode(input));
    const itemId = posInt((input as { itemId?: unknown } | null)?.itemId);
    if (!itemId) fail(400, 'no_student', 'Choose a student.');
    const raw = (input as { values?: unknown } | null)?.values;
    const template = templateFor(office.code);
    const checked = checkRecord(template, raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
    if (!checked.ok) fail(400, 'invalid_record', Object.values(checked.errors).join(' '));

    const id = await db.$transaction(async (tx) => {
      await termItem(tx, office, itemId);
      const rec = await tx.officeRecord.create({ data: { itemId, fields: checked.values, createdById: user.id }, select: { id: true } });
      await syncItem(tx, itemId, actorOf(user), `Added to ${office.name} records: ${template.describe(checked.values).main}`);
      return rec.id;
    });
    after();
    return { id };
  });
}

/* ---------- Settle, reopen, remove ---------- */

/**
 * Marks a record settled (returned, paid, completed...). With `clear`, and when it was the student's last open record,
 * the office clears the student in the same step; otherwise the requirement goes back to the office to clear.
 */
export async function settleRecord(input: { recordId: number; note?: string; clear?: boolean }): Promise<Result<{ cleared: boolean }>> {
  return runAction(async () => {
    const user = await requireStaff();
    const i = (input ?? {}) as Record<string, unknown>;
    const recordId = posInt(i.recordId);
    if (!recordId) fail(400, 'no_record', 'Choose a record.');
    const note = optStr(i.note, 120);
    const clear = bool(i.clear);

    const cleared = await db.$transaction(async (tx) => {
      const r = await ownRecord(tx, user, recordId);
      if (r.settledAt) fail(409, 'already_settled', `That record is already marked ${r.template.settle.done.toLowerCase()}.`);
      await tx.officeRecord.update({ where: { id: r.id }, data: { settledAt: new Date(), settledById: user.id, settleNote: note } });
      const open = await tx.officeRecord.count({ where: { itemId: r.itemId, settledAt: null } });
      if (clear && open === 0) {
        await updateClearanceItem(tx, {
          itemId: r.itemId,
          status: 'approved',
          // The settled records stay listed under it, struck through, so the headline needn't repeat them.
          task: 'All settled, cleared',
          remarks: 'Everything on record is settled',
          description: `${r.item.office.name} has cleared your account.`,
          nextStep: null,
          note: `${r.template.settle.done}: ${r.main}. Cleared from Records.`,
          actor: actorOf(user),
        });
        return true;
      }
      await syncItem(tx, r.itemId, actorOf(user), `${r.template.settle.done}: ${r.main}`);
      return false;
    });
    after();
    return { cleared };
  });
}

/** Opens a settled record again (marked by mistake): the student's requirement comes back. */
export async function reopenRecord(input: { recordId: number }): Promise<Result<null>> {
  return runAction(async () => {
    const user = await requireStaff();
    const recordId = posInt((input as { recordId?: unknown } | null)?.recordId);
    if (!recordId) fail(400, 'no_record', 'Choose a record.');
    await db.$transaction(async (tx) => {
      const r = await ownRecord(tx, user, recordId);
      if (!r.settledAt) return;
      await tx.officeRecord.update({ where: { id: r.id }, data: { settledAt: null, settledById: null, settleNote: null } });
      await syncItem(tx, r.itemId, actorOf(user), `Reopened on ${r.item.office.name} records: ${r.main}`);
    });
    after();
    return null;
  });
}

/** Removes a record entered by mistake. Removing an open one updates the student's requirement. */
export async function deleteRecord(input: { recordId: number }): Promise<Result<null>> {
  return runAction(async () => {
    const user = await requireStaff();
    const recordId = posInt((input as { recordId?: unknown } | null)?.recordId);
    if (!recordId) fail(400, 'no_record', 'Choose a record.');
    await db.$transaction(async (tx) => {
      const r = await ownRecord(tx, user, recordId);
      await tx.officeRecord.delete({ where: { id: r.id } });
      if (!r.settledAt) await syncItem(tx, r.itemId, actorOf(user), `Removed from ${r.item.office.name} records: ${r.main}`);
      await logAdmin(tx, user.id, 'records.delete', `Removed a ${r.item.office.name} record for ${r.student}: ${r.main}`);
    });
    after();
    return null;
  });
}

/* ---------- Import ---------- */

export type ImportPreviewRow = {
  line: number;
  studentNumber: string;
  studentName: string | null;
  values: RecordValues;
  /** null: will be added. */
  problem: string | null;
};

export type ImportResult = {
  rows: ImportPreviewRow[];
  /** Rows that will be (or were) added, and for how many students. */
  ready: number;
  students: number;
  /** True once the rows were saved. */
  saved: boolean;
};

/**
 * Imports a list pasted from a spreadsheet or read from a CSV file. Without `confirm` it only checks the list and says
 * what would happen; with it, it adds the rows that check out. A row that matches a record the student already has
 * open is skipped, so importing the same list twice adds nothing.
 */
export async function importRecords(input: { office?: string; text: string; confirm?: boolean }): Promise<Result<ImportResult>> {
  return runAction(async () => {
    const user = await requireStaff();
    const office = await recordsOffice(user, officeCode(input));
    const i = (input ?? {}) as Record<string, unknown>;
    const text = str(i.text, 200_000);
    const confirm = bool(i.confirm);
    const template = templateFor(office.code);
    const parsed = readImport(template, text);
    if (!parsed.length) {
      fail(400, 'empty', text ? 'The list has a header row but no students under it.' : 'Paste a list or choose a CSV file first.');
    }
    if (parsed.length > MAX_IMPORT_ROWS) fail(400, 'too_many', `Import at most ${MAX_IMPORT_ROWS} rows at a time.`);

    const term = await loadCurrentTerm();
    if (!term) fail(400, 'no_term', 'No current academic year is set.');
    const numbers = [...new Set(parsed.map((r) => r.studentNumber).filter(Boolean))];
    const items = await db.clearanceItem.findMany({
      where: {
        officeId: office.id,
        clearance: { academicYearId: term.academicYearId, term: term.term, student: { studentNumber: { in: numbers } } },
      },
      select: {
        id: true,
        clearance: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } },
        records: { where: { settledAt: null }, select: { fields: true } },
      },
    });
    const byNumber = new Map(items.map((it) => [it.clearance.student.studentNumber, it]));

    const seen = new Set<string>();
    const toAdd: { itemId: number; values: RecordValues }[] = [];
    const rows: ImportPreviewRow[] = parsed.map((p) => {
      const item = byNumber.get(p.studentNumber);
      const name = item ? `${item.clearance.student.firstName} ${item.clearance.student.lastName}` : null;
      const values = p.ok ? p.values : {};
      let problem: string | null = p.ok ? null : p.error;
      if (!problem && !item) problem = `No student ${p.studentNumber} has a clearance this term.`;
      if (!problem && item) {
        const key = `${item.id}|${JSON.stringify(values)}`;
        const already = item.records.some((r) => JSON.stringify(storedValues(template, r.fields)) === JSON.stringify(values));
        if (already) problem = 'Already on record; skipped.';
        else if (seen.has(key)) problem = 'Same as an earlier row; skipped.';
        else {
          seen.add(key);
          toAdd.push({ itemId: item.id, values });
        }
      }
      return { line: p.line, studentNumber: p.studentNumber, studentName: name, values, problem };
    });
    const students = new Set(toAdd.map((a) => a.itemId)).size;

    if (!confirm || !toAdd.length) return { rows, ready: toAdd.length, students, saved: false };

    await db.$transaction(async (tx) => {
      await tx.officeRecord.createMany({ data: toAdd.map((a) => ({ itemId: a.itemId, fields: a.values, createdById: user.id })) });
      for (const itemId of new Set(toAdd.map((a) => a.itemId))) {
        await syncItem(tx, itemId, actorOf(user), `Added to ${office.name} records by import`);
      }
      await logAdmin(
        tx,
        user.id,
        'records.import',
        `Imported ${plural(toAdd.length, template.noun[0], template.noun[1])} for ${plural(students, 'student')} into ${office.name} records (${termText(term)})`,
      );
    }, LONG_TX);
    after();
    return { rows, ready: toAdd.length, students, saved: true };
  });
}
