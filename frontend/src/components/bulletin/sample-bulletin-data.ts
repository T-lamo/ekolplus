import type { BulletinRenderData } from './BulletinCanvas';

// Illustrative-only fixture — used by the template editor's live preview
// AND by the server-side template PDF export (app/print/bulletin-template-preview)
// so a template author can see/export a realistic-looking bulletin without
// needing real class data. The Viewer builds the real BulletinRenderData
// shape from actual grades/appreciations for whichever student is being
// viewed — this fixture never reaches a real bulletin.
export const SAMPLE_BULLETIN_DATA: BulletinRenderData = {
  schoolName: 'École LesÉtoiles',
  schoolLogoUrl: null,
  directorSignatureUrl: null,
  period: 'Trimestre 2',
  academicYear: '2024–2025',
  studentName: 'Jean-Pierre M.',
  className: '3ème A',
  classSize: 28,
  studentNumber: 'N° 2024-0047',
  subjects: [
    {
      name: 'Mathématiques',
      coefficient: 4,
      average: 15.67,
      classAverage: 12.8,
      min: 6.5,
      max: 19.0,
      appreciation: 'Très bon trimestre',
    },
    {
      name: 'Français',
      coefficient: 4,
      average: 12.0,
      classAverage: 11.4,
      min: 5.0,
      max: 17.5,
      appreciation: 'Peut mieux faire',
    },
    {
      name: 'Sciences',
      coefficient: 3,
      average: 18.0,
      classAverage: 13.2,
      min: 8.0,
      max: 20.0,
      appreciation: 'Excellent travail',
    },
    {
      name: 'Anglais',
      coefficient: 3,
      average: 10.0,
      classAverage: 12.1,
      min: 4.5,
      max: 18.0,
      appreciation: 'Efforts nécessaires',
    },
    {
      name: 'Histoire-Géo',
      coefficient: 2,
      average: 16.5,
      classAverage: 11.9,
      min: 7.0,
      max: 19.5,
      appreciation: 'Très bonne maîtrise',
    },
  ],
  overallAverage: 14.38,
  classAverage: 12.5,
  rank: 4,
  rankedCount: 28,
  generalAppreciation:
    "Élève sérieux et investi qui fait preuve d'une bonne volonté dans l'ensemble des matières. Les résultats en sciences sont excellents et encourageants. Des efforts supplémentaires sont attendus en anglais pour consolider les acquis. Continuez ainsi !",
  absencesDays: 3,
  retards: 1,
};
