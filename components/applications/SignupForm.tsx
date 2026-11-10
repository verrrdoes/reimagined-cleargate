'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { apply } from '@/lib/actions/applications';
import { ADMISSION_TYPES, CIVIL_STATUSES, LIMITS, MB } from '@/lib/constants';
import { declaredType, uploadFile } from '@/lib/upload-client';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import {
  button,
  check as checkClass,
  field as fieldClass,
  fieldError,
  fieldHint,
  fieldLabel,
  fieldOptional,
  formGrid,
  formGridFull,
  input,
  progress as progressTrack,
  progressBar,
  select,
  spinner,
  textarea,
} from '@/components/ui/recipes';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { AddressFields } from './AddressFields';
import { birthdayBounds, checkApplication, EMPTY_APPLICATION, MAX, type ApplicationField, type ApplicationValues } from './rules';
import { ordinal, SAVED_APPLICATION_KEY, type ProgramOption, type SavedApplication } from './types';

// The public sign-up form (HANDOFF §8.3, legacy signup.html). The fields are checked here with the same rules
// and messages as the server, the optional 2x2 photo is uploaded straight to storage on submit, and on success
// the reference and status token are kept in this browser for the application status page.

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV'];
const OFFLINE = 'Could not reach ClearGate. Check your connection and try again.';
const CERTIFY = 'Tick the box to confirm that the information above is true and correct.';

type Problem = { field: ApplicationField; message: string };
type ServerError = { code: string; message: string };

const fieldId = (field: ApplicationField) => `apply-${field}`;
const NAME_HINT = 'apply-name-hint';

const CARD = 'flex flex-col gap-6 w-full max-w-[720px] mx-auto';
const CARD_HEAD = 'flex flex-col gap-1.5';
const CARD_LINKS = 'flex flex-col gap-1.5 pt-4 border-t border-rule text-muted';
const INPUT = cn(input, 'h-10');
const SELECT = cn(select, 'h-10');
const SECTION = 'flex flex-col gap-4 pt-6 border-t border-rule first:pt-0 first:border-t-0';
const HEADING = 'text-16 font-semibold';
const GROUP = 'flex flex-col gap-4 [fieldset+&]:pt-2';
const LEGEND = 'mb-3 text-14 font-semibold';
const TRIO = 'grid grid-cols-3 gap-4 max-sm:grid-cols-1';
const PHOTO_FRAME =
  'grid place-items-center shrink-0 size-28 overflow-hidden border border-dashed border-control rounded-card bg-raised ' +
  'text-muted max-sm:size-22';

