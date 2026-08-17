import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, s3Bucket } from '../config/aws';
import { v4 as uuid } from 'uuid';
import { Readable } from 'stream';

export const storageService = {
  async uploadBuffer(buffer: Buffer, contentType: string, folder = 'uploads'): Promise<string> {
    const key = `${folder}/${uuid()}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return key;
  },

  async getSignedUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: s3Bucket, Key: key, ContentType: contentType });
    return getSignedUrl(s3Client, command, { expiresIn: 900 });
  },

  /**
   * Downloads an object into memory. For internal/worker use only — never
   * expose the result of this over HTTP for private content (e.g.
   * manuscripts); route access through an authenticated, ownership-checked
   * endpoint instead of handing back a public/raw URL.
   */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));
    const body = result.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  },

  async deleteObject(key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
  },

  publicUrl(key: string): string {
    return `https://${s3Bucket}.s3.amazonaws.com/${key}`;
  },
};
