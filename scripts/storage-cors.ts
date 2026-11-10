// Sets the CORS rule browsers need to PUT uploads straight into the bucket in S3_BUCKET
// (Neon Object Storage, Cloudflare R2 or AWS S3). Allows APP_URL, http://localhost:3000 and any
// extra origins passed as arguments:  npm run storage:cors -- https://preview.example.com
import 'dotenv/config';
import { GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { s3Client, storageConfigFromProcessEnv } from '../lib/files/storage-core';

const config = storageConfigFromProcessEnv(() => '');
if (!config.bucket) {
  console.error('S3_BUCKET is empty, so there is no bucket to configure (uploads use the local disk).');
  process.exit(1);
}

const origins = [...new Set([process.env.APP_URL ?? '', 'http://localhost:3000', ...process.argv.slice(2)]
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean))];

const client = s3Client(config);

try {
  await client.send(new PutBucketCorsCommand({
    Bucket: config.bucket,
    CORSConfiguration: {
      // GET is not needed: downloads are streamed through the app, never straight from the bucket.
      CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['PUT'], AllowedHeaders: ['Content-Type'], MaxAgeSeconds: 3600 }],
    },
  }));
  const saved = await client.send(new GetBucketCorsCommand({ Bucket: config.bucket }));
  console.log(`CORS rule saved on "${config.bucket}":`);
  console.log(JSON.stringify(saved.CORSRules ?? [], null, 2));
} catch (e) {
  const err = e as { name?: string; message?: string };
  console.error(`Could not set CORS on "${config.bucket}": ${err.name ?? 'Error'}: ${err.message ?? String(e)}`);
  console.error('Check S3_ENDPOINT, S3_REGION and that the key can write to this bucket.');
  process.exit(1);
}
