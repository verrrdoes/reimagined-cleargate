'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { fail, isUniqueViolation, runAction, type Result } from '@/lib/result';
import { bool, int, isEmail, oneOf, posInt, str } from '@/lib/input';
import { OFFICE_ICONS, PATTERNS, TERM_LABEL, termFrom } from '@/lib/constants';
import { defaultItem, loadCurrentTerm } from '@/lib/services/clearance';
import { logAdmin, plural } from '@/lib/services/adminLog';
import { parseYmd } from '@/lib/time';

// Settings (HANDOFF §8.12): offices, programs, academic years and terms. Admins only; every change is logged.

/** Rows per INSERT when filling clearances in bulk. */
const CHUNK = 1000;

const chunks = <T,>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** sort_order is a SMALLINT. */
const clampOrder = (n: number) => Math.min(32767, Math.max(0, n));

const isFkViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === 'P2003';

const done = () => revalidatePath('/settings');

/* ---------- Offices ---------- */

export type OfficeInput = {
  /** Set when editing; omitted to add an office. */
  id?: number | null;
  /** New offices only; it can't be changed later. */
  code?: string;
  name?: string;
  contactEmail?: string;
  officeHours?: string;
  icon?: string;
  sortOrder?: number | string;
  isActive?: boolean;
  /** Clear students the office never updated when its deadline passes (warned 2 days before). */
  autoClear?: boolean;
  /** Email the office's staff at 8:00 AM when uploads, messages or an auto-clear are waiting. */
  dailyDigest?: boolean;
  /** New, active offices only: also add a pending item to every clearance of the current term. */
  addToOpen?: boolean;
};

/** Adds or edits an office. Returns its id and how many open clearances it was added to. */
export async function saveOffice(input: OfficeInput): Promise<Result<{ officeId: number; addedTo: number }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const i = (input ?? {}) as Record<string, unknown>;

    const id = posInt(i.id);
    const name = str(i.name, 80);
    const contactEmail = str(i.contactEmail, 190).toLowerCase();
    const officeHours = str(i.officeHours, 80);
    const icon = oneOf(i.icon, OFFICE_ICONS);
    const sortOrder = clampOrder(int(i.sortOrder) ?? 0);
    const isActive = bool(i.isActive);
    const autoClear = bool(i.autoClear);
    const dailyDigest = bool(i.dailyDigest);
    if (!name || !officeHours) fail(400, 'missing_fields', 'Fill in the office name and hours.');
    if (!isEmail(contactEmail)) fail(400, 'invalid_email', 'Enter a valid contact email.');
    if (!icon) fail(400, 'invalid_icon', 'Choose an icon from the list.');

    if (id) {
      const out = await db.$transaction(async (tx) => {
        const old = await tx.office.findUnique({ where: { id } });
        if (!old) fail(404, 'not_found', 'Office not found.');
        await tx.office.update({ where: { id }, data: { name, contactEmail, officeHours, icon, sortOrder, isActive, autoClear, dailyDigest } });
        let details = `Updated office ${old.name}`;
        if (old.name !== name) details += ` (renamed to ${name})`;
        if (old.isActive !== isActive) details += isActive ? ', turned it on' : ', turned it off';
        if (old.autoClear !== autoClear) details += autoClear ? ', turned on auto-clear' : ', turned off auto-clear';
        if (old.dailyDigest !== dailyDigest) details += dailyDigest ? ', turned on the morning email' : ', turned off the morning email';
        await logAdmin(tx, user.id, 'office.update', details);
        return { officeId: id, addedTo: 0 };
      });
      done();
      return out;
    }

    const code = str(i.code, 20).toLowerCase();
    if (!PATTERNS.officeCode.test(code)) fail(400, 'invalid_code', 'Code must be lowercase letters, numbers or dashes, e.g. clinic.');
    const addToOpen = isActive && bool(i.addToOpen);

    try {
      const out = await db.$transaction(async (tx) => {
        const taken = await tx.office.findUnique({ where: { code }, select: { id: true } });
        if (taken) fail(409, 'code_taken', 'Another office already uses that code.');
        const office = await tx.office.create({ data: { code, name, contactEmail, officeHours, icon, sortOrder, isActive, autoClear, dailyDigest } });

        let addedTo = 0;
        const ct = addToOpen ? await loadCurrentTerm(tx) : null;
        if (ct) {
          const open = await tx.clearance.findMany({
            where: { academicYearId: ct.academicYearId, term: ct.term },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          const item = defaultItem(name);
          for (const part of chunks(open)) {
            const r = await tx.clearanceItem.createMany({
              data: part.map((c) => ({ clearanceId: c.id, officeId: office.id, ...item })),
              skipDuplicates: true,
            });
            addedTo += r.count;
          }
        }

        await logAdmin(
          tx,
          user.id,
          'office.create',
          `Added office ${name} (${code})${addedTo ? `, added to ${plural(addedTo, 'open clearance')}` : ''}`,
        );
        return { officeId: office.id, addedTo };
      });
      done();
      return out;
    } catch (e) {
      if (isUniqueViolation(e)) fail(409, 'code_taken', 'Another office already uses that code.');
      throw e;
    }
  });
}

