import { Injectable, Logger } from "@nestjs/common";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";
import { S3_CONSTANTS } from "@/infra/s3/s3.constants";

export interface PresignedUpload {
  uploadUrl: string;
  imageKey: string;
}

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly logger = new Logger(S3Service.name);

  constructor() {
    this.client = new S3Client({
      region: env.AWS_S3_REGION,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // Defaults to EC2/ECS metadata if undefined
    });
  }

  async generatePresignedUpload(key: string, contentType: string): Promise<PresignedUpload> {
    try {
      const command = new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: S3_CONSTANTS.PRESIGNED_URL_TTL_SECONDS,
      });

      return { uploadUrl, imageKey: key };
    } catch (error) {
      this.logger.error("Failed to generate presigned upload URL", (error as Error).stack);
      throw error;
    }
  }

  buildPublicUrl(key: string | null): string | null {
    if (!key) return null;
    const publicBaseUrl =
      env.AWS_S3_PUBLIC_URL || `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_S3_REGION}.amazonaws.com`;
    return `${publicBaseUrl}/${key.replace(/^\/+/, "")}`;
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    });

    try {
      await this.client.send(command);
    } catch (error) {
      this.logger.error(`Failed to delete object from S3: ${key}`, (error as Error).stack);
      // Soft-fail: if we can't delete the old avatar, it's a small space leak but
      // shouldn't block the user operation.
    }
  }

  /**
   * Helper to extract the raw key from an imageUrl, which might be a full URL.
   */
  extractKeyFromUrl(imageUrl: string): string | null {
    if (!imageUrl) return null;
    try {
      const url = new URL(imageUrl);
      return url.pathname.replace(/^\/+/, ""); // strip leading slash
    } catch {
      // If it's already a relative path or invalid URL, just return as is (if no protocol)
      return imageUrl.replace(/^\/+/, "");
    }
  }
}
