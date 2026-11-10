import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations use Neon's direct (unpooled) connection; the app uses the pooled DATABASE_URL at runtime (lib/db.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
