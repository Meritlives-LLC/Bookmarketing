import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, s3Bucket } from '../config/aws';
import { v4 as uuid } from 'uuid';

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

  async deleteObject(key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
  },

  publicUrl(key: string): string {
    return `https://${s3Bucket}.s3.amazonaws.com/${key}`;
  },
};
