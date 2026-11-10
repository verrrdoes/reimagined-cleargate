// Office records: what each office keeps on record against a student (incomplete grades, borrowed books, balances,
// missing documents, guidance requirements, borrowed equipment). One template per office names the fields, checks
// what staff type or import, and writes the student's requirement text from the records still open.
// Client-safe: the staff forms and the import preview use it too. Queries are in lib/services/officeRecords.ts.
import { formatDate } from '@/lib/time';

export type FieldType = 'text' | 'money' | 'date' | 'choice';

export type RecordField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Longest text accepted (text fields). */
  max?: number;
  choices?: readonly string[];
  placeholder?: string;
};

/** A record's details: text and choices as strings, money as a number of pesos, dates as YYYY-MM-DD. */
export type RecordValues = Record<string, string | number>;

export type ItemText = { task: string; remarks: string; description: string; nextStep: string };

export type RecordTemplate = {
  /** Page title on the staff side, e.g. "Incomplete grades". */
  title: string;
  /** One record, several records: "incomplete grade", "incomplete grades". */
  noun: readonly [string, string];
  /** What the list is for, under the page title. */
  intro: string;
  fields: readonly RecordField[];
  /** The settle button, the word for a settled record, and what the office may note when settling. */
  settle: { action: string; done: string; noteLabel: string };
  /** The record in a list: its main text and the smaller details after it. */
  describe(v: RecordValues): { main: string; details: string[] };
  /** The student's requirement while these records are open (at least one). */
  itemText(open: RecordValues[], officeName: string): ItemText;
};

/* ---------- Formatting ---------- */

