'use client';

import { useRef, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_SIZE_MB = 10;
const CSRF_STORAGE_KEY = `${COOKIE_PREFIX}-csrf`;

// `api()` (lib/api.ts, CLAUDE.md-protected) unconditionally JSON.stringifies
// its body — unusable for multipart uploads. This reads the CSRF token the
// same way lib/api.ts does internally, duplicated rather than exported from
// a protected file.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export function ImageUploader({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Format non supporté (PNG, JPG ou WebP attendu).');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1_000_000) {
      setError(`Image trop volumineuse (max ${MAX_SIZE_MB} Mo).`);
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const csrfToken = readCsrfToken();
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body as { message?: string } | null)?.message ?? "L'envoi a échoué.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      onChange(url);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-destructive-foreground"
          >
            <X size={11} />
            Retirer
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex h-16 w-full flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-border bg-background text-center disabled:opacity-60"
      >
        {value ? (
          <img src={value} alt={label} className="h-12 w-auto object-contain" />
        ) : (
          <>
            <UploadCloud size={18} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {uploading ? 'Envoi…' : (hint ?? 'PNG, JPG ou WebP')}
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-1 text-2xs text-destructive-foreground">{error}</p>}
    </div>
  );
}
