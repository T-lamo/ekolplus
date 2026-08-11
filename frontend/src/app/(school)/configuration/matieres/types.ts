export interface SubjectData {
  id: string;
  name: string;
  code: string | null;
  domain: string | null;
  isActive: boolean;
  classes: { id: string; name: string }[];
  teacherNames: string[];
  coefficients: number[];
}
