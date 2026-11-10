import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is not set. Copy .env.example to .env and paste your Neon pooled connection string.'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CRON_SECRET: z.string().default(''),
  DEMO_MODE: z.enum(['0', '1']).default('0'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('ClearGate <no-reply@cgateway.edu.ph>'),
  RESEND_API_KEY: z.string().default(''),
  APP_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment, read lazily so `next build` works without secrets. */
export function env(): Env {
  if (cached) return cached;
  const blank = (v: string | undefined) => (v === undefined || v === '' ? undefined : v);
  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: blank(process.env.APP_URL),
    CRON_SECRET: blank(process.env.CRON_SECRET),
    DEMO_MODE: blank(process.env.DEMO_MODE),
    S3_ENDPOINT: blank(process.env.S3_ENDPOINT),
    S3_REGION: blank(process.env.S3_REGION),
    S3_BUCKET: blank(process.env.S3_BUCKET),
    S3_ACCESS_KEY_ID: blank(process.env.S3_ACCESS_KEY_ID),
    S3_SECRET_ACCESS_KEY: blank(process.env.S3_SECRET_ACCESS_KEY),
    MAIL_FROM: blank(process.env.MAIL_FROM),
    RESEND_API_KEY: blank(process.env.RESEND_API_KEY),
    APP_SECRET: blank(process.env.APP_SECRET),
  });
  if (!parsed.success) {
    throw new Error('Invalid environment: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  cached = parsed.data;
  return cached;
}

export const isProductionDeploy = () => process.env.VERCEL_ENV === 'production';

/** DEMO_MODE returns reset tokens in responses. It is ignored on a Vercel production deploy. */
export function isDemoMode(): boolean {
  if (env().DEMO_MODE !== '1') return false;
  if (isProductionDeploy()) {
    console.warn('ClearGate: DEMO_MODE=1 is ignored in production.');
    return false;
  }
  return true;
}

/** Secret for signing local upload URLs; falls back to a dev-only value off Vercel. */
export function appSecret(): string {
  const s = env().APP_SECRET || env().CRON_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error('Set APP_SECRET (or CRON_SECRET) in the Vercel project settings.');
  return 'cleargate-local-development-secret';
}
