// The application form's rules (HANDOFF §8.3; legacy routeApply formStr/formPhone). Client-safe:
// the sign-up form runs them before submitting, and the apply action runs them again on the server,
// so both sides give the same message for the same mistake, in the legacy order.
import { ADMISSION_TYPES, CIVIL_STATUSES, PATTERNS, SCHOOL_DOMAIN } from '@/lib/constants';
import { clean, int, isEmail } from '@/lib/input';
import { parseYmd } from '@/lib/time';

/** Every text field of the form, as sent by the browser. */
export type ApplicationValues = {
  admissionType: string;
  program: string;
  yearLevel: string;
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  sex: string;
  civilStatus: string;
  birthday: string;
  placeOfBirth: string;
  personalEmail: string;
  contactNumber: string;
  religion: string;
  permanentAddress: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  street: string;
  postalCode: string;
  fatherFirst: string;
  fatherMiddle: string;
  fatherLast: string;
  fatherOccupation: string;
  motherFirst: string;
  motherMiddle: string;
  motherLast: string;
  motherOccupation: string;
  guardianFirst: string;
  guardianMiddle: string;
  guardianLast: string;
  guardianRelationship: string;
  guardianContact: string;
};

export type ApplicationField = keyof ApplicationValues;

export const EMPTY_APPLICATION: ApplicationValues = {
  admissionType: '',
  program: '',
  yearLevel: '',
  lastName: '',
  firstName: '',
  middleName: '',
  suffix: '',
  sex: '',
  civilStatus: '',
  birthday: '',
  placeOfBirth: '',
  personalEmail: '',
  contactNumber: '',
  religion: '',
  permanentAddress: '',
  region: '',
  province: '',
  city: '',
  barangay: '',
  street: '',
  postalCode: '',
  fatherFirst: '',
  fatherMiddle: '',
  fatherLast: '',
  fatherOccupation: '',
  motherFirst: '',
  motherMiddle: '',
  motherLast: '',
  motherOccupation: '',
  guardianFirst: '',
  guardianMiddle: '',
  guardianLast: '',
  guardianRelationship: '',
  guardianContact: '',
};

/** Column lengths from the schema (and the form's maxlength). */
export const MAX: Record<ApplicationField, number> = {
  admissionType: 40,
  program: 10,
  yearLevel: 1,
  lastName: 60,
  firstName: 60,
  middleName: 60,
  suffix: 10,
  sex: 10,
  civilStatus: 20,
  birthday: 10,
  placeOfBirth: 120,
  personalEmail: 190,
  contactNumber: 20,
  religion: 60,
  permanentAddress: 255,
  region: 80,
  province: 80,
  city: 80,
  barangay: 80,
  street: 160,
  postalCode: 10,
  fatherFirst: 60,
  fatherMiddle: 60,
  fatherLast: 60,
  fatherOccupation: 80,
  motherFirst: 60,
  motherMiddle: 60,
  motherLast: 60,
  motherOccupation: 80,
  guardianFirst: 60,
  guardianMiddle: 60,
  guardianLast: 60,
  guardianRelationship: 40,
  guardianContact: 20,
};

/** The applicant's own name is stored in capitals, whatever case was typed (the form recommends typing it that way). */
const UPPERCASE_FIELDS: ReadonlySet<ApplicationField> = new Set<ApplicationField>(['lastName', 'firstName', 'middleName', 'suffix']);

/** The validated application, ready to store. */
export type CleanApplication = {
  admissionType: string;
  programCode: string;
  yearLevel: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  sex: 'Male' | 'Female';
  civilStatus: string;
  /** "YYYY-MM-DD" */
  birthday: string;
  placeOfBirth: string | null;
  personalEmail: string;
  contactNumber: string;
  religion: string | null;
  permanentAddress: string | null;
  region: string;
  province: string;
  city: string;
  barangay: string;
  street: string;
  postalCode: string | null;
  fatherFirst: string;
  fatherMiddle: string | null;
  fatherLast: string;
  fatherOccupation: string;
  motherFirst: string;
  motherMiddle: string | null;
  motherLast: string;
  motherOccupation: string;
  guardianFirst: string;
  guardianMiddle: string | null;
  guardianLast: string;
  guardianRelationship: string;
  guardianContact: string;
};

export type ApplicationProblem = {
  field: ApplicationField;
  code: 'missing_field' | 'invalid_field';
  message: string;
};

export type ApplicationCheck = { ok: true; value: CleanApplication } | { ok: false; problem: ApplicationProblem };

class Problem extends Error {
  constructor(readonly problem: ApplicationProblem) {
    super(problem.message);
  }
}

function stop(field: ApplicationField, code: ApplicationProblem['code'], message: string): never {
  throw new Problem({ field, code, message });
}

/** "YYYY-MM-DD" moved by whole years; Feb 29 rolls over to Mar 1 like PHP's DateTime. */
function shiftYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

/** The birthdays the form accepts on `today` ("YYYY-MM-DD"), for the date input's min and max. */
export function birthdayBounds(today: string): { min: string; max: string } {
  const oldest = shiftYears(today, -100);
  const [y, m, d] = oldest.split('-').map(Number);
  return { min: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), max: shiftYears(today, -10) };
}

/**
 * Checks the form like the legacy apply route: trims and collapses whitespace, enforces the column
 * lengths, then each field's rule, stopping at the first problem. `programCodes` are the codes in the
 * programs table; `today` is the Manila calendar day ("YYYY-MM-DD").
 */
