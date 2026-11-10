import 'server-only';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';
import { PrismaClient, type Prisma } from '@/generated/prisma/client';
import { env } from '@/lib/env';

// Neon's serverless driver talks to the pooled endpoint over WebSockets, which supports interactive transactions.
neonConfig.webSocketConstructor = ws;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

function create(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: env().DATABASE_URL }),
    // Neon computes can take a few seconds to wake from scale-to-zero.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
}

const g = globalThis as unknown as { __cleargatePrisma?: PrismaClient };

function client(): PrismaClient {
  if (!g.__cleargatePrisma) g.__cleargatePrisma = create();
  return g.__cleargatePrisma;
}

/** The Prisma client, created on first use (so builds don't need DATABASE_URL). */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
