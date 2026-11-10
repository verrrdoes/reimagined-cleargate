'use server';

import { refresh } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { fail, isUniqueViolation, runAction, type Result } from '@/lib/result';
import { isEmail, optStr, str } from '@/lib/input';
import { LIMITS, MB, PATTERNS, SCHOOL_DOMAIN } from '@/lib/constants';
import { randomHex } from '@/lib/ids';
import { isImageMime, sniff } from '@/lib/files/sniff';
import { removeQuietly, storage } from '@/lib/files/storage';
import { avatarUrl } from '@/lib/services/shell';
import type { ProfileInput } from '@/components/profile/types';

/*
 * My profile actions (HANDOFF §8.10, legacy updateProfile, uploadAvatar, removeAvatar). Every role edits only
 * its own account. Students keep their contact details up to date; their name, student ID, program and year
 * level come from the Registrar. Staff and admins edit their name (staff also their position) and number.
 */

const EMAIL_TAKEN = 'Another account already uses that email.';

/** An optional phone number (legacy phoneOrNull): empty → null, else up to 20 characters of digits and separators. */
function phoneOrNull(value: unknown, label: string): string | null {
  const s = str(value, 40);
  if (s === '') return null;
  if (Array.from(s).length > 20 || !PATTERNS.profilePhone.test(s)) {
    fail(400, 'invalid_phone', `${label} should be a phone number, e.g. 0917 123 4567.`);
  }
  return s;
}

/** Saves "Edit your details". */
export async function updateProfile(input: ProfileInput): Promise<Result<null>> {
  return runAction(async () => {
    const user = await requireUser();

    if (user.role === 'student') {
      if (!user.student) fail(403, 'forbidden', 'Your account has no student record.');
      const email = str(input?.personalEmail, 190).toLowerCase();
      let personalEmail: string | null = null;
      if (email !== '') {
        if (!isEmail(email)) fail(400, 'invalid_email', 'Enter a valid personal email.');
        if (email.endsWith(`@${SCHOOL_DOMAIN}`)) fail(400, 'invalid_email', 'Use your own email here, not your ClearGate school email.');
        const taken = await db.user.findFirst({
          where: { id: { not: user.id }, OR: [{ email }, { personalEmail: email }] },
          select: { id: true },
        });
        if (taken) fail(409, 'email_taken', EMAIL_TAKEN);
        personalEmail = email;
      }
      const phone = phoneOrNull(input?.phone, 'Mobile number');
      const currentAddress = optStr(input?.currentAddress, 255);
      const emergencyName = optStr(input?.emergencyName, 120);
      const emergencyContact = phoneOrNull(input?.emergencyContact, 'Emergency contact number');
      const studentId = user.student.id;

      try {
        await db.$transaction(async (tx) => {
          await tx.user.update({ where: { id: user.id }, data: { personalEmail, phone } });
          await tx.student.update({ where: { id: studentId }, data: { currentAddress, emergencyName, emergencyContact } });
        });
      } catch (e) {
        if (isUniqueViolation(e)) fail(409, 'email_taken', EMAIL_TAKEN);
        throw e;
      }
      refresh();
      return null;
    }

    const fullName = str(input?.fullName, 120);
    if (Array.from(fullName).length < 2) fail(400, 'missing_fields', 'Enter your full name.');
    const phone = phoneOrNull(input?.phone, 'Mobile number');
    const profile = user.staffProfile;

    await db.$transaction(async (tx) => {
      if (user.role === 'staff' && profile) {
        await tx.officeStaff.update({
          where: { userId: user.id },
          data: { fullName, position: optStr(input?.position, 80) },
        });
        await tx.user.update({ where: { id: user.id }, data: { phone } });
      } else {
        await tx.user.update({ where: { id: user.id }, data: { fullName, phone } });
      }
    });
    refresh();
    return null;
  });
}

/**
 * Stores a new profile picture from the `avatar` field (the browser crops it to a square JPEG first). The type
 * comes from the file's first bytes; the old picture is deleted once the new one is saved.
 */
export async function uploadAvatar(form: FormData): Promise<Result<{ avatarUrl: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const file = form instanceof FormData ? form.get('avatar') : null;
    if (!file || typeof file === 'string' || file.size === 0) fail(400, 'no_file', 'Choose a picture to upload.');
    if (file.size > LIMITS.avatarMB * MB) fail(413, 'file_too_large', `That picture is too large. The limit is ${LIMITS.avatarMB} MB.`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes.subarray(0, 16));
    if (!type || !isImageMime(type.mime)) fail(415, 'file_type', 'Upload a JPG, PNG or WEBP picture.');

    const key = `avatars/u${user.id}-${randomHex(8)}.${type.ext}`;
    await storage().put(key, bytes, type.mime);

    let previous: string | null;
    try {
      previous = await db.$transaction(async (tx) => {
        const current = await tx.user.findUnique({ where: { id: user.id }, select: { avatarKey: true } });
        await tx.user.update({ where: { id: user.id }, data: { avatarKey: key, avatarMime: type.mime } });
        return current?.avatarKey ?? null;
      });
    } catch (e) {
      await removeQuietly(key);
      throw e;
    }
    if (previous && previous !== key) await removeQuietly(previous);

    refresh();
    return { avatarUrl: avatarUrl({ id: user.id, avatarKey: key }) as string };
  });
}

/** Removes the profile picture; the initials show instead. */
export async function removeAvatar(): Promise<Result<null>> {
  return runAction(async () => {
    const user = await requireUser();
    const current = await db.user.findUnique({ where: { id: user.id }, select: { avatarKey: true } });
    const key = current?.avatarKey ?? null;
    if (key) {
      const done = await db.user.updateMany({ where: { id: user.id, avatarKey: key }, data: { avatarKey: null, avatarMime: null } });
      if (done.count === 1) await removeQuietly(key);
    }
    refresh();
    return null;
  });
}
