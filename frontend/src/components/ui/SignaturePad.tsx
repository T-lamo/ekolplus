'use client';

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { PenLine, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { Modal } from './Modal';
import { ImageUploader } from './ImageUploader';

const CSRF_STORAGE_KEY = `${COOKIE_PREFIX}-csrf`;

// Same read-the-CSRF-token-client-side duplication as ImageUploader.tsx (see
// its own comment) — lib/api.ts (CLAUDE.md-protected) always JSON.stringifies
// its body, so it can't send a multipart upload.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

async function uploadSignatureBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', new File([blob], 'signature.png', { type: 'image/png' }));
  const csrfToken = readCsrfToken();
  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    body: form,
  });
  if (!res.ok) throw new Error('upload failed');
  const { url } = (await res.json()) as { url: string };
  return url;
}

interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

// Ink drawn on a canvas whose bitmap background is NEVER painted (no
// fillRect) stays transparent outside the strokes — `bg-white` below is
// only the element's CSS background, giving the signer something to see
// against while drawing. toBlob('image/png') therefore exports the
// strokes on a transparent background, so it composites onto the printed
// bulletin like ink rather than a white rectangle.
const SignatureCanvas = forwardRef<SignatureCanvasHandle>(function SignatureCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInkRef.current = false;
    },
    isEmpty() {
      return !hasInkRef.current;
    },
    toBlob() {
      return new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          resolve(null);
          return;
        }
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });
    },
  }));

  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointerPos(e);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!drawingRef.current || !canvas || !ctx || !lastPointRef.current) return;
    const point = pointerPos(e);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    hasInkRef.current = true;
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={200}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="h-[200px] w-full touch-none rounded-md border border-border bg-white"
    />
  );
});

function SignatureModal({
  title,
  onClose,
  onSaved,
}: {
  title: string;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const t = useTranslations('Common.signaturePad');

  async function handleValidateDraw() {
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas || canvas.isEmpty()) {
      setError(t('empty'));
      return;
    }
    setSaving(true);
    try {
      const blob = await canvas.toBlob();
      if (!blob) {
        setError(t('empty'));
        return;
      }
      const url = await uploadSignatureBlob(blob);
      onSaved(url);
    } catch {
      setError(t('uploadFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex gap-1.5 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab('draw')}
          className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
            tab === 'draw' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('tabDraw')}
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
            tab === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('tabUpload')}
        </button>
      </div>

      {tab === 'draw' ? (
        <div className="mt-4">
          <SignatureCanvas ref={canvasRef} />
          <p className="mt-2 text-2xs text-muted-foreground">{t('drawHint')}</p>
          {error && <p className="mt-1 text-2xs text-destructive-foreground">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => canvasRef.current?.clear()}
              disabled={saving}
              className="rounded-md px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-60"
            >
              {t('clear')}
            </button>
            <button
              type="button"
              onClick={handleValidateDraw}
              disabled={saving}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <ImageUploader
            label={t('tabUpload')}
            value={null}
            onChange={(url) => {
              if (url) onSaved(url);
            }}
          />
        </div>
      )}
    </Modal>
  );
}

interface SignaturePadProps {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

/** Drop-in replacement for `ImageUploader` for signature fields — same
 * `{label, hint, value, onChange}` shape and dashed-box trigger, but
 * clicking it opens a panel to either draw the signature (canvas, see
 * SignatureCanvas above) or upload an image file (delegates to the
 * existing ImageUploader). Either path ends by calling `onChange(url)`
 * with a Cloudinary URL from the same `/api/upload` endpoint the rest of
 * the app already uses. */
export function SignaturePad({ label, hint, value, onChange }: SignaturePadProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('Common.signaturePad');
  const tUploader = useTranslations('Common.imageUploader');

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
            {tUploader('remove')}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-16 w-full flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-border bg-background text-center"
      >
        {value ? (
          <img src={value} alt={label} className="h-12 w-auto object-contain" />
        ) : (
          <>
            <PenLine size={18} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{hint ?? t('placeholder')}</span>
          </>
        )}
      </button>

      {open && (
        <SignatureModal
          title={label}
          onClose={() => setOpen(false)}
          onSaved={(url) => {
            onChange(url);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
