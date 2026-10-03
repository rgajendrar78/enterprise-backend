import { env } from "@/config/env";
import type { ValueTransformer } from "typeorm";

/**
 * Transforms an S3 object key into a full CDN URL when reading from the database,
 * and strips the CDN URL back to the raw key when writing to the database.
 */
export const CdnUrlTransformer: ValueTransformer = {
  to: (value: string | null) => {
    if (!value) return value;
    const publicBaseUrl =
      env.AWS_S3_PUBLIC_URL || `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_S3_REGION}.amazonaws.com`;
    return value.replace(`${publicBaseUrl}/`, "");
  },
  from: (value: string | null) => {
    if (!value) return value;
    if (value.startsWith("http")) return value;
    const publicBaseUrl =
      env.AWS_S3_PUBLIC_URL || `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_S3_REGION}.amazonaws.com`;
    return `${publicBaseUrl}/${value.replace(/^\/+/, "")}`;
  },
};
