'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import {
  field as fieldClass,
  fieldError as fieldErrorClass,
  fieldHint,
  fieldLabel,
  formGridFull,
  input,
  select,
} from '@/components/ui/recipes';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { MAX, type ApplicationField } from './rules';

// The Philippine address cascade (HANDOFF §10.1): region → province → city / municipality → barangay.
// The selects store names; the PSGC codes are only used to look up the next level. Each file under
// /data loads the first time it is needed, and changing a level clears the levels below it.

type Place = { c: string; n: string };
type PhFile = 'regions' | 'provinces' | 'cities' | 'barangays';

const files = new Map<PhFile, Promise<unknown>>();

function loadPh<T>(name: PhFile): Promise<T> {
  let p = files.get(name);
  if (!p) {
    p = fetch(`/data/ph-${name}.json`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`ph-${name}.json: HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .catch((e: unknown) => {
        files.delete(name); // let the next change try again
        throw e;
      });
    files.set(name, p);
  }
  return p as Promise<T>;
}

const LOAD_ERROR = 'The address lists could not load. Refresh the page to try again.';

// The sign-up form's controls are 40px tall.
const SELECT = cn(select, 'h-10');
const INPUT = cn(input, 'h-10');

export type AddressValue = { region: string; province: string; city: string; barangay: string };

type Lists = {
  regions: Place[] | null;
  provinces: Place[] | null;
  cities: Place[] | null;
  barangays: string[] | null;
};

/**
 * The four address selects. `value` holds the chosen names; `onChange` receives the levels that changed
 * (always including the cleared ones below). `invalid` and `error` are the field the last check stopped at
 * and its message, shown under that field.
 */
export function AddressFields({
  value,
  onChange,
  invalid,
  error: problem,
  disabled,
}: {
  value: AddressValue;
  onChange: (next: Partial<AddressValue>) => void;
  invalid: ApplicationField | null;
  error: string | null;
  disabled?: boolean;
}) {
  const [lists, setLists] = useState<Lists>({ regions: null, provinces: [], cities: [], barangays: [] });
  const [codes, setCodes] = useState({ region: '', province: '', city: '' });
  const [error, setError] = useState<string | null>(null);
  // The codes the latest change asked for, so a slow file can't fill a list that has since moved on.
  const wanted = useRef(codes);

  useEffect(() => {
    let live = true;
    loadPh<Place[]>('regions')
      .then((regions) => {
        if (live) setLists((l) => ({ ...l, regions }));
      })
      .catch(() => {
        if (live) {
          setLists((l) => ({ ...l, regions: [] }));
          setError(LOAD_ERROR);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  function choose(next: { region: string; province: string; city: string }) {
    wanted.current = next;
    setCodes(next);
  }

  function onRegion(code: string) {
    const name = lists.regions?.find((r) => r.c === code)?.n ?? '';
    choose({ region: code, province: '', city: '' });
    setLists((l) => ({ ...l, provinces: code ? null : [], cities: [], barangays: [] }));
    onChange({ region: name, province: '', city: '', barangay: '' });
    if (!code) return;
    loadPh<Record<string, Place[]>>('provinces')
      .then((all) => {
        if (wanted.current.region === code) setLists((l) => ({ ...l, provinces: all[code] ?? [] }));
      })
      .catch(() => {
        if (wanted.current.region === code) {
          setLists((l) => ({ ...l, provinces: [] }));
          setError(LOAD_ERROR);
        }
      });
  }

  function onProvince(code: string) {
    const name = lists.provinces?.find((p) => p.c === code)?.n ?? '';
    const region = codes.region;
    choose({ region, province: code, city: '' });
    setLists((l) => ({ ...l, cities: code ? null : [], barangays: [] }));
    onChange({ province: name, city: '', barangay: '' });
    if (!code) return;
    loadPh<Record<string, Place[]>>('cities')
      .then((all) => {
        const w = wanted.current;
        if (w.region === region && w.province === code) setLists((l) => ({ ...l, cities: all[region + code] ?? [] }));
      })
      .catch(() => {
        const w = wanted.current;
        if (w.region === region && w.province === code) {
          setLists((l) => ({ ...l, cities: [] }));
          setError(LOAD_ERROR);
        }
      });
  }

  function onCity(code: string) {
    const name = lists.cities?.find((c) => c.c === code)?.n ?? '';
    const { region, province } = codes;
    choose({ region, province, city: code });
    setLists((l) => ({ ...l, barangays: code ? null : [] }));
    onChange({ city: name, barangay: '' });
    if (!code) return;
    loadPh<Record<string, string[]>>('barangays')
      .then((all) => {
        if (wanted.current.city === code) setLists((l) => ({ ...l, barangays: all[code] ?? [] }));
      })
      .catch(() => {
        if (wanted.current.city === code) {
          setLists((l) => ({ ...l, barangays: [] }));
          setError(LOAD_ERROR);
        }
      });
  }

  const showsError = (field: ApplicationField) => invalid === field && !!problem;
  const describe = (field: ApplicationField, hintId?: string) =>
    [showsError(field) ? `apply-${field}-error` : undefined, hintId].filter(Boolean).join(' ') || undefined;
  const fieldError = (field: ApplicationField) =>
    showsError(field) ? (
      <p id={`apply-${field}-error`} className={fieldErrorClass}>
        {problem}
      </p>
    ) : null;

  // Some cities have no barangay list in the PSGC file; then the barangay is typed instead.
  const typeBarangay = codes.city !== '' && lists.barangays !== null && lists.barangays.length === 0 && !error;

  return (
    <>
      {error ? (
        <div className={formGridFull}>
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}

      <div className={fieldClass}>
        <label className={fieldLabel} htmlFor="apply-region">
          Region
        </label>
        <select
          id="apply-region"
          className={SELECT}
          value={codes.region}
          onChange={(e) => onRegion(e.target.value)}
          disabled={disabled || lists.regions === null || lists.regions.length === 0}
          aria-busy={lists.regions === null || undefined}
          aria-invalid={invalid === 'region' || undefined}
          aria-describedby={describe('region')}
        >
          <option value="">{lists.regions === null ? 'Loading regions…' : 'Select a region'}</option>
          {(lists.regions ?? []).map((r) => (
            <option key={r.c} value={r.c}>
              {r.n}
            </option>
          ))}
        </select>
        {fieldError('region')}
      </div>

      <div className={fieldClass}>
        <label className={fieldLabel} htmlFor="apply-province">
          Province
        </label>
        <select
          id="apply-province"
          className={SELECT}
          value={codes.province}
          onChange={(e) => onProvince(e.target.value)}
          disabled={disabled || !codes.region || lists.provinces === null || lists.provinces.length === 0}
          aria-busy={lists.provinces === null || undefined}
          aria-invalid={invalid === 'province' || undefined}
          aria-describedby={describe('province', !codes.region ? 'apply-province-hint' : undefined)}
        >
          <option value="">{lists.provinces === null ? 'Loading provinces…' : 'Select a province'}</option>
          {(lists.provinces ?? []).map((p) => (
            <option key={p.c} value={p.c}>
              {p.n}
            </option>
          ))}
        </select>
        {fieldError('province')}
        {!codes.region ? (
          <p id="apply-province-hint" className={fieldHint}>
            Select a region first
          </p>
        ) : null}
      </div>

      <div className={fieldClass}>
        <label className={fieldLabel} htmlFor="apply-city">
          City / Municipality
        </label>
        <select
          id="apply-city"
          className={SELECT}
          value={codes.city}
          onChange={(e) => onCity(e.target.value)}
          disabled={disabled || !codes.province || lists.cities === null || lists.cities.length === 0}
          aria-busy={lists.cities === null || undefined}
          aria-invalid={invalid === 'city' || undefined}
          aria-describedby={describe('city', !codes.province ? 'apply-city-hint' : undefined)}
        >
          <option value="">{lists.cities === null ? 'Loading cities…' : 'Select a city or municipality'}</option>
          {(lists.cities ?? []).map((c) => (
            <option key={c.c} value={c.c}>
              {c.n}
            </option>
          ))}
        </select>
        {fieldError('city')}
        {!codes.province ? (
          <p id="apply-city-hint" className={fieldHint}>
            Select a province first
          </p>
        ) : null}
      </div>

      <div className={fieldClass}>
        <label className={fieldLabel} htmlFor="apply-barangay">
          Barangay
        </label>
        {typeBarangay ? (
          <>
            <input
              id="apply-barangay"
              className={INPUT}
              type="text"
              value={value.barangay}
              onChange={(e) => onChange({ barangay: e.target.value })}
              maxLength={MAX.barangay}
              disabled={disabled}
              autoComplete="off"
              aria-invalid={invalid === 'barangay' || undefined}
              aria-describedby={describe('barangay', 'apply-barangay-hint')}
            />
            {fieldError('barangay')}
            <p id="apply-barangay-hint" className={fieldHint}>
              There is no barangay list for this city. Type your barangay.
            </p>
          </>
        ) : (
          <>
            <select
              id="apply-barangay"
              className={SELECT}
              value={value.barangay}
              onChange={(e) => onChange({ barangay: e.target.value })}
              disabled={disabled || !codes.city || lists.barangays === null || lists.barangays.length === 0}
              aria-busy={lists.barangays === null || undefined}
              aria-invalid={invalid === 'barangay' || undefined}
              aria-describedby={describe('barangay', !codes.city ? 'apply-barangay-hint' : undefined)}
            >
              <option value="">{lists.barangays === null ? 'Loading barangays…' : 'Select a barangay'}</option>
              {(lists.barangays ?? []).map((b, i) => (
                <option key={`${i}-${b}`} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {fieldError('barangay')}
            {!codes.city ? (
              <p id="apply-barangay-hint" className={fieldHint}>
                Select a city / municipality first
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
