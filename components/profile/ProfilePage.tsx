'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { cn } from '@/components/ui/cn';
import {
  button,
  kv,
  mono,
  pageHead,
  pageHeadSub,
  panel,
  panelHead,
  panelSub,
  progress,
  progressBar,
} from '@/components/ui/recipes';
import { formatDate, formatDateTime, manilaDayStart } from '@/lib/time';
import { AvatarControls } from './AvatarControls';
import { EditDetailsDialog } from './EditDetailsDialog';
import { profileLayout } from './layout';
import { PasswordForm } from './PasswordForm';
import type { ProfileClearance, ProfileView, StaffInfo, StudentInfo } from './types';

const PANEL_SUB = cn(panelSub, 'text-12');
const PROFILE_LINK = 'inline-flex items-center gap-1 font-medium';

const NOT_SET = <span className="text-muted">Not set</span>;

/** "1st year", "2nd year", "3rd year", "4th year" */
function yearLevel(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix} year`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

const orNotSet = (v: string | null | undefined) => (v && v.trim() ? v : NOT_SET);

/** My profile, for every role. */
export function ProfilePage({ view }: { view: ProfileView }) {
  const [editing, setEditing] = useState(false);
  const { student, staff } = view;
  const portal = view.role === 'student' ? 'student' : 'staff';
  const roleLine = student
    ? `Student · ${student.studentNumber}`
    : staff?.isAdmin
      ? 'Administrator'
      : staff?.office
        ? `${staff.office.name} staff`
        : 'Staff';

  return (
    <>
      <header className={pageHead}>
        <h1>My profile</h1>
        <p className={pageHeadSub}>{student ? 'Your account and student details' : 'Your account and office details'}</p>
      </header>

      <section className={profileLayout.identity} aria-label="Profile picture">
        <Avatar name={view.name} url={view.avatarUrl ?? view.photoFallbackUrl} size={72} />
        <div className={profileLayout.identityText}>
          <p className="text-16 font-semibold wrap-anywhere">{view.name}</p>
          <p className="text-muted">{roleLine}</p>
          <p className="mt-0.5 text-12 text-muted wrap-anywhere">{view.email}</p>
        </div>
        <AvatarControls hasAvatar={view.avatarUrl !== null} hasPhotoFallback={view.photoFallbackUrl !== null} />
      </section>

      <div className={profileLayout.split}>
        <div className="flex flex-col gap-6">
          {student ? <StudentPanels student={student} onEdit={() => setEditing(true)} /> : null}
          {staff ? <StaffPanel staff={staff} onEdit={() => setEditing(true)} /> : null}
          <section className={panel()} aria-labelledby="pf-password">
            <div className={panelHead}>
              <div>
                <h2 id="pf-password">Password</h2>
                <p className={PANEL_SUB}>Change the password you sign in with.</p>
              </div>
            </div>
            <PasswordForm portal={portal} username={view.email} />
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {student ? <ClearancePanel clearance={student.clearance} /> : null}
          {staff ? <OfficePanel staff={staff} /> : null}
          <section className={panel()} aria-labelledby="pf-account">
            <div className={panelHead}>
              <h2 id="pf-account">Account</h2>
            </div>
            <dl className={kv}>
              <Row label="Sign-in email">{view.email}</Row>
              <Row label="Account type">
                {view.role === 'student' ? 'Student' : view.role === 'admin' ? 'Administrator' : 'Office staff'}
              </Row>
              <Row label="Member since">{formatDate(view.createdAt)}</Row>
              <Row label="Last sign-in">{view.lastLoginAt ? formatDateTime(view.lastLoginAt) : <span className="text-muted">Not recorded</span>}</Row>
            </dl>
            <p className="mt-3 text-12 text-muted">
              Your sign-in email can only be changed by {view.role === 'student' ? 'the Registrar' : 'an administrator'}.
            </p>
          </section>
        </div>
      </div>

      {student || staff ? <EditDetailsDialog open={editing} onClose={() => setEditing(false)} view={view} /> : null}
    </>
  );
}

function StudentPanels({ student, onEdit }: { student: StudentInfo; onEdit: () => void }) {
  const { contact, application } = student;
  const emergency = [contact.emergencyName, contact.emergencyContact].filter((v) => v && v.trim()).join(' · ');
  return (
    <>
      <section className={panel()} aria-labelledby="pf-student">
        <div className={panelHead}>
          <div>
            <h2 id="pf-student">Student details</h2>
            <p className={PANEL_SUB}>From the Registrar. Ask them if anything here is wrong.</p>
          </div>
        </div>
        <dl className={kv}>
          <Row label="Full name">{student.fullName}</Row>
          <Row label="Student ID">
            <span className={mono}>{student.studentNumber}</span>
          </Row>
          <Row label="Program">
            {student.programCode} – {student.programName}
          </Row>
          <Row label="Year level">{yearLevel(student.yearLevel)}</Row>
          {application ? <Row label="Admission">{application.admissionType}</Row> : null}
          {application?.reference ? (
            <Row label="Application ref">
              <span className={mono}>{application.reference}</span>
            </Row>
          ) : null}
        </dl>
      </section>

      <section className={panel()} aria-labelledby="pf-contact">
        <div className={panelHead}>
          <div>
            <h2 id="pf-contact">Contact details</h2>
            <p className={PANEL_SUB}>Offices use these to reach you.</p>
          </div>
          <button type="button" className={button({ size: 'sm' })} onClick={onEdit} aria-label="Edit your contact details">
            Edit
          </button>
        </div>
        <dl className={kv}>
          <Row label="Personal email">{orNotSet(contact.personalEmail)}</Row>
          <Row label="Mobile number">{orNotSet(contact.phone)}</Row>
          <Row label="Current address">{orNotSet(contact.currentAddress)}</Row>
          <Row label="Emergency contact">{emergency || NOT_SET}</Row>
        </dl>
      </section>

      {application ? (
        <section className={panel()} aria-labelledby="pf-application">
          <div className={panelHead}>
            <div>
              <h2 id="pf-application">From your application</h2>
              <p className={PANEL_SUB}>What you gave when you applied. The Registrar can correct these.</p>
            </div>
          </div>
          <dl className={kv}>
            <Row label="Birthday">{formatDate(manilaDayStart(application.birthday))}</Row>
            <Row label="Place of birth">{orNotSet(application.placeOfBirth)}</Row>
            <Row label="Sex">{application.sex}</Row>
            <Row label="Civil status">{application.civilStatus}</Row>
            <Row label="Religion">{orNotSet(application.religion)}</Row>
            <Row label="Permanent address">{orNotSet(application.permanentAddress)}</Row>
            <Row label="Father">{orNotSet(application.father)}</Row>
            <Row label="Mother">{orNotSet(application.mother)}</Row>
            <Row label="Guardian">{orNotSet(application.guardian)}</Row>
          </dl>
        </section>
      ) : null}
    </>
  );
}

function ClearancePanel({ clearance }: { clearance: ProfileClearance | null }) {
  return (
    <section className={panel()} aria-labelledby="pf-clearance">
      <div className={panelHead}>
        <h2 id="pf-clearance">{clearance && !clearance.isCurrent ? 'Latest clearance' : 'Clearance this term'}</h2>
      </div>
      {clearance ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="flex justify-between gap-2 tabular-nums">
              <span>
                {clearance.approvedCount} of {clearance.totalOffices} offices cleared
              </span>
              <span className="text-muted">{clearance.percentComplete}%</span>
            </p>
            <div
              className={progress}
              role="progressbar"
              aria-label="Offices cleared"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clearance.percentComplete}
            >
              <div className={progressBar} style={{ width: `${clearance.percentComplete}%` }} />
            </div>
          </div>
          <dl className={kv}>
            <Row label="Academic year">{clearance.academicYear}</Row>
            <Row label="Term">{clearance.termLabel}</Row>
            <Row label="Pending">{clearance.pendingCount}</Row>
            <Row label="Needs action">{clearance.needsActionCount}</Row>
            <Row label="Enrollment">
              {clearance.isEligible ? <Pill tone="approved">Eligible</Pill> : <Pill tone="pending">Not yet eligible</Pill>}
            </Row>
          </dl>
          <Link href="/clearance-status" className={PROFILE_LINK}>
            View clearance status
            <Icon name="arrow" size={14} />
          </Link>
        </div>
      ) : (
        <p className="text-muted">No clearance has been opened for you this term yet. It appears here once the Registrar opens one.</p>
      )}
    </section>
  );
}

function StaffPanel({ staff, onEdit }: { staff: StaffInfo; onEdit: () => void }) {
  const access = staff.isAdmin
    ? 'Can view and update every office'
    : staff.office
      ? `Can view and update ${staff.office.name} only`
      : 'Not linked to an office yet';
  return (
    <section className={panel()} aria-labelledby="pf-staff">
      <div className={panelHead}>
        <div>
          <h2 id="pf-staff">Your details</h2>
          <p className={PANEL_SUB}>Your name shows in reviews, messages and the audit log.</p>
        </div>
        <button type="button" className={button({ size: 'sm' })} onClick={onEdit} aria-label="Edit your details">
          Edit
        </button>
      </div>
      <dl className={kv}>
        <Row label="Full name">{staff.fullName}</Row>
        <Row label="Position">{staff.isAdmin ? 'System administrator' : orNotSet(staff.position)}</Row>
        <Row label="Mobile number">{orNotSet(staff.phone)}</Row>
        <Row label="Role">{staff.isAdmin ? 'Administrator' : 'Office staff'}</Row>
        <Row label="Access">{access}</Row>
      </dl>
    </section>
  );
}

function OfficePanel({ staff }: { staff: StaffInfo }) {
  return (
    <section className={panel()} aria-labelledby="pf-office">
      <div className={panelHead}>
        <h2 id="pf-office">Office</h2>
      </div>
      {staff.isAdmin ? (
        <dl className={kv}>
          <Row label="Office">All offices</Row>
        </dl>
      ) : staff.office ? (
        <dl className={kv}>
          <Row label="Office">{staff.office.name}</Row>
          <Row label="Office email">{staff.office.email}</Row>
          <Row label="Office hours">{staff.office.hours}</Row>
        </dl>
      ) : (
        <p className="text-muted">Your account is not linked to an office yet. Ask an administrator to link it.</p>
      )}
      {staff.isAdmin || staff.office ? (
        <Link href="/staff" className={cn(PROFILE_LINK, 'mt-3')}>
          Open pending list
          <Icon name="arrow" size={14} />
        </Link>
      ) : null}
    </section>
  );
}
