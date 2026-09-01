// Adaptateur pour les suites de routes /api/school/* écrites avant le RBAC
// par grants (spec 2026-09-01-permission-manager). Elles moquent déjà
// resolveMySchool pour piloter le rôle d'organisation du caller ; brancher
// requireSchoolPermission dessus leur rend exactement la sémantique d'avant
// (résolution d'école seule, sans vérification de grant), de sorte qu'elles
// continuent de tester leur propre sujet (gardes hasMinRole, validation,
// isolation multi-écoles).
//
// La vérification des grants elle-même a sa famille témoin dédiée :
// src/app/api/school/students/route.test.ts, qui fait tourner la vraie
// logique de school-permissions.ts.
import { NextResponse } from 'next/server';
import type { MySchool } from '@/lib/server/school';
import type { SchoolPermissionResult } from '@/lib/server/school-permissions';

export function passThroughSchoolPermission(
  resolveMySchool: (userId: string) => Promise<MySchool | null>,
) {
  return async (
    userId: string,
    _module: unknown,
    _action: unknown,
    requestId: string,
  ): Promise<SchoolPermissionResult> => {
    const mySchool = await resolveMySchool(userId);
    if (!mySchool) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
          { status: 404, headers: { 'x-request-id': requestId } },
        ),
      };
    }
    return { ok: true, mySchool };
  };
}
