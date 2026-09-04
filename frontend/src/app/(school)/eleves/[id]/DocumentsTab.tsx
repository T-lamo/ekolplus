'use client';

import { useRef, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

const DOCUMENT_TYPES = [
  'BIRTH_CERTIFICATE',
  'VACCINATION_RECORD',
  'PREVIOUS_SCHOOL_RECORD',
] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_SIZE_MB = 10;
const CSRF_STORAGE_KEY = `${COOKIE_PREFIX}-csrf`;

interface DocumentRow {
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

// `api()` (lib/api.ts) unconditionally JSON.stringifies its body — unusable
// for multipart uploads, same constraint documented on ImageUploader.tsx.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export function DocumentsTab({ studentId }: { studentId: string }) {
  const t = useTranslations('Eleves.documents');
  const {
    data,
    error: dataErr,
    refresh,
  } = useApi<{ documents: DocumentRow[] }>(`/api/school/students/${studentId}/documents`);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const error = dataErr ? t('loadError') : null;

  const byType = new Map((data?.documents ?? []).map((d) => [d.type, d]));

  async function handleFile(type: DocumentType, file: File) {
    setRowError((prev) => ({ ...prev, [type]: '' }));
    if (!ACCEPT.split(',').includes(file.type)) {
      setRowError((prev) => ({ ...prev, [type]: t('unsupportedFormat') }));
      return;
    }
    if (file.size > MAX_SIZE_MB * 1_000_000) {
      setRowError((prev) => ({ ...prev, [type]: t('tooLarge', { maxSizeMb: MAX_SIZE_MB }) }));
      return;
    }

    setUploadingType(type);
    try {
      const form = new FormData();
      form.set('type', type);
      form.set('file', file);
      const csrf = readCsrfToken();
      const res = await fetch(`${API_URL}/api/school/students/${studentId}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
        body: form,
      });
      if (!res.ok) throw new Error('upload failed');
      void refresh();
    } catch {
      setRowError((prev) => ({ ...prev, [type]: t('uploadError') }));
    } finally {
      setUploadingType(null);
    }
  }

  if (error) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-destructive-foreground">{error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {DOCUMENT_TYPES.map((type) => (
          <Card key={type} className="flex-row items-center gap-4 p-4.5">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DOCUMENT_TYPES.map((type) => {
        const row = byType.get(type);
        const uploading = uploadingType === type;
        return (
          <Card key={type} className="flex-col gap-2 p-4.5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <FileText size={17} />
              </div>
              <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
                <div className="text-caption font-bold text-foreground">{t(`types.${type}`)}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold ${
                      row ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {row ? t('provided') : t('missing')}
                  </span>
                  {row && <span>{row.fileName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {row && (
                  <a
                    href={`${API_URL}/api/school/students/${studentId}/documents/${type}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-caption font-semibold text-foreground"
                  >
                    <Download size={13} />
                    {t('download')}
                  </a>
                )}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => inputRefs.current[type]?.click()}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Upload size={13} />
                  {uploading ? t('uploading') : row ? t('replace') : t('upload')}
                </button>
                <input
                  ref={(el) => {
                    inputRefs.current[type] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFile(type, file);
                  }}
                />
              </div>
            </div>
            {rowError[type] && (
              <p role="alert" className="text-xs text-destructive-foreground">
                {rowError[type]}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
