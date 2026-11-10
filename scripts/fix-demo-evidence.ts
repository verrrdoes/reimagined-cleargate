// Repairs evidence files loaded by an older `npm run db:test-data`, which uploaded the seed's two demo PDFs
// (printed for Ariel Tapnio, 2024-00123) for every student and office. Each such file is replaced with that
// student's own document from prisma/demo-evidence.ts, so names and student numbers match the submission.
//
//   npx tsx scripts/fix-demo-evidence.ts           lists what would change
//   npx tsx scripts/fix-demo-evidence.ts --apply   rewrites the files and their stored sizes
//
// Only files that are byte-for-byte copies of prisma/demo-files/*.pdf are touched; real uploads never are.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client';
import { createStorage, storageConfigFromProcessEnv } from '../lib/files/storage-core';
import { TERM_LABEL } from '../lib/constants';
import { DEMO_EVIDENCE_OFFICES, evidencePdf } from '../prisma/demo-evidence';

neonConfig.webSocketConstructor = ws;

/** Both seed demo PDFs are printed for this student, so his own copies are already right. */
const DEMO_FILES_OWNER = '2024-00123';
const SEED_FILES = ['demo-book-return-slip.pdf', 'demo-official-receipt.pdf'];

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) in .env first. See .env.example.');
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  const store = createStorage(storageConfigFromProcessEnv(() => {
    throw new Error('This script never creates upload URLs.');
  }));

  try {
    const seedFiles = await Promise.all(
      SEED_FILES.map(async (name) => new Uint8Array(await readFile(fileURLToPath(new URL(`../prisma/demo-files/${name}`, import.meta.url))))),
    );
    const seedHashes = new Set(seedFiles.map(sha256));
    const seedSizes = [...new Set(seedFiles.map((f) => f.byteLength))];

    // A copy of a seed file has the same size; the hash check below confirms it before anything is written.
    const candidates = await prisma.submission.findMany({
      where: { mimeType: 'application/pdf', fileSize: { in: seedSizes } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        storageKey: true,
        reference: true,
        status: true,
        submittedAt: true,
        item: {
          select: {
            office: { select: { code: true } },
            clearance: {
              select: {
                term: true,
                academicYear: { select: { label: true } },
                student: { select: { firstName: true, lastName: true, studentNumber: true } },
              },
            },
          },
        },
      },
    });

    let fixed = 0;
    let skipped = 0;
    for (const s of candidates) {
      const { office, clearance } = s.item;
      const student = clearance.student;
      const who = `${s.reference ?? `#${s.id}`} ${student.firstName} ${student.lastName} (${student.studentNumber}), ${office.code}`;

      if (student.studentNumber === DEMO_FILES_OWNER) {
        skipped++;
        continue;
      }
      if (!(DEMO_EVIDENCE_OFFICES as readonly string[]).includes(office.code)) {
        console.log(`skip  ${who}: no demo document for this office`);
        skipped++;
        continue;
      }
      const stored = await store.get(s.storageKey);
      if (!stored) {
        console.log(`skip  ${who}: file is missing from storage`);
        skipped++;
        continue;
      }
      const current = new Uint8Array(await new Response(stored.body).arrayBuffer());
      if (!seedHashes.has(sha256(current))) {
        skipped++;
        continue;
      }

      const bytes = evidencePdf({
        office: office.code,
        studentName: `${student.firstName} ${student.lastName}`,
        studentNumber: student.studentNumber,
        termText: `${TERM_LABEL[clearance.term]}, A.Y ${clearance.academicYear.label}`,
        issuedAt: s.submittedAt,
        flawed: s.status === 'returned',
      });
      if (apply) {
        await store.put(s.storageKey, bytes, 'application/pdf');
        await prisma.submission.update({ where: { id: s.id }, data: { fileSize: bytes.byteLength } });
      }
      console.log(`${apply ? 'fixed' : 'would fix'}  ${who}${s.status === 'returned' ? ' (returned copy)' : ''}`);
      fixed++;
    }

    console.log(
      apply
        ? `\nReplaced ${fixed} file(s); left ${skipped} alone.`
        : `\n${fixed} file(s) would be replaced; ${skipped} left alone. Run again with --apply to write them.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
