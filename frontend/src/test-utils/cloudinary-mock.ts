// Mock Cloudinary client factory.
//
// The upload route test injects this via `vi.mock('@/lib/server/upload/cloudinary-client')`
// so the real Cloudinary SDK never gets called in a test process.
//
// Tests can override the upload branch by passing `onUpload` — passing a
// vi.fn that throws lets a test simulate Cloudinary 5xx, network failures,
// etc. Default returns a happy `{ publicId, secureUrl, bytes }` shape.
import { vi, type Mock } from 'vitest';

export interface MockCloudinaryOptions {
  /**
   * Override for `uploadBuffer`. If omitted, returns a happy
   * `{ publicId, secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/<id>', bytes, resourceType: 'image' }`.
   * Throw to simulate upload failure.
   */
  onUpload?: Mock;
}

export interface MockUploadResult {
  publicId: string;
  secureUrl: string;
  bytes: number;
  resourceType: string;
}

export interface MockCloudinaryClient {
  uploadBuffer: (
    publicId: string,
    body: Buffer,
    options?: { deliveryType?: 'authenticated' },
  ) => Promise<MockUploadResult>;
  getSignedDocumentUrl: (
    publicId: string,
    resourceType: string,
    format: string,
    expiresInSeconds?: number,
  ) => string;
  deleteAsset: (
    publicId: string,
    resourceType: string,
    options?: { deliveryType?: 'authenticated' },
  ) => Promise<void>;
}

/**
 * Build a mock Cloudinary uploader. Inject via:
 * `vi.mock('@/lib/server/upload/cloudinary-client', () => ({
 *   uploadBuffer: vi.fn((id, body, opts) => mockCloudinaryClient().uploadBuffer(id, body, opts)),
 *   getSignedDocumentUrl: vi.fn((id, rt, fmt, exp) => mockCloudinaryClient().getSignedDocumentUrl(id, rt, fmt, exp)),
 *   deleteAsset: vi.fn((id, rt, opts) => mockCloudinaryClient().deleteAsset(id, rt, opts)),
 *   StorageNotConfiguredError: class extends Error { ... },
 * }))`.
 */
export function mockCloudinaryClient(opts: MockCloudinaryOptions = {}): MockCloudinaryClient {
  return {
    uploadBuffer: vi.fn(async (publicId: string, body: Buffer) => {
      if (opts.onUpload) return (await opts.onUpload(publicId, body)) as MockUploadResult;
      return {
        publicId,
        secureUrl: `https://res.cloudinary.com/test-cloud/image/upload/${publicId}`,
        bytes: body.length,
        resourceType: 'image',
      };
    }),
    getSignedDocumentUrl: vi.fn(
      (publicId: string) =>
        `https://res.cloudinary.com/test-cloud/authenticated/${publicId}?signed=1`,
    ),
    deleteAsset: vi.fn(async () => undefined),
  };
}
