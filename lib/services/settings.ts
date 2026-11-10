import 'server-only';
import { db } from '@/lib/db';
import { TERMS, TERM_LABEL } from '@/lib/constants';
import { currentTerm, type CurrentTerm } from '@/lib/services/clearance';
import type { TermName } from '@/lib/types';

/* ---------- §8.12 Settings (admins): offices, programs, academic years and terms ---------- */

export type SettingsOffice = {
  id: number;
  code: string;
  name: string;
  contactEmail: string;
  officeHours: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  /** Clears students the office never updated when its deadline passes. */
  autoClear: boolean;
  /** Emails the office's staff at 8:00 AM when work is waiting. */
  dailyDigest: boolean;
  staff: number;
};

export type SettingsProgram = { id: number; code: string; name: string; students: number; applications: number };

export type SettingsYear = {
  id: number;
  label: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  isCurrent: boolean;
  /** Terms with at least one clearance, oldest first. */
  termsOpened: { term: TermName; label: string }[];
};

export type Settings = {
  offices: SettingsOffice[];
  programs: SettingsProgram[];
  years: SettingsYear[];
  current: CurrentTerm | null;
  activeStudents: number;
};

/** A DATE column comes back as midnight UTC; this is its calendar day. */
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function getSettings(): Promise<Settings> {
  const [offices, programs, years, opened, current, activeStudents] = await Promise.all([
    db.office.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { staff: true } } },
    }),
    db.program.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { students: true, applications: true } } },
    }),
    db.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
    db.clearance.groupBy({ by: ['academicYearId', 'term'] }),
    currentTerm(),
    db.student.count({ where: { user: { isActive: true } } }),
  ]);

  const termsByYear = new Map<number, Set<TermName>>();
  for (const row of opened) {
    let set = termsByYear.get(row.academicYearId);
    if (!set) termsByYear.set(row.academicYearId, (set = new Set()));
    set.add(row.term);
  }

  return {
    offices: offices.map((o) => ({
      id: o.id,
      code: o.code,
      name: o.name,
      contactEmail: o.contactEmail,
      officeHours: o.officeHours,
      icon: o.icon,
      sortOrder: o.sortOrder,
      isActive: o.isActive,
      autoClear: o.autoClear,
      dailyDigest: o.dailyDigest,
      staff: o._count.staff,
    })),
    programs: programs.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      students: p._count.students,
      applications: p._count.applications,
    })),
    years: years.map((y) => {
      const set = termsByYear.get(y.id);
      return {
        id: y.id,
        label: y.label,
        startDate: ymd(y.startDate),
        endDate: ymd(y.endDate),
        isCurrent: y.isCurrent,
        termsOpened: TERMS.filter((t) => set?.has(t)).map((t) => ({ term: t, label: TERM_LABEL[t] })),
      };
    }),
    current,
    activeStudents,
  };
}
