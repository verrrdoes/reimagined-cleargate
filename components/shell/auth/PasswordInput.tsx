'use client';

import { useState, type Ref } from 'react';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { iconButton, input, inputWrap, inputWrapButton } from '@/components/ui/recipes';

/** A password field with a show/hide toggle (a pressed-state button, so the label stays "Show password"). */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
  inputRef,
  autoFocus,
  name,
  maxLength = 128,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  name?: string;
  maxLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className={inputWrap}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        className={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className={cn(iconButton({ size: 'sm' }), inputWrapButton)}
        aria-label="Show password"
        aria-pressed={shown}
        aria-controls={id}
        onClick={() => setShown((s) => !s)}
      >
        <Icon name={shown ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  );
}