/** Label, control, error and hint for one field. The control carries the matching id and aria attributes. */
function Field({
  field,
  label,
  optional,
  hint,
  error,
  wide,
  children,
}: {
  field: ApplicationField;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error: string | null;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn(fieldClass, wide && formGridFull)}>
      <label className={fieldLabel} htmlFor={fieldId(field)}>
        {label}
        {optional ? <span className={fieldOptional}> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${fieldId(field)}-error`} className={fieldError}>
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${fieldId(field)}-hint`} className={fieldHint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ServerMessage({ error }: { error: ServerError }) {
  if (error.code === 'already_registered') {
    return (
      <>
        <p>{error.message}</p>
        <p>
          <Link href="/">Sign in</Link> or <Link href="/forgot-password">reset your password</Link>.
        </p>
      </>
    );
  }
  if (error.code === 'already_pending') {
    return (
      <>
        <p>{error.message}</p>
        <p>
          <Link href="/application-status">Check application status</Link>
        </p>
      </>
    );
  }
  return <p>{error.message}</p>;
}

/** Moves focus to a field; a field that can't take focus yet (a disabled address list) is scrolled into view. */
function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.focus();
  if (document.activeElement !== el) el.scrollIntoView({ block: 'center' });
}

export function SignupForm({ programs, today }: { programs: ProgramOption[]; today: string }) {
  const router = useRouter();
  const [values, setValues] = useState<ApplicationValues>(EMPTY_APPLICATION);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [certified, setCertified] = useState(false);
  const [certifyError, setCertifyError] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const previewUrl = useRef<string | null>(null);

  const bounds = birthdayBounds(today);
  const programCodes = programs.map((p) => p.code);

  // The field the last check stopped at takes focus once its message is on screen.
  useEffect(() => {
    if (problem) focusField(fieldId(problem.field));
  }, [problem]);

  useEffect(() => {
    if (serverError) alertRef.current?.focus();
  }, [serverError]);

  useEffect(() => {
    const url = previewUrl;
    return () => {
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  function setMany(next: Partial<ApplicationValues>) {
    setValues((v) => ({ ...v, ...next }));
    setProblem((p) => (p && p.field in next ? null : p));
  }

  const errorOf = (field: ApplicationField) => (problem?.field === field ? problem.message : null);

  /** Props shared by every control: id, value, change handler and the aria wiring to its error and hint. */
  function bind(field: ApplicationField, hasHint = false) {
    const invalid = problem?.field === field;
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMany({ [field]: e.target.value }),
      disabled: busy,
      'aria-invalid': invalid || undefined,
      'aria-describedby':
        [invalid ? `${fieldId(field)}-error` : null, hasHint ? `${fieldId(field)}-hint` : null].filter(Boolean).join(' ') || undefined,
    };
  }

  /** bind() for the applicant's own name: also points at the UPPERCASE advice, and phone keyboards start in capitals. */
  function bindName(field: ApplicationField) {
    const props = bind(field);
    return { ...props, autoCapitalize: 'characters', 'aria-describedby': [props['aria-describedby'], NAME_HINT].filter(Boolean).join(' ') };
  }

  function showPreview(file: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrl.current);
  }

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // choosing the same file again still fires a change
    if (!file) return;
    if (!PHOTO_TYPES.includes(declaredType(file))) {
      setPhotoError('The photo must be a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > LIMITS.photoMB * MB) {
      setPhotoError(`Your photo is larger than ${LIMITS.photoMB} MB. Choose a smaller image.`);
      return;
    }
    setPhotoError(null);
    setPhoto(file);
    showPreview(file);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoError(null);
    showPreview(null);
  }

  function copyParent(who: 'father' | 'mother') {
    setMany(
      who === 'father'
        ? { guardianFirst: values.fatherFirst, guardianMiddle: values.fatherMiddle, guardianLast: values.fatherLast, guardianRelationship: 'Father' }
        : { guardianFirst: values.motherFirst, guardianMiddle: values.motherMiddle, guardianLast: values.motherLast, guardianRelationship: 'Mother' },
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setServerError(null);

    const check = checkApplication(values, { programCodes, today });
    if (!check.ok) {
      setProblem({ field: check.problem.field, message: check.problem.message });
      return;
    }
    setProblem(null);
    if (!certified) {
      setCertifyError(true);
      document.getElementById('apply-certify')?.focus();
      return;
    }

    setBusy(true);
    // The photo goes up on every attempt: when the server refuses an application it deletes the upload.
    let photoTicket: string | undefined;
    if (photo) {
      setProgress(0);
      const up = await uploadFile(photo, { kind: 'photo' }, setProgress);
      if ('error' in up) {
        setProgress(null);
        setBusy(false);
        setServerError({ code: 'upload_failed', message: up.error });
        return;
      }
      photoTicket = up.ticket;
    }

    let res: Awaited<ReturnType<typeof apply>>;
    try {
      res = await apply({ ...values, photoTicket });
    } catch {
      res = { ok: false, error: { code: 'offline', message: OFFLINE } };
    }
    setProgress(null);
    if (!res.ok) {
      setBusy(false);
      setServerError(res.error);
      return;
    }

    const saved: SavedApplication = { reference: res.data.reference, token: res.data.token };
    try {
      localStorage.setItem(SAVED_APPLICATION_KEY, JSON.stringify(saved));
    } catch {
      // Storage is blocked (private window): the status page still works with the reference, email and birthday.
    }
    router.push(`/application-status?ref=${encodeURIComponent(saved.reference)}#new`);
  }

  return (
    <div className={CARD}>
      <div className={CARD_HEAD}>
        <h1>Apply for a student account</h1>
        <p className="text-muted">
          Fill in your details. The Registrar reviews your application, then creates your student ID, your school email
          (surnamefirstname@cgateway.edu.ph) and a temporary password. You&rsquo;ll see them on your application status page.
        </p>
        <p className="text-12 text-muted">Every field is required unless it says optional.</p>
      </div>

      <form className="flex flex-col gap-8" onSubmit={onSubmit} noValidate aria-busy={busy || undefined}>
        <section className={SECTION} aria-labelledby="apply-photo-title">
          <h2 id="apply-photo-title" className={HEADING}>
            Display photo <span className={fieldOptional}>(optional)</span>
          </h2>
          <div className="flex items-center gap-4 max-sm:items-start">
            <div className={cn(PHOTO_FRAME, preview && 'border-solid border-border')}>
              {preview ? (
                // A local object URL of the chosen file, so the image optimiser can't load it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Your chosen photo" width={112} height={112} className="size-full object-cover" />
              ) : (
                <Icon name="camera" size={24} />
              )}
            </div>
            <div className="flex flex-col gap-2 min-w-0">
              <p className="font-medium wrap-anywhere">{photo ? photo.name : 'Upload a 2x2 photo (image only)'}</p>
              <p className={fieldHint} id="apply-photo-hint">
                JPG, PNG or WEBP, up to {LIMITS.photoMB} MB. The Registrar sees it with your application.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={button({ size: 'sm' })}
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  aria-describedby={photoError ? 'apply-photo-error apply-photo-hint' : 'apply-photo-hint'}
                >
                  <Icon name="upload" size={16} />
                  {photo ? 'Change photo' : 'Upload photo'}
                </button>
                {photo ? (
                  <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={removePhoto} disabled={busy}>
                    Remove
                  </button>
                ) : null}
              </div>
              {photoError ? (
                <p id="apply-photo-error" className={fieldError} role="alert">
                  {photoError}
                </p>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPhoto}
              hidden
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </section>

        <section className={SECTION} aria-labelledby="apply-admission-title">
          <h2 id="apply-admission-title" className={HEADING}>
            Admission
          </h2>
          <div className={formGrid}>
            <Field field="admissionType" label="Admission type" error={errorOf('admissionType')}>
              <select className={SELECT} {...bind('admissionType')}>
                <option value="">Select an admission type</option>
                {ADMISSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field field="yearLevel" label="Academic level applied for" error={errorOf('yearLevel')}>
              <select className={SELECT} {...bind('yearLevel')}>
                <option value="">Select a year level</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={String(n)}>
                    {ordinal(n)} year
                  </option>
                ))}
              </select>
            </Field>
            <Field
              field="program"
              label="Program"
              wide
              error={errorOf('program')}
              hint={programs.length === 0 ? 'No programs are set up yet. Ask the Registrar when applications open.' : undefined}
            >
              <select className={SELECT} {...bind('program', programs.length === 0)} disabled={busy || programs.length === 0}>
                <option value="">Select a program</option>
                {programs.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} – {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className={SECTION} aria-labelledby="apply-student-title">
          <div className={CARD_HEAD}>
            <h2 id="apply-student-title" className={HEADING}>
              Student information
            </h2>
            <p id={NAME_HINT} className={fieldHint}>
              Type your name in UPPERCASE letters, for example DELA CRUZ, JUAN. ClearGate saves student names in uppercase.
            </p>
          </div>
          <div className={formGrid}>
            <Field field="lastName" label="Last name" error={errorOf('lastName')}>
              <input className={INPUT} type="text" autoComplete="family-name" maxLength={MAX.lastName} {...bindName('lastName')} />
            </Field>
            <Field field="firstName" label="First name" error={errorOf('firstName')}>
              <input className={INPUT} type="text" autoComplete="given-name" maxLength={MAX.firstName} {...bindName('firstName')} />
            </Field>
            <Field field="middleName" label="Middle name" optional error={errorOf('middleName')}>
              <input className={INPUT} type="text" autoComplete="additional-name" maxLength={MAX.middleName} {...bindName('middleName')} />
            </Field>
            <Field field="suffix" label="Suffix" optional error={errorOf('suffix')}>
              <input className={INPUT} type="text" autoComplete="honorific-suffix" list="apply-suffixes" maxLength={MAX.suffix} {...bindName('suffix')} />
              <datalist id="apply-suffixes">
                {SUFFIXES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field field="sex" label="Sex" error={errorOf('sex')}>
              <select className={SELECT} {...bind('sex')}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </Field>
            <Field field="civilStatus" label="Civil status" error={errorOf('civilStatus')}>
              <select className={SELECT} {...bind('civilStatus')}>
                <option value="">Select</option>
                {CIVIL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field field="birthday" label="Birthday" error={errorOf('birthday')}>
              <input className={INPUT} type="date" autoComplete="bday" min={bounds.min} max={bounds.max} {...bind('birthday')} />
            </Field>
            <Field field="placeOfBirth" label="Place of birth" optional error={errorOf('placeOfBirth')}>
              <input className={INPUT} type="text" maxLength={MAX.placeOfBirth} {...bind('placeOfBirth')} />
            </Field>
            <Field
              field="personalEmail"
              label="Email"
              error={errorOf('personalEmail')}
              hint="Your personal email. Use it for Forgot password and status checks."
            >
              <input
                className={INPUT}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX.personalEmail}
                {...bind('personalEmail', true)}
              />
            </Field>
            <Field field="contactNumber" label="Contact number" error={errorOf('contactNumber')}>
              <input
                className={INPUT}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="09171234567"
                maxLength={MAX.contactNumber}
                {...bind('contactNumber')}
              />
            </Field>
            <Field field="religion" label="Religion" optional error={errorOf('religion')}>
              <input className={INPUT} type="text" maxLength={MAX.religion} {...bind('religion')} />
            </Field>
            <Field field="permanentAddress" label="Permanent address" optional wide error={errorOf('permanentAddress')}>
              <textarea className={textarea} rows={2} maxLength={MAX.permanentAddress} {...bind('permanentAddress')} />
            </Field>
          </div>
        </section>

        <section className={SECTION} aria-labelledby="apply-address-title">
          <h2 id="apply-address-title" className={HEADING}>
            Current address
          </h2>
          <div className={formGrid}>
            <AddressFields
              value={{ region: values.region, province: values.province, city: values.city, barangay: values.barangay }}
              onChange={setMany}
              invalid={problem?.field ?? null}
              error={problem?.message ?? null}
              disabled={busy}
            />
            <Field field="street" label="House no. / Street / Subdivision" error={errorOf('street')}>
              <input className={INPUT} type="text" autoComplete="address-line1" maxLength={MAX.street} {...bind('street')} />
            </Field>
            <Field field="postalCode" label="Postal code" optional error={errorOf('postalCode')}>
              <input className={INPUT} type="text" inputMode="numeric" autoComplete="postal-code" maxLength={4} {...bind('postalCode')} />
            </Field>
          </div>
        </section>

        <section className={SECTION} aria-labelledby="apply-family-title">
          <h2 id="apply-family-title" className={HEADING}>
            Parent&rsquo;s / guardian&rsquo;s information
          </h2>

          {(['father', 'mother'] as const).map((who) => {
            const f = (part: 'First' | 'Middle' | 'Last' | 'Occupation') => `${who}${part}` as ApplicationField;
            return (
              <fieldset key={who} className={GROUP}>
                <legend className={LEGEND}>{who === 'father' ? 'Father' : 'Mother'}</legend>
                <div className={TRIO}>
                  <Field field={f('First')} label="First name" error={errorOf(f('First'))}>
                    <input className={INPUT} type="text" autoComplete="off" maxLength={MAX[f('First')]} {...bind(f('First'))} />
                  </Field>
                  <Field field={f('Middle')} label="Middle name" optional error={errorOf(f('Middle'))}>
                    <input className={INPUT} type="text" autoComplete="off" maxLength={MAX[f('Middle')]} {...bind(f('Middle'))} />
                  </Field>
                  <Field field={f('Last')} label="Last name" error={errorOf(f('Last'))}>
                    <input className={INPUT} type="text" autoComplete="off" maxLength={MAX[f('Last')]} {...bind(f('Last'))} />
                  </Field>
                </div>
                <div className={formGrid}>
                  <Field field={f('Occupation')} label="Occupation" error={errorOf(f('Occupation'))}>
                    <input className={INPUT} type="text" maxLength={MAX[f('Occupation')]} {...bind(f('Occupation'))} />
                  </Field>
                </div>
              </fieldset>
            );
          })}

          <fieldset className={GROUP}>
            <legend className={LEGEND}>Guardian</legend>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted" id="apply-copy-label">
                Same as
              </span>
              <button type="button" className={button({ size: 'sm' })} onClick={() => copyParent('father')} disabled={busy} aria-describedby="apply-copy-label">
                Father
              </button>
              <button type="button" className={button({ size: 'sm' })} onClick={() => copyParent('mother')} disabled={busy} aria-describedby="apply-copy-label">
                Mother
              </button>
            </div>
            <div className={TRIO}>
              <Field field="guardianFirst" label="First name" error={errorOf('guardianFirst')}>
                <input className={INPUT} type="text" autoComplete="off" maxLength={MAX.guardianFirst} {...bind('guardianFirst')} />
              </Field>
              <Field field="guardianMiddle" label="Middle name" optional error={errorOf('guardianMiddle')}>
                <input className={INPUT} type="text" autoComplete="off" maxLength={MAX.guardianMiddle} {...bind('guardianMiddle')} />
              </Field>
              <Field field="guardianLast" label="Last name" error={errorOf('guardianLast')}>
                <input className={INPUT} type="text" autoComplete="off" maxLength={MAX.guardianLast} {...bind('guardianLast')} />
              </Field>
            </div>
            <div className={formGrid}>
              <Field field="guardianRelationship" label="Relationship to guardian" error={errorOf('guardianRelationship')}>
                <input className={INPUT} type="text" maxLength={MAX.guardianRelationship} {...bind('guardianRelationship')} />
              </Field>
              <Field field="guardianContact" label="Guardian contact number" error={errorOf('guardianContact')}>
                <input
                  className={INPUT}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="09171234567"
                  maxLength={MAX.guardianContact}
                  {...bind('guardianContact')}
                />
              </Field>
            </div>
          </fieldset>
        </section>

        <section className={SECTION} aria-label="Submit">
          <div className={fieldClass}>
            <label className={cn(checkClass, 'items-start [&_input]:mt-[3px]')}>
              <input
                id="apply-certify"
                type="checkbox"
                checked={certified}
                onChange={(e) => {
                  setCertified(e.target.checked);
                  if (e.target.checked) setCertifyError(false);
                }}
                disabled={busy}
                aria-invalid={certifyError || undefined}
                aria-describedby={certifyError ? 'apply-certify-error' : undefined}
              />
              I certify that the information above is true and correct.
            </label>
            {certifyError ? (
              <p id="apply-certify-error" className={fieldError}>
                {CERTIFY}
              </p>
            ) : null}
          </div>

          {progress !== null ? (
            <div className="flex flex-col gap-1.5 max-w-[360px]">
              <div
                className={progressTrack}
                role="progressbar"
                aria-label="Uploading photo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div className={progressBar} style={{ width: `${progress}%` }} />
              </div>
              <span className="text-12 text-muted tabular-nums">Uploading photo… {progress}%</span>
            </div>
          ) : null}

          {serverError ? (
            // The outline itself comes from the base :focus-visible rule.
            <div ref={alertRef} tabIndex={-1} className="focus-visible:rounded-card">
              <FormAlert>
                <ServerMessage error={serverError} />
              </FormAlert>
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              className={button({ variant: 'primary', size: 'lg' })}
              disabled={busy}
              aria-disabled={busy || undefined}
            >
              {busy ? (
                <>
                  <span className={spinner} aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                'Submit application'
              )}
            </button>
          </div>
        </section>
      </form>

      <div className={CARD_LINKS}>
        <p>
          Already applied? <Link href="/application-status">Check application status</Link>
        </p>
        <p>
          Have an account? <Link href="/">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
