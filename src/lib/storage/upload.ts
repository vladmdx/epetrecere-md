import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || "epetrecere";
const PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

interface UploadOptions {
  folder?: string;
  contentType?: string;
}

/** Upload a file buffer to Cloudflare R2 and return the public URL */
export async function uploadToR2(
  file: Buffer,
  filename: string,
  opts: UploadOptions = {},
): Promise<string> {
  const key = opts.folder ? `${opts.folder}/${filename}` : filename;
  const contentType =
    opts.contentType || inferContentType(filename) || "application/octet-stream";

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: contentType,
    }),
  );

  return `${PUBLIC_URL}/${key}`;
}

/** Generate a unique filename from an original name */
export function generateFilename(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.${ext}`;
}

function inferContentType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    pdf: "application/pdf",
  };
  return ext ? types[ext] : undefined;
}

/** Generate auto alt tag for an image */
export function generateAltTag(
  entityName: string,
  category?: string,
  city?: string,
): string {
  const parts = [entityName];
  if (category) parts.push(category);
  parts.push(city || "Moldova");
  return parts.join(" — ");
}