/* ---------- Programs ---------- */

/** Adds or renames a program (the list on the student application form). */
export async function saveProgram(input: { id?: number | null; code?: string; name?: string }): Promise<Result<{ programId: number }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const i = (input ?? {}) as Record<string, unknown>;

    const id = posInt(i.id);
    const code = str(i.code, 10).toUpperCase();
    const name = str(i.name, 120);
    if (!PATTERNS.programCode.test(code)) fail(400, 'invalid_code', 'Code must be 2 to 10 letters or numbers, e.g. BSCE.');
    if (!name) fail(400, 'missing_fields', 'Enter the program name.');

    try {
      const out = await db.$transaction(async (tx) => {
        const same = await tx.program.findUnique({ where: { code }, select: { id: true } });
        if (same && same.id !== id) fail(409, 'code_taken', 'Another program already uses that code.');

        if (id) {
          const old = await tx.program.findUnique({ where: { id } });
          if (!old) fail(404, 'not_found', 'Program not found.');
          await tx.program.update({ where: { id }, data: { code, name } });
          await logAdmin(tx, user.id, 'program.update', `Updated program ${old.code} to ${code}, ${name}`);
          return { programId: id };
        }

        const program = await tx.program.create({ data: { code, name } });
        await logAdmin(tx, user.id, 'program.create', `Added program ${code}, ${name}`);
        return { programId: program.id };
      });
      done();
      return out;
    } catch (e) {
      if (isUniqueViolation(e)) fail(409, 'code_taken', 'Another program already uses that code.');
      throw e;
    }
  });
}

/** Deletes a program that no student or application uses. */
export async function deleteProgram(input: { id: number }): Promise<Result<{ code: string }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const id = posInt((input as Record<string, unknown> | null)?.id);
    if (!id) fail(404, 'not_found', 'Program not found.');

    const inUse = (code: string) => `${code} still has students or applications, so it can't be deleted. Rename it instead.`;
    let code = '';
    try {
      await db.$transaction(async (tx) => {
        const p = await tx.program.findUnique({
          where: { id },
          include: { _count: { select: { students: true, applications: true } } },
        });
        if (!p) fail(404, 'not_found', 'Program not found.');
        code = p.code;
        if (p._count.students + p._count.applications > 0) fail(409, 'in_use', inUse(p.code));
        await tx.program.delete({ where: { id } });
        await logAdmin(tx, user.id, 'program.delete', `Deleted program ${p.code}, ${p.name}`);
      });
    } catch (e) {
      // A student or application was added between the check and the delete.
      if (isFkViolation(e)) fail(409, 'in_use', inUse(code || 'This program'));
      throw e;
    }
    done();
    return { code };
  });
}

/* ---------- Academic years and terms ---------- */

