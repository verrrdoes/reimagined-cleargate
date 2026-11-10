import { describe, expect, it } from 'vitest';
import {
  checkRecord,
  importColumns,
  moneyOf,
  parseTable,
  peso,
  readImport,
  settledItemText,
  storedValues,
  templateFor,
} from '@/lib/officeRecords';

const dean = templateFor('dean');
const library = templateFor('library');
const accounting = templateFor('accounting');
const registrar = templateFor('registrar');
const guidance = templateFor('guidance');
const property = templateFor('property');

describe('templateFor', () => {
  it('gives each of the six offices its own list, and any other office a plain one', () => {
    expect([dean, library, accounting, registrar, guidance, property].map((t) => t.title)).toEqual([
      'Incomplete grades',
      'Borrowed books',
      'Balances',
      'Missing documents',
      'Guidance requirements',
      'Borrowed equipment',
    ]);
    expect(templateFor('clinic').title).toBe('Records');
  });
});

describe('peso', () => {
  it('writes whole pesos without decimals, and centavos with two', () => {
    expect(peso(5250)).toBe('PHP 5,250');
    expect(peso(40.5)).toBe('PHP 40.50');
  });
});

describe('checkRecord', () => {
  it('trims text, matches choices whatever the case, and reads amounts and dates', () => {
    expect(checkRecord(dean, { subject: '  IT 312   Systems Analysis ', grade: 'inc', instructor: '' })).toEqual({
      ok: true,
      values: { subject: 'IT 312 Systems Analysis', grade: 'INC' },
    });
    expect(checkRecord(library, { book: 'Principles of Accounting', due: '11/20/2026', fine: 'PHP 1,250.5' })).toEqual({
      ok: true,
      values: { book: 'Principles of Accounting', due: '2026-11-20', fine: 1250.5 },
    });
  });

  it('names every problem', () => {
    const r = checkRecord(dean, { subject: '', grade: 'A+' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.subject).toBe('Subject is required.');
      expect(r.errors.grade).toBe('Grade must be one of: INC, NFE, NG.');
    }
    const money = checkRecord(accounting, { fee: 'Lab fee', amount: '0' });
    expect(money.ok).toBe(false);
    const date = checkRecord(library, { book: 'X', due: '2026-02-30' });
    expect(date.ok).toBe(false);
  });
});

describe('itemText', () => {
  it('names the one subject, and counts several', () => {
    const one = dean.itemText([{ subject: 'IT 312', grade: 'INC', instructor: 'Prof. R. Santos' }], "Dean's Office");
    expect(one.task).toBe('Complete your INC in IT 312');
    expect(one.nextStep).toBe('See Prof. R. Santos to complete IT 312.');
    const two = dean.itemText(
      [
        { subject: 'IT 312', grade: 'INC' },
        { subject: 'IT 315', grade: 'NFE' },
      ],
      "Dean's Office",
    );
    expect(two.task).toBe('Complete 2 incomplete grades');
    expect(two.remarks).toBe('INC in IT 312; NFE in IT 315');
  });

  it('adds up balances the way the office writes them', () => {
    const t = accounting.itemText(
      [
        { fee: 'Tuition balance', amount: 5000 },
        { fee: 'Lab fee', amount: 250 },
      ],
      'Accounting',
    );
    expect(t.task).toBe('Settle balance PHP 5,250');
    expect(t.description).toBe('You have an outstanding balance of PHP 5,250 for tuition balance and lab fee.');
  });

  it('mentions library fines only when there are some', () => {
    expect(library.itemText([{ book: 'Introduction to Computing' }], 'Library').task).toBe('Return Introduction to Computing');
    expect(
      library.itemText(
        [
          { book: 'A', fine: 20 },
          { book: 'B', fine: 20 },
        ],
        'Library',
      ).task,
    ).toBe('Return 2 borrowed books and pay PHP 40 in fines');
  });

  it('writes the other offices in their own words', () => {
    expect(registrar.itemText([{ document: 'Form 137' }], 'Registrar').task).toBe('Submit Form 137');
    expect(guidance.itemText([{ requirement: 'Exit interview', schedule: '2026-11-20' }], 'Guidance Office').nextStep).toBe(
      'Go to the Guidance Office on Nov 20, 2026.',
    );
    expect(property.itemText([{ item: 'Digital multimeter', propertyNo: 'EQ-0417' }], 'Property Custodian').description).toBe(
      'The Property Custodian has the digital multimeter (EQ-0417) on loan to you.',
    );
  });

  it('keeps every text within its column', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ book: `A very long book title number ${i} about many things` }));
    const t = library.itemText(many, 'Library');
    expect(t.task.length).toBeLessThanOrEqual(160);
    // The service cuts remarks to 120 and description and next step to 255; check that it has to.
    expect(t.remarks.length).toBeGreaterThan(120);
  });

  it('hands the move back to the office once everything is settled', () => {
    expect(settledItemText('Library')).toEqual({
      task: 'Awaiting office review',
      remarks: 'Everything on record is settled',
      description: 'Library has everything on your record settled and will clear you soon.',
      nextStep: 'Wait for Library to clear you.',
    });
  });
});

