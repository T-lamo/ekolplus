import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadStreamMock = vi.fn();
const destroyMock = vi.fn(async () => ({ result: 'ok' }));
const privateDownloadUrlMock = vi.fn(
  (_publicId?: string, _format?: string, _options?: Record<string, unknown>) =>
    'https://res.cloudinary.com/test-cloud/download-signed',
);
const configMock = vi.fn();

vi.mock('cloudinary', () => ({
  v2: {
    config: configMock,
    uploader: { upload_stream: uploadStreamMock, destroy: destroyMock },
    utils: { private_download_url: privateDownloadUrlMock },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
});

function mockUploadStreamOnce(response: Record<string, unknown>) {
  uploadStreamMock.mockImplementationOnce(
    (_options: unknown, cb: (err: unknown, res: unknown) => void) => ({
      end: () => cb(null, response),
    }),
  );
}

describe('uploadBuffer', () => {
  it('does not set a delivery type by default (public upload, unchanged behavior)', async () => {
    const { uploadBuffer, __resetCloudinarySingleton } = await import('./cloudinary-client');
    __resetCloudinarySingleton();
    mockUploadStreamOnce({
      public_id: 'p1',
      secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/p1',
      bytes: 4,
      resource_type: 'image',
    });

    await uploadBuffer('p1', Buffer.from('data'));

    const optionsArg = uploadStreamMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(optionsArg.type).toBeUndefined();
  });

  it('passes type "authenticated" when deliveryType is "authenticated"', async () => {
    const { uploadBuffer, __resetCloudinarySingleton } = await import('./cloudinary-client');
    __resetCloudinarySingleton();
    mockUploadStreamOnce({
      public_id: 'students/s1/doc',
      secure_url: 'https://res.cloudinary.com/test-cloud/authenticated/upload/students/s1/doc',
      bytes: 10,
      resource_type: 'raw',
    });

    const result = await uploadBuffer('students/s1/doc', Buffer.from('pdfdata'), {
      deliveryType: 'authenticated',
    });

    const optionsArg = uploadStreamMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(optionsArg.type).toBe('authenticated');
    expect(result.resourceType).toBe('raw');
  });
});

describe('getSignedDocumentUrl', () => {
  // cloudinary@2.10.0's `cloudinary.url({ sign_url: true, expires_at })`
  // silently drops `expires_at` (verified empirically: two different
  // expiries produce byte-identical URLs), so this function must go through
  // `cloudinary.utils.private_download_url()` (the Download API) instead,
  // which does embed a real expiry. This test only proves OUR code calls it
  // with the right shape — real expiry behavior against the actual SDK is
  // inherently untestable against a mock and was verified separately.
  it('calls private_download_url with the public id, format, and an authenticated/expiring options object', async () => {
    const { getSignedDocumentUrl, __resetCloudinarySingleton } =
      await import('./cloudinary-client');
    __resetCloudinarySingleton();

    getSignedDocumentUrl('students/s1/doc', 'raw', 'pdf', 300);

    expect(privateDownloadUrlMock).toHaveBeenCalledTimes(1);
    const [publicIdArg, formatArg, optionsArg] = privateDownloadUrlMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(publicIdArg).toBe('students/s1/doc');
    expect(formatArg).toBe('pdf');
    expect(optionsArg.type).toBe('authenticated');
    expect(optionsArg.resource_type).toBe('raw');
    expect(typeof optionsArg.expires_at).toBe('number');
  });
});

describe('deleteAsset', () => {
  it('calls destroy with the resource type and delivery type', async () => {
    const { deleteAsset, __resetCloudinarySingleton } = await import('./cloudinary-client');
    __resetCloudinarySingleton();

    await deleteAsset('students/s1/doc', 'raw', { deliveryType: 'authenticated' });

    expect(destroyMock).toHaveBeenCalledWith('students/s1/doc', {
      resource_type: 'raw',
      type: 'authenticated',
    });
  });
});