/** Adds an academic year (not current). The label is made from the years: "2026 - 2027". */
export async function saveYear(input: { startDate?: string; endDate?: string }): Promise<Result<{ label: string }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const i = (input ?? {}) as Record<string, unknown>;

    const start = parseYmd(typeof i.startDate === 'string' ? i.startDate : null);
    const end = parseYmd(typeof i.endDate === 'string' ? i.endDate : null);
    if (!start || !end || end <= start) fail(400, 'invalid_dates', 'Enter a start date and a later end date.');
    const label = `${start.slice(0, 4)} - ${end.slice(0, 4)}`;
    const exists = () => fail(409, 'exists', `Academic year ${label} already exists.`);

    try {
      await db.$transaction(async (tx) => {
        if (await tx.academicYear.findUnique({ where: { label }, select: { id: true } })) exists();
        await tx.academicYear.create({
          data: { label, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`), isCurrent: false },
        });
        await logAdmin(tx, user.id, 'year.create', `Added academic year ${label} (${start} to ${end})`);
      });
    } catch (e) {
      if (isUniqueViolation(e)) exists();
      throw e;
    }
    done();
    return { label };
  });
}

/** Makes one academic year current (and every other one not current). */
export async function setCurrentYear(input: { id: number }): Promise<Result<{ label: string }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const id = posInt((input as Record<string, unknown> | null)?.id);
    if (!id) fail(404, 'not_found', 'Academic year not found.');

    const label = await db.$transaction(async (tx) => {
      const year = await tx.academicYear.findUnique({ where: { id } });
      if (!year) fail(404, 'not_found', 'Academic year not found.');
      // The partial unique index allows one current year, so the old one is cleared first.
      await tx.academicYear.updateMany({ where: { isCurrent: true, NOT: { id } }, data: { isCurrent: false } });
      if (!year.isCurrent) await tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
      await logAdmin(tx, user.id, 'year.current', `Set ${year.label} as the current academic year`);
      return year.label;
    });
    done();
    return { label };
  });
}

/**
 * Opens a term: a clearance for every active student in that academic year and term, each with a pending
 * item for every active office. Students who already have one are skipped (same result as openClearance()
 * per student, done in bulk in one transaction).
 */
export async function openTerm(input: { yearId: number; term: string }): Promise<Result<{ opened: number; already: number }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const i = (input ?? {}) as Record<string, unknown>;

    const term = termFrom(i.term);
    if (!term) fail(400, 'invalid_term', 'Choose 1st Semester, 2nd Semester or Summer.');
    const yearId = posInt(i.yearId);
    if (!yearId) fail(404, 'not_found', 'Academic year not found.');

    const out = await db.$transaction(async (tx) => {
      const year = await tx.academicYear.findUnique({ where: { id: yearId } });
      if (!year) fail(404, 'not_found', 'Academic year not found.');

      const [students, offices] = await Promise.all([
        tx.student.findMany({ where: { user: { isActive: true } }, select: { id: true }, orderBy: { id: 'asc' } }),
        tx.office.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
      ]);
      const templates = offices.map((o) => ({ officeId: o.id, ...defaultItem(o.name) }));

      let opened = 0;
      for (const part of chunks(students)) {
        const created = await tx.clearance.createManyAndReturn({
          data: part.map((s) => ({ studentId: s.id, academicYearId: year.id, term })),
          skipDuplicates: true,
          select: { id: true },
        });
        opened += created.length;
        if (!templates.length || !created.length) continue;
        const items = created.flatMap((c) => templates.map((t) => ({ clearanceId: c.id, ...t })));
        for (const rows of chunks(items)) await tx.clearanceItem.createMany({ data: rows });
      }

      await logAdmin(tx, user.id, 'term.open', `Opened ${TERM_LABEL[term]}, A.Y ${year.label}: ${plural(opened, 'new clearance')}`);
      return { opened, already: students.length - opened };
    });
    done();
    return out;
  });
}