/** "PHP 5,250" or "PHP 40.50" */
export function peso(n: number): string {
  const whole = Number.isInteger(n);
  return `PHP ${n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const str = (v: RecordValues, key: string) => {
  const x = v[key];
  return typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '';
};
const num = (v: RecordValues, key: string) => (typeof v[key] === 'number' ? (v[key] as number) : 0);
const day = (ymd: string) => (ymd ? formatDate(`${ymd}T12:00:00+08:00`) : '');
const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/* ---------- The six offices ---------- */

const dean: RecordTemplate = {
  title: 'Incomplete grades',
  noun: ['incomplete grade', 'incomplete grades'],
  intro: 'Subjects where a student still has INC, NFE or NG. Mark one completed when the final grade is in.',
  fields: [
    { key: 'subject', label: 'Subject', type: 'text', required: true, max: 80, placeholder: 'Subject code and title' },
    { key: 'grade', label: 'Grade', type: 'choice', required: true, choices: ['INC', 'NFE', 'NG'] },
    { key: 'instructor', label: 'Instructor', type: 'text', max: 80, placeholder: "Instructor's name" },
    { key: 'term', label: 'Term taken', type: 'text', max: 60, placeholder: 'e.g. 2nd Semester, A.Y 2025 - 2026' },
  ],
  settle: { action: 'Mark completed', done: 'Completed', noteLabel: 'Final grade' },
  describe: (v) => ({ main: str(v, 'subject'), details: [str(v, 'grade'), str(v, 'instructor'), str(v, 'term')].filter(Boolean) }),
  itemText(open, office) {
    if (open.length === 1) {
      const [v] = open;
      const who = str(v, 'instructor');
      return {
        task: `Complete your ${str(v, 'grade')} in ${str(v, 'subject')}`,
        remarks: `${str(v, 'grade')} in ${str(v, 'subject')}`,
        description: `You have ${str(v, 'grade')} in ${str(v, 'subject')}${who ? ` with ${who}` : ''}. ${office} clears you once the final grade is in.`,
        nextStep: `See ${who || 'your instructor'} to complete ${str(v, 'subject')}.`,
      };
    }
    return {
      task: `Complete ${open.length} incomplete grades`,
      remarks: open.map((v) => `${str(v, 'grade')} in ${str(v, 'subject')}`).join('; '),
      description: `You have ${open.length} subjects without a final grade. ${office} clears you once every final grade is in.`,
      nextStep: 'See the instructor of each subject listed to complete it.',
    };
  },
};

const library: RecordTemplate = {
  title: 'Borrowed books',
  noun: ['borrowed book', 'borrowed books'],
  intro: 'Books a student still has out, with any fine. Mark one returned when the book is back and the fine is paid.',
  fields: [
    { key: 'book', label: 'Book title', type: 'text', required: true, max: 120, placeholder: 'Title of the book' },
    { key: 'accession', label: 'Accession no.', type: 'text', max: 30, placeholder: 'From the book label' },
    { key: 'due', label: 'Due date', type: 'date' },
    { key: 'fine', label: 'Fine (PHP)', type: 'money' },
  ],
  settle: { action: 'Mark returned', done: 'Returned', noteLabel: 'Note' },
  describe: (v) => ({
    main: str(v, 'book'),
    details: [
      str(v, 'accession') && `Accession no. ${str(v, 'accession')}`,
      str(v, 'due') && `Due ${day(str(v, 'due'))}`,
      num(v, 'fine') > 0 ? `Fine ${peso(num(v, 'fine'))}` : '',
    ].filter(Boolean),
  }),
  itemText(open, office) {
    const fines = open.reduce((t, v) => t + num(v, 'fine'), 0);
    const one = open.length === 1;
    const fineText = fines > 0 ? ` and pay ${peso(fines)} in fines` : '';
    return {
      task: (one ? `Return ${str(open[0], 'book')}` : `Return ${open.length} borrowed books`) + fineText,
      remarks: open.map((v) => str(v, 'book')).join(', '),
      description:
        `${office} has ${one ? 'a book' : `${open.length} books`} still out on your account` +
        (fines > 0 ? `, with ${peso(fines)} in fines.` : '.'),
      nextStep: `Return ${one ? 'the book' : 'the books'} to the ${office}${fines > 0 ? ' and pay the fine at the circulation desk' : ''}.`,
    };
  },
};

const accounting: RecordTemplate = {
  title: 'Balances',
  noun: ['balance', 'balances'],
  intro: 'What a student still owes. Mark one paid when it is settled, with the official receipt number.',
  fields: [
    { key: 'fee', label: 'For', type: 'text', required: true, max: 80, placeholder: 'e.g. Tuition balance' },
    { key: 'amount', label: 'Amount (PHP)', type: 'money', required: true },
  ],
  settle: { action: 'Mark paid', done: 'Paid', noteLabel: 'Official receipt no.' },
  describe: (v) => ({ main: str(v, 'fee'), details: [peso(num(v, 'amount'))] }),
  itemText(open) {
    const total = open.reduce((t, v) => t + num(v, 'amount'), 0);
    const fees = open.map((v) => str(v, 'fee'));
    return {
      task: `Settle balance ${peso(total)}`,
      remarks: fees.join(', '),
      description: `You have an outstanding balance of ${peso(total)} for ${list(fees.map(lowerFirst))}.`,
      nextStep: `Pay ${peso(total)} at the cashier, or upload your official receipt if you have already paid.`,
    };
  },
};

const registrar: RecordTemplate = {
  title: 'Missing documents',
  noun: ['missing document', 'missing documents'],
  intro: 'Documents a student has not handed in yet. Mark one received when it arrives.',
  fields: [
    {
      key: 'document',
      label: 'Document',
      type: 'choice',
      required: true,
      choices: ['Form 137', 'Form 138', 'PSA birth certificate', 'Good moral certificate', 'Transfer credentials', '2x2 ID photo', 'Other document'],
    },
    { key: 'note', label: 'Note', type: 'text', max: 120, placeholder: 'e.g. Original copy needed' },
  ],
  settle: { action: 'Mark received', done: 'Received', noteLabel: 'Note' },
  describe: (v) => ({ main: str(v, 'document'), details: [str(v, 'note')].filter(Boolean) }),
  itemText(open, office) {
    const docs = open.map((v) => str(v, 'document'));
    const one = open.length === 1;
    const note = one ? str(open[0], 'note') : '';
    return {
      task: one ? `Submit ${docs[0]}` : `Submit ${open.length} documents`,
      remarks: docs.join(', '),
      description: `The ${office} is still missing your ${list(docs)}${note ? ` (${note})` : ''}.`,
      nextStep: `Bring ${one ? 'it' : 'them'} to the ${office}, or upload a scan if the office accepts one.`,
    };
  },
};

const guidance: RecordTemplate = {
  title: 'Guidance requirements',
  noun: ['guidance requirement', 'guidance requirements'],
  intro: 'Exit interviews, counseling sessions and forms a student still has to complete. Mark one done after it happens.',
  fields: [
    {
      key: 'requirement',
      label: 'Requirement',
      type: 'choice',
      required: true,
      choices: ['Exit interview', 'Counseling session', 'Guidance information form'],
    },
    { key: 'schedule', label: 'Scheduled on', type: 'date' },
    { key: 'counselor', label: 'Counselor', type: 'text', max: 80, placeholder: "Counselor's name" },
  ],
  settle: { action: 'Mark done', done: 'Done', noteLabel: 'Note' },
  describe: (v) => ({
    main: str(v, 'requirement'),
    details: [str(v, 'schedule') && `Scheduled ${day(str(v, 'schedule'))}`, str(v, 'counselor')].filter(Boolean),
  }),
  itemText(open, office) {
    if (open.length === 1) {
      const [v] = open;
      const req = lowerFirst(str(v, 'requirement'));
      const when = str(v, 'schedule') ? day(str(v, 'schedule')) : '';
      const who = str(v, 'counselor');
      return {
        task: `Complete the ${req}`,
        remarks: str(v, 'requirement'),
        description: `The ${office} needs you to complete the ${req}${when ? `, scheduled ${when}` : ''}.`,
        nextStep: `Go to the ${office}${when ? ` on ${when}` : ''}${who ? ` and see ${who}` : ''}.`,
      };
    }
    return {
      task: `Complete ${open.length} guidance requirements`,
      remarks: open.map((v) => str(v, 'requirement')).join(', '),
      description: `The ${office} needs you to complete the ${list(open.map((v) => lowerFirst(str(v, 'requirement'))))}.`,
      nextStep: `Go to the ${office} to schedule them.`,
    };
  },
};

const property: RecordTemplate = {
  title: 'Borrowed equipment',
  noun: ['borrowed item', 'borrowed items'],
  intro: 'Equipment and property a student still has. Mark one returned when it is back and checked.',
  fields: [
    { key: 'item', label: 'Item', type: 'text', required: true, max: 80, placeholder: 'What was borrowed' },
    { key: 'propertyNo', label: 'Property no.', type: 'text', max: 30, placeholder: 'From the property tag' },
    { key: 'borrowed', label: 'Borrowed on', type: 'date' },
  ],
  settle: { action: 'Mark returned', done: 'Returned', noteLabel: 'Condition' },
  describe: (v) => ({
    main: str(v, 'item'),
    details: [str(v, 'propertyNo') && `Property no. ${str(v, 'propertyNo')}`, str(v, 'borrowed') && `Borrowed ${day(str(v, 'borrowed'))}`].filter(
      Boolean,
    ),
  }),
  itemText(open, office) {
    const one = open.length === 1;
    const v = open[0];
    const tag = one && str(v, 'propertyNo') ? ` (${str(v, 'propertyNo')})` : '';
    return {
      task: one ? `Return the borrowed ${lowerFirst(str(v, 'item'))}` : `Return ${open.length} borrowed items`,
      remarks: open.map((r) => str(r, 'item')).join(', '),
      description: `The ${office} has ${one ? `the ${lowerFirst(str(v, 'item'))}${tag}` : `${open.length} items`} on loan to you.`,
      nextStep: `Return ${one ? 'it' : 'them'} to the ${office} in good condition.`,
    };
  },
};

/** Any office without its own template (an office added later in Settings). */
const general: RecordTemplate = {
  title: 'Records',
  noun: ['record', 'records'],
  intro: 'What a student still has to settle with this office. Mark one settled when it is done.',
  fields: [
    { key: 'what', label: 'What', type: 'text', required: true, max: 120, placeholder: 'What the student owes' },
    { key: 'amount', label: 'Amount (PHP)', type: 'money' },
    { key: 'note', label: 'Note', type: 'text', max: 120 },
  ],
  settle: { action: 'Mark settled', done: 'Settled', noteLabel: 'Note' },
  describe: (v) => ({
    main: str(v, 'what'),
    details: [num(v, 'amount') > 0 ? peso(num(v, 'amount')) : '', str(v, 'note')].filter(Boolean),
  }),
  itemText(open, office) {
    const one = open.length === 1;
    return {
      task: one ? `Settle: ${str(open[0], 'what')}` : `Settle ${open.length} records`,
      remarks: open.map((v) => str(v, 'what')).join(', '),
      description: `${office} has ${one ? 'one thing' : `${open.length} things`} on record for you to settle.`,
      nextStep: `See the ${office} to settle ${one ? 'it' : 'them'}.`,
    };
  },
};

const TEMPLATES: Record<string, RecordTemplate> = { dean, library, accounting, registrar, guidance, property };

export function templateFor(officeCode: string): RecordTemplate {
  return TEMPLATES[officeCode] ?? general;
}

/** The text once nothing is open any more: the office's move, to clear the student. */
export function settledItemText(officeName: string): ItemText {
  return {
    task: 'Awaiting office review',
    remarks: 'Everything on record is settled',
    description: `${officeName} has everything on your record settled and will clear you soon.`,
    nextStep: `Wait for ${officeName} to clear you.`,
  };
}

/** Total pesos across a template's money fields. */
export function moneyOf(template: RecordTemplate, values: RecordValues): number {
  return template.fields.filter((f) => f.type === 'money').reduce((t, f) => t + num(values, f.key), 0);
}

export const hasMoney = (template: RecordTemplate) => template.fields.some((f) => f.type === 'money');

/* ---------- Checking input ---------- */

export type Checked = { ok: true; values: RecordValues } | { ok: false; errors: Record<string, string> };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/; // MM/DD/YYYY, as Excel writes it here

function readDate(raw: string): string | null {
  let y: number, m: number, d: number;
  const iso = DATE.exec(raw);
  const slash = SLASH_DATE.exec(raw);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (slash) [y, m, d] = [Number(slash[3]), Number(slash[1]), Number(slash[2])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function readMoney(raw: string): number | null {
  const cleaned = raw.replace(/^(php|₱)\s*/i, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= 10_000_000 ? n : null;
}

/** Checks what staff typed or imported against the template. Text is trimmed; blank optional fields are left out. */
export function checkRecord(template: RecordTemplate, raw: Record<string, unknown>): Checked {
  const values: RecordValues = {};
  const errors: Record<string, string> = {};
  for (const f of template.fields) {
    const input = raw[f.key];
    const text = (typeof input === 'number' ? String(input) : typeof input === 'string' ? input : '').replace(/\s+/g, ' ').trim();
    if (!text) {
      if (f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.type === 'money') {
      const n = readMoney(text);
      if (n === null) errors[f.key] = `${f.label} must be an amount like 5250 or 40.50.`;
      else if (f.required && n === 0) errors[f.key] = `${f.label} must be more than zero.`;
      else values[f.key] = n;
    } else if (f.type === 'date') {
      const d = readDate(text);
      if (d === null) errors[f.key] = `${f.label} must be a date like 2026-11-20.`;
      else values[f.key] = d;
    } else if (f.type === 'choice') {
      const hit = f.choices?.find((c) => c.toLowerCase() === text.toLowerCase());
      if (!hit) errors[f.key] = `${f.label} must be one of: ${(f.choices ?? []).join(', ')}.`;
      else values[f.key] = hit;
    } else if (f.max && text.length > f.max) {
      errors[f.key] = `${f.label} can be at most ${f.max} characters.`;
    } else values[f.key] = text;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** Values read back from the database (Json), keeping only the template's fields and their types. */
export function storedValues(template: RecordTemplate, json: unknown): RecordValues {
  const out: RecordValues = {};
  if (!json || typeof json !== 'object') return out;
  const src = json as Record<string, unknown>;
  for (const f of template.fields) {
    const v = src[f.key];
    if (f.type === 'money' ? typeof v === 'number' : typeof v === 'string') out[f.key] = v as string | number;
  }
  return out;
}

/* ---------- Importing a list ---------- */

/** Rows from pasted spreadsheet cells (tabs) or a CSV file (commas, with "quoted" cells). Blank lines are dropped. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = lines.split('\n').find((l) => l.trim()) ?? '';
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < lines.length; i += 1) {
    const ch = lines[i];
    if (quoted) {
      if (ch === '"' && lines[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ''));
}

export const STUDENT_NUMBER = /^\d{4}-\d{5}$/;

/** The import columns in order: the student number, then the template's fields. */
export const importColumns = (template: RecordTemplate) => ['Student no.', ...template.fields.map((f) => f.label)];

export type ImportRow =
  | { line: number; ok: true; studentNumber: string; values: RecordValues }
  | { line: number; ok: false; studentNumber: string; error: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads an imported list. Columns go by the header row when there is one (matched on the field labels or keys, in any
 * order), otherwise in the order importColumns() gives. `line` is the row number in the pasted text, counting the header.
 */
export function readImport(template: RecordTemplate, text: string): ImportRow[] {
  const table = parseTable(text);
  if (!table.length) return [];
  const hasHeader = !STUDENT_NUMBER.test(table[0][0] ?? '');
  let numberCol = 0;
  let fieldCols = template.fields.map((_, i) => i + 1);
  if (hasHeader) {
    const head = table[0].map(norm);
    const find = (...names: string[]) => head.findIndex((h) => names.some((n) => norm(n) === h));
    const nc = find('Student no.', 'Student number', 'studentnumber', 'student', 'id', 'student id');
    if (nc >= 0) numberCol = nc;
    fieldCols = template.fields.map((f, i) => {
      const c = find(f.label, f.key, f.label.replace(/\s*\(.*\)$/, ''));
      return c >= 0 ? c : i + 1;
    });
  }
  return table.slice(hasHeader ? 1 : 0).map((cells, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const studentNumber = (cells[numberCol] ?? '').trim();
    if (!STUDENT_NUMBER.test(studentNumber)) {
      return { line, ok: false, studentNumber, error: 'Student no. must look like 2023-00123.' };
    }
    const raw = Object.fromEntries(template.fields.map((f, k) => [f.key, cells[fieldCols[k]] ?? '']));
    const checked = checkRecord(template, raw);
    return checked.ok
      ? { line, ok: true, studentNumber, values: checked.values }
      : { line, ok: false, studentNumber, error: Object.values(checked.errors).join(' ') };
  });
}