export function checkApplication(
  raw: Partial<Record<ApplicationField, unknown>> | null | undefined,
  ctx: { programCodes: readonly string[]; today: string },
): ApplicationCheck {
  const input = raw ?? {};

  // Legacy formStr: required fields say "{Label} is required."; anything longer than the column is refused, not cut.
  function text(field: ApplicationField, label: string): string;
  function text(field: ApplicationField, label: string, required: false): string | null;
  function text(field: ApplicationField, label: string, required = true): string | null {
    const max = MAX[field];
    const typed = clean(input[field], max + 1);
    const v = UPPERCASE_FIELDS.has(field) ? typed.toUpperCase() : typed;
    if (v === '') {
      if (required) stop(field, 'missing_field', `${label} is required.`);
      return null;
    }
    if (Array.from(v).length > max) stop(field, 'invalid_field', `${label} is too long (max ${max} characters).`);
    return v;
  }

  function phone(field: ApplicationField, label: string): string {
    const v = text(field, label);
    if (!PATTERNS.applyPhone.test(v)) stop(field, 'invalid_field', `${label} must be a phone number, e.g. 09171234567.`);
    return v;
  }

  try {
    const admissionType = text('admissionType', 'Admission type');
    if (!(ADMISSION_TYPES as readonly string[]).includes(admissionType)) {
      stop('admissionType', 'invalid_field', 'Choose an admission type from the list.');
    }
    const programCode = text('program', 'Program');
    if (!ctx.programCodes.includes(programCode)) stop('program', 'invalid_field', 'Choose a program from the list.');
    const yearLevel = int(input.yearLevel);
    if (yearLevel === null || yearLevel < 1 || yearLevel > 4) {
      stop('yearLevel', 'invalid_field', 'Choose the academic level you are applying for (1st to 4th year).');
    }

    const lastName = text('lastName', 'Last name');
    const firstName = text('firstName', 'First name');
    const middleName = text('middleName', 'Middle name', false);
    const suffix = text('suffix', 'Suffix', false);
    const sex = text('sex', 'Sex');
    if (sex !== 'Male' && sex !== 'Female') stop('sex', 'invalid_field', 'Choose Male or Female.');
    const civilStatus = text('civilStatus', 'Civil status');
    if (!(CIVIL_STATUSES as readonly string[]).includes(civilStatus)) {
      stop('civilStatus', 'invalid_field', 'Choose a civil status from the list.');
    }
    const birthdayText = text('birthday', 'Birthday');
    const birthday = parseYmd(birthdayText);
    // Between 100 and 10 years ago (legacy: not after "-10 years", not before "-100 years").
    if (!birthday || birthday > shiftYears(ctx.today, -10) || birthday <= shiftYears(ctx.today, -100)) {
      stop('birthday', 'invalid_field', 'Enter a valid birthday.');
    }
    const placeOfBirth = text('placeOfBirth', 'Place of birth', false);
    const personalEmail = text('personalEmail', 'Email').toLowerCase();
    if (!isEmail(personalEmail)) stop('personalEmail', 'invalid_field', 'Enter a valid personal email address.');
    if (personalEmail.endsWith(`@${SCHOOL_DOMAIN}`)) {
      stop('personalEmail', 'invalid_field', 'Use your personal email, not a school address.');
    }
    const contactNumber = phone('contactNumber', 'Contact number');
    const religion = text('religion', 'Religion', false);
    const permanentAddress = text('permanentAddress', 'Permanent address', false);

    const region = text('region', 'Region');
    const province = text('province', 'Province');
    const city = text('city', 'City / Municipality');
    const barangay = text('barangay', 'Barangay');
    const street = text('street', 'House no. / Street / Subdivision');
    const postalCode = text('postalCode', 'Postal code', false);
    if (postalCode !== null && !PATTERNS.postalCode.test(postalCode)) {
      stop('postalCode', 'invalid_field', 'Postal code must be 4 digits.');
    }

    const fatherFirst = text('fatherFirst', "Father's first name");
    const fatherMiddle = text('fatherMiddle', "Father's middle name", false);
    const fatherLast = text('fatherLast', "Father's last name");
    const fatherOccupation = text('fatherOccupation', "Father's occupation");
    const motherFirst = text('motherFirst', "Mother's first name");
    const motherMiddle = text('motherMiddle', "Mother's middle name", false);
    const motherLast = text('motherLast', "Mother's last name");
    const motherOccupation = text('motherOccupation', "Mother's occupation");

    const guardianFirst = text('guardianFirst', "Guardian's first name");
    const guardianMiddle = text('guardianMiddle', "Guardian's middle name", false);
    const guardianLast = text('guardianLast', "Guardian's last name");
    const guardianRelationship = text('guardianRelationship', 'Relationship to guardian');
    const guardianContact = phone('guardianContact', 'Guardian contact number');

    return {
      ok: true,
      value: {
        admissionType,
        programCode,
        yearLevel: yearLevel as number,
        lastName,
        firstName,
        middleName,
        suffix,
        sex: sex as 'Male' | 'Female',
        civilStatus,
        birthday: birthday as string,
        placeOfBirth,
        personalEmail,
        contactNumber,
        religion,
        permanentAddress,
        region,
        province,
        city,
        barangay,
        street,
        postalCode,
        fatherFirst,
        fatherMiddle,
        fatherLast,
        fatherOccupation,
        motherFirst,
        motherMiddle,
        motherLast,
        motherOccupation,
        guardianFirst,
        guardianMiddle,
        guardianLast,
        guardianRelationship,
        guardianContact,
      },
    };
  } catch (e) {
    if (e instanceof Problem) return { ok: false, problem: e.problem };
    throw e;
  }
}
