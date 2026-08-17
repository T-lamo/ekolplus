import { describe, expect, it } from 'vitest';
import {
  decisionValue,
  deriveOutcome,
  entryForDecision,
  summarizeOutcomes,
  toClassValue,
} from './student-decisions';
import type { ClassMappingEntry, StudentExceptionEntry } from './types';

const classes = [
  { id: 'c6a', name: '6ème A', level: '6ème', studentCount: 2 },
  { id: 'c6b', name: '6ème B', level: '6ème', studentCount: 1 },
  { id: 'c5a', name: '5ème A', level: '5ème', studentCount: 1 },
  { id: 'c3a', name: '3ème A', level: '3ème', studentCount: 1 },
];
const byId = new Map(classes.map((c) => [c.id, c]));
const s = (id: string, classId: string) => ({
  id,
  firstName: 'A',
  lastName: 'B',
  classId,
  enrolledAt: new Date(0),
});

describe('decisionValue / entryForDecision (select value ⇄ studentExceptions entry)', () => {
  const student = s('s1', 'c6a');
  it('no entry ⇄ "passe"', () => {
    expect(decisionValue(undefined, student)).toBe('passe');
    expect(decisionValue({}, student)).toBe('passe');
    expect(entryForDecision('passe', student)).toBeNull();
  });
  it('own class as template ⇄ "redouble"', () => {
    expect(decisionValue({ destClassId: 'c6a' }, student)).toBe('redouble');
    expect(entryForDecision('redouble', student)).toEqual({ destClassId: 'c6a' });
  });
  it('skip ⇄ "quitte"', () => {
    expect(decisionValue({ skip: true }, student)).toBe('quitte');
    expect(entryForDecision('quitte', student)).toEqual({ skip: true });
  });
  it('another class ⇄ "class:<id>"', () => {
    expect(toClassValue('c5a')).toBe('class:c5a');
    expect(decisionValue({ destClassId: 'c5a' }, student)).toBe('class:c5a');
    expect(entryForDecision('class:c5a', student)).toEqual({ destClassId: 'c5a' });
  });
  it('unknown value → treated as "passe" (no entry)', () => {
    expect(entryForDecision('', student)).toBeNull();
    expect(entryForDecision('garbage', student)).toBeNull();
  });
});

describe('deriveOutcome (exception > class mapping > unenrolled, same precedence as executeRollover)', () => {
  const mapping: Record<string, ClassMappingEntry> = {
    c6a: { destClassId: 'c5a' }, // promotion
    c6b: { destClassId: 'c6b' }, // collective repeat year
    c5a: { unenroll: true }, // fin de cursus
    // c3a: undecided
  };
  const none: Record<string, StudentExceptionEntry> = {};

  it('follows the class mapping by default → promu with the destination name', () => {
    expect(deriveOutcome(s('s1', 'c6a'), mapping, none, byId)).toEqual({
      kind: 'passe',
      status: 'promu',
      destClassId: 'c5a',
      destClassName: '5ème A',
    });
  });
  it('a class mapped onto its own level is a (collective) repeat year', () => {
    expect(deriveOutcome(s('s2', 'c6b'), mapping, none, byId)).toEqual({
      kind: 'passe',
      status: 'redoublant',
      destClassId: 'c6b',
      destClassName: '6ème B',
    });
  });
  it('class marked "Fin de cursus" or undecided → non réinscrit', () => {
    expect(deriveOutcome(s('s3', 'c5a'), mapping, none, byId)).toEqual({
      kind: 'passe',
      status: 'nonreinscrit',
    });
    expect(deriveOutcome(s('s4', 'c3a'), mapping, none, byId)).toEqual({
      kind: 'passe',
      status: 'nonreinscrit',
    });
  });
  it('per-student "redouble" overrides the class promotion', () => {
    expect(deriveOutcome(s('s1', 'c6a'), mapping, { s1: { destClassId: 'c6a' } }, byId)).toEqual({
      kind: 'redouble',
      status: 'redoublant',
      destClassId: 'c6a',
      destClassName: '6ème A',
    });
  });
  it('per-student other class: same level → redoublant, higher level → promu', () => {
    expect(deriveOutcome(s('s1', 'c6a'), mapping, { s1: { destClassId: 'c6b' } }, byId)).toEqual({
      kind: 'autre',
      status: 'redoublant',
      destClassId: 'c6b',
      destClassName: '6ème B',
    });
    expect(deriveOutcome(s('s3', 'c5a'), mapping, { s3: { destClassId: 'c3a' } }, byId)).toEqual({
      kind: 'autre',
      status: 'promu',
      destClassId: 'c3a',
      destClassName: '3ème A',
    });
  });
  it('per-student skip → non réinscrit even when the class is promoted', () => {
    expect(deriveOutcome(s('s1', 'c6a'), mapping, { s1: { skip: true } }, byId)).toEqual({
      kind: 'quitte',
      status: 'nonreinscrit',
    });
  });
  it('legacy isNew/newClass mapping → promu with the new class name (repeat when same level)', () => {
    const legacy: Record<string, ClassMappingEntry> = {
      c6a: { isNew: true, newClass: { name: 'Nouvelle 5ème', level: '5ème' } },
      c6b: { isNew: true, newClass: { name: 'Nouvelle 6ème', level: '6ème' } },
    };
    expect(deriveOutcome(s('s1', 'c6a'), legacy, none, byId)).toEqual({
      kind: 'passe',
      status: 'promu',
      destClassName: 'Nouvelle 5ème',
    });
    expect(deriveOutcome(s('s2', 'c6b'), legacy, none, byId).status).toBe('redoublant');
  });
  it('destination class unknown to the list → promu with the raw id (draft older than the class list)', () => {
    expect(deriveOutcome(s('s1', 'c6a'), mapping, { s1: { destClassId: 'ghost' } }, byId)).toEqual({
      kind: 'autre',
      status: 'promu',
      destClassId: 'ghost',
      destClassName: 'ghost',
    });
  });
});

describe('summarizeOutcomes', () => {
  it('counts promoted / repeating / unenrolled', () => {
    expect(
      summarizeOutcomes([
        { status: 'promu' },
        { status: 'promu' },
        { status: 'redoublant' },
        { status: 'nonreinscrit' },
      ]),
    ).toEqual({ promoted: 2, repeating: 1, unenrolled: 1 });
  });
});
