import { describe, expect, it } from 'vitest';
import { pageItems } from './Pager';

// User rule (2026-08-17): more than 3 pages → first page, "…", last page
// (with the current page's neighbourhood), never the full list.
describe('pageItems (compact pagination window)', () => {
  it('up to 3 pages → all numbers', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
  });
  it('4+ pages → 1 … current±1 … N', () => {
    expect(pageItems(1, 4)).toEqual([1, 2, '…', 4]);
    expect(pageItems(1, 10)).toEqual([1, 2, '…', 10]);
    expect(pageItems(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(pageItems(10, 10)).toEqual([1, '…', 9, 10]);
  });
  it('no gap marker when the window already covers every page', () => {
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4]);
  });
});