describe('moneyOf / storedValues', () => {
  it('adds the money fields', () => {
    expect(moneyOf(accounting, { fee: 'Tuition', amount: 5250 })).toBe(5250);
    expect(moneyOf(dean, { subject: 'IT 312', grade: 'INC' })).toBe(0);
  });

  it('keeps only fields the template knows, with the right types', () => {
    expect(storedValues(accounting, { fee: 'Tuition', amount: 5250, extra: 'x' })).toEqual({ fee: 'Tuition', amount: 5250 });
    expect(storedValues(accounting, { fee: 3, amount: '5250' })).toEqual({});
    expect(storedValues(accounting, null)).toEqual({});
  });
});

describe('parseTable', () => {
  it('reads cells pasted from a spreadsheet (tabs)', () => {
    expect(parseTable('2023-00101\tIT 312\tINC\n\n2023-00102\tIT 315\tNFE\n')).toEqual([
      ['2023-00101', 'IT 312', 'INC'],
      ['2023-00102', 'IT 315', 'NFE'],
    ]);
  });

  it('reads a CSV file with quoted cells, commas and quotes inside them', () => {
    expect(parseTable('﻿Student no.,Book title\r\n2023-00101,"Noli Me Tangere, annotated"\r\n2023-00102,"The ""Red"" Book"')).toEqual([
      ['Student no.', 'Book title'],
      ['2023-00101', 'Noli Me Tangere, annotated'],
      ['2023-00102', 'The "Red" Book'],
    ]);
  });
});

describe('readImport', () => {
  it('reads columns in the template order when there is no header', () => {
    const rows = readImport(dean, '2023-00101\tIT 312\tINC\tProf. R. Santos');
    expect(rows).toEqual([
      { line: 1, ok: true, studentNumber: '2023-00101', values: { subject: 'IT 312', grade: 'INC', instructor: 'Prof. R. Santos' } },
    ]);
  });

  it('matches a header row in any order, and reports bad rows by line', () => {
    const text = 'Amount,Student number,For\n5250,2023-00101,Tuition balance\n100,2023-1,Lab fee\n,2023-00103,Lab fee';
    const rows = readImport(accounting, text);
    expect(rows[0]).toEqual({ line: 2, ok: true, studentNumber: '2023-00101', values: { fee: 'Tuition balance', amount: 5250 } });
    expect(rows[1]).toMatchObject({ line: 3, ok: false, error: 'Student no. must look like 2023-00123.' });
    expect(rows[2]).toMatchObject({ line: 4, ok: false, error: 'Amount (PHP) is required.' });
  });

  it('lists the columns to use', () => {
    expect(importColumns(property)).toEqual(['Student no.', 'Item', 'Property no.', 'Borrowed on']);
  });
});
