// One-shot: recolor the raw Storyset SVGs in public/illustrations/ to the
// landing page's Electric Blue accent and write kebab-case copies next to
// them. The originals (downloaded from storyset.com with per-file accent
// colors — coral/green/purple/yellow) are left untouched and stay
// untracked; components reference only the kebab-case outputs.
//
// Only the file's Storyset ACCENT color is swapped — skin tones and the
// neutral grays every set shares are deliberately left alone (that's how
// Storyset's own online recolorer behaves).
//
// Run from frontend/: node scripts/recolor-illustrations.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'public', 'illustrations');
const TARGET = '#2563EB'; // landing --color-primary (Electric Blue)

// source file → { out: kebab-case output name, accent: hex to replace }
const FILES = [
  { src: 'Thesis-pana.svg', out: 'thesis.svg', accent: '#ff725e' },
  { src: 'Printing invoices-bro.svg', out: 'printing-invoices.svg', accent: '#92e3a9' },
  { src: 'Exams-bro.svg', out: 'exams.svg', accent: '#92e3a9' },
  { src: 'Course app-pana.svg', out: 'course-app-pana.svg', accent: '#ff725e' },
  { src: 'Confirmed attendance-pana.svg', out: 'confirmed-attendance.svg', accent: '#ff725e' },
  { src: 'Data analysis-bro.svg', out: 'data-analysis.svg', accent: '#92e3a9' },
  { src: 'Call center-cuate.svg', out: 'call-center.svg', accent: '#ffc727' },
  { src: 'Course app-bro.svg', out: 'course-app.svg', accent: '#92e3a9' },
  { src: 'Certification-pana.svg', out: 'certification.svg', accent: '#ff725e' },
  { src: 'Learning-pana.svg', out: 'learning.svg', accent: '#ff725e' },
  { src: 'Yes or no-amico.svg', out: 'yes-or-no.svg', accent: '#ba68c8' },
];

for (const { src, out, accent } of FILES) {
  const raw = readFileSync(join(DIR, src), 'utf8');
  const re = new RegExp(accent, 'gi');
  const count = (raw.match(re) ?? []).length;
  if (count === 0) {
    console.error(`✗ ${src}: accent ${accent} not found — mapping is stale, aborting`);
    process.exit(1);
  }
  writeFileSync(join(DIR, out), raw.replace(re, TARGET));
  console.log(`✓ ${out} (${count} fills ${accent} → ${TARGET})`);
}
