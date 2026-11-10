'use client';

import { useId, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { cn } from '@/components/ui/cn';
import {
  button,
  field as fieldClass,
  fieldError,
  fieldHint,
  fieldLabel,
  fieldOptional,
  formGrid,
  formGridFull,
  input,
} from '@/components/ui/recipes';
import { updateProfile } from '@/lib/actions/profile';
import { PATTERNS, SCHOOL_DOMAIN } from '@/lib/constants';
import type { ProfileInput, ProfileView } from './types';

type FieldName = keyof ProfileInput;
type Errors = Partial<Record<FieldName | 'form', string>>;

const chars = (s: string) => Array.from(s).length;

/** Same rule as the server (legacy phoneOrNull). */
function phoneError(value: string, label: string): string | null {
  const s = value.trim();
  if (s === '') return null;
  return chars(s) > 20 || !PATTERNS.profilePhone.test(s) ? `${label} should be a phone number, e.g. 0917 123 4567.` : null;
}

/**
 * "Edit your details". Students edit their contact details; staff and admins edit their name, number and
 * (staff) position.
 */
export function EditDetailsDialog({ open, onClose, view }: { open: boolean; onClose: () => void; view: ProfileView }) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const close = () => {
    if (!pending) onClose();
  };
  const isStudent = view.student !== null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Edit your details"
      description={
        isStudent
          ? 'Keep your contact details up to date so offices can reach you.'
          : 'Your name shows in reviews, messages and the audit log.'
      }
      footer={
        <>
          <button type="button" className={button({ variant: 'ghost' })} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <DetailsForm formId={formId} view={view} startTransition={startTransition} onDone={onClose} />
    </Dialog>
  );
}

function DetailsForm({
  formId,
  view,
  startTransition,
  onDone,
}: {
  formId: string;
  view: ProfileView;
  startTransition: TransitionStartFunction;
  onDone: () => void;
}) {
  const toast = useToast();
  const student = view.student;
  const staff = view.staff;
  const isStaffMember = view.role === 'staff' && staff?.office !== null;
  const [values, setValues] = useState<Required<ProfileInput>>(() => ({
    personalEmail: student?.contact.personalEmail ?? '',
    phone: (student ? student.contact.phone : staff?.phone) ?? '',
    currentAddress: student?.contact.currentAddress ?? '',
    emergencyName: student?.contact.emergencyName ?? '',
    emergencyContact: student?.contact.emergencyContact ?? '',
    fullName: staff?.fullName ?? '',
    position: staff?.position ?? '',
  }));
  const [errors, setErrors] = useState<Errors>({});
  const baseId = useId();
  const idFor = (name: FieldName) => `${baseId}-${name}`;

  const set = (name: FieldName) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));

  function showErrors(next: Errors) {
    setErrors(next);
    const first = (Object.keys(next) as (FieldName | 'form')[]).find((k) => k !== 'form');
    if (first) document.getElementById(idFor(first as FieldName))?.focus();
  }

  function validate(): Errors {
    const out: Errors = {};
    if (student) {
      const email = values.personalEmail.trim().toLowerCase();
      if (email !== '') {
        if (email.length > 190 || !PATTERNS.email.test(email)) out.personalEmail = 'Enter a valid personal email.';
        else if (email.endsWith(`@${SCHOOL_DOMAIN}`)) out.personalEmail = 'Use your own email here, not your ClearGate school email.';
      }
      const phone = phoneError(values.phone, 'Mobile number');
      if (phone) out.phone = phone;
      const emergency = phoneError(values.emergencyContact, 'Emergency contact number');
      if (emergency) out.emergencyContact = emergency;
    } else {
      if (chars(values.fullName.trim()) < 2) out.fullName = 'Enter your full name.';
      const phone = phoneError(values.phone, 'Mobile number');
      if (phone) out.phone = phone;
    }
    return out;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate();
    if (Object.keys(found).length) return showErrors(found);
    setErrors({});
    const input: ProfileInput = student
      ? {
          personalEmail: values.personalEmail,
          phone: values.phone,
          currentAddress: values.currentAddress,
          emergencyName: values.emergencyName,
          emergencyContact: values.emergencyContact,
        }
      : { fullName: values.fullName, position: values.position, phone: values.phone };
    startTransition(async () => {
      const res = await updateProfile(input);
      if (res.ok) {
        toast.success('Your details were saved.');
        onDone();
        return;
      }
      const { code, message } = res.error;
      if (code === 'invalid_email' || code === 'email_taken') showErrors({ personalEmail: message });
      else if (code === 'invalid_phone') showErrors(message.startsWith('Emergency') ? { emergencyContact: message } : { phone: message });
      else if (code === 'missing_fields') showErrors({ fullName: message });
      else showErrors({ form: message });
    });
  }

  const field = (
    name: FieldName,
    label: string,
    opts: {
      type?: 'text' | 'email' | 'tel';
      maxLength: number;
      autoComplete?: string;
      placeholder?: string;
      hint?: string;
      optional?: boolean;
      wide?: boolean;
      autoFocus?: boolean;
    },
  ) => {
    const id = idFor(name);
    const error = errors[name];
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = [opts.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
    return (
      <div className={cn(fieldClass, opts.wide && formGridFull)}>
        <label className={fieldLabel} htmlFor={id}>
          {label}
          {opts.optional ? <span className={fieldOptional}> (optional)</span> : null}
        </label>
        <input
          id={id}
          type={opts.type ?? 'text'}
          className={input}
          value={values[name]}
          onChange={set(name)}
          maxLength={opts.maxLength}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-autofocus={opts.autoFocus ? true : undefined}
        />
        {opts.hint ? (
          <p id={hintId} className={fieldHint}>
            {opts.hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className={fieldError}>
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
      {student ? (
        <>
          <FormAlert tone="info">
            Your name, student ID, program and year level come from the Registrar. Ask them if any of those are wrong.
          </FormAlert>
          <div className={formGrid}>
            {field('personalEmail', 'Personal email', {
              type: 'email',
              maxLength: 190,
              autoComplete: 'email',
              placeholder: 'you@gmail.com',
              hint: 'Used for Forgot password.',
              optional: true,
              autoFocus: true,
            })}
            {field('phone', 'Mobile number', { type: 'tel', maxLength: 20, autoComplete: 'tel', placeholder: '0917 123 4567', optional: true })}
            {field('currentAddress', 'Current address', {
              maxLength: 255,
              autoComplete: 'street-address',
              placeholder: 'House no., street, barangay, city',
              optional: true,
              wide: true,
            })}
            {field('emergencyName', 'Emergency contact person', { maxLength: 120, optional: true })}
            {field('emergencyContact', 'Their number', { type: 'tel', maxLength: 20, placeholder: '0917 123 4567', optional: true })}
          </div>
        </>
      ) : (
        <div className={formGrid}>
          {field('fullName', 'Full name', { maxLength: 120, autoComplete: 'name', wide: true, autoFocus: true })}
          {isStaffMember
            ? field('position', 'Position', { maxLength: 80, autoComplete: 'organization-title', placeholder: 'e.g. Head Librarian', optional: true })
            : null}
          {field('phone', 'Mobile number', {
            type: 'tel',
            maxLength: 20,
            autoComplete: 'tel',
            placeholder: '0917 123 4567',
            optional: true,
            wide: !isStaffMember,
          })}
        </div>
      )}
    </form>
  );
}
