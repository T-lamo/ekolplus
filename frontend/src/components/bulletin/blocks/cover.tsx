import { LayoutTemplate } from 'lucide-react';
import type {
  CoverBlock,
  CoverField,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

const FIELD_LABEL: Record<CoverField, string> = {
  lastName: 'Nom',
  firstName: 'Prénom',
  fullName: 'Elève',
  className: 'Classe',
  studentNumber: 'Code',
  nisu: 'NISU',
  academicYear: 'Année Académique',
};

function fieldValue(field: CoverField, data: BulletinRenderData): string {
  switch (field) {
    case 'lastName':
      return data.lastName;
    case 'firstName':
      return data.firstName;
    case 'fullName':
      return data.studentName;
    case 'className':
      return data.className;
    case 'studentNumber':
      return data.studentNumber;
    case 'nisu':
      return data.nisu ?? '';
    case 'academicYear':
      return data.academicYearLabel;
  }
}

export function render({
  block,
  config,
  data,
}: {
  block: CoverBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const title = block.titlePattern.replace('{term}', data.termLabel);
  const upper = block.uppercase ?? true;
  const caseClass = upper ? 'uppercase' : '';
  const logo = block.showLogo ? (
    data.schoolLogoUrl ? (
      <img
        src={data.schoolLogoUrl}
        alt={data.schoolName}
        className="h-16 w-16 rounded-md object-contain"
      />
    ) : (
      <div
        className="flex h-16 w-16 items-center justify-center rounded-md border-[1.5px] border-dashed"
        style={{
          borderColor: `${config.primaryColor}80`,
          background: `${config.primaryColor}0d`,
        }}
      >
        <LayoutTemplate size={22} style={{ color: `${config.primaryColor}80` }} />
      </div>
    )
  ) : null;
  const logoPosition = block.logoPosition ?? 'top';
  const content = (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {logoPosition === 'top' && logo}
      <div
        className={`rounded-md border-2 px-4 py-2 font-black ${caseClass}`}
        style={{
          borderColor: config.primaryColor,
          color: config.primaryColor,
          fontSize: config.typography.schoolName,
        }}
      >
        {data.schoolName}
      </div>
      {data.schoolAddress && (
        <div className="text-2xs text-muted-foreground">{data.schoolAddress}</div>
      )}
      {data.schoolPhone && <div className="text-2xs text-muted-foreground">{data.schoolPhone}</div>}
      <div className={`text-xs font-semibold tracking-wide text-[#1a1a2e] ${caseClass}`}>
        {block.sectionLabel}
      </div>
      <div
        className={`font-black ${caseClass}`}
        style={{ fontSize: config.typography.title, color: config.primaryColor }}
      >
        {title}
      </div>
      {logoPosition === 'belowTitle' && logo}
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2 text-left">
        {block.fields.map((field) => (
          <div key={field} className="flex items-baseline gap-2 border-b border-[#c9c4dd] pb-1">
            <span className="shrink-0 text-2xs font-semibold text-muted-foreground">
              {block.fieldLabels?.[field] ?? FIELD_LABEL[field]} :
            </span>
            <span className="text-xs text-[#1a1a2e]">{fieldValue(field, data) || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
  if (!block.framed) return content;
  const rounded = block.frameStyle === 'rounded';
  return (
    <div
      className={`h-full border-2 ${rounded ? 'border-solid' : block.frameStyle === 'solid' ? 'rounded-2xl border-solid' : 'rounded-2xl border-dashed'}`}
      style={{ borderColor: config.primaryColor, ...(rounded ? { borderRadius: 40 } : {}) }}
    >
      {content}
    </div>
  );
}
