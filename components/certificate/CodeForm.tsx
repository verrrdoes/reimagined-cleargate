import { button, fieldHint, fieldLabel, input } from '@/components/ui/recipes';

/** Look up a certificate by the code printed under its QR code. A plain GET form: works without script. */
export function CodeForm({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/verify" method="get" className="flex flex-col gap-1.5">
      <label htmlFor="verify-code" className={fieldLabel}>
        Verification code
      </label>
      <div className="flex gap-2 max-sm:flex-col">
        <input
          id="verify-code"
          name="code"
          className={input}
          defaultValue={defaultValue}
          placeholder="42-3FA91C07D2"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={40}
          aria-describedby="verify-code-hint"
        />
        <button type="submit" className={button({ variant: 'primary' })}>
          Check
        </button>
      </div>
      <p id="verify-code-hint" className={fieldHint}>
        It is printed under the QR code on the certificate, next to “Verification code”.
      </p>
    </form>
  );
}
