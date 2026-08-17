import { describe, expect, it } from 'vitest';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_CLASS } from './width';

describe('sidebar width constants', () => {
  it('the Tailwind class mirrors the numeric width used by the motion.aside', () => {
    expect(SIDEBAR_WIDTH_CLASS).toBe(`w-[${SIDEBAR_WIDTH}px]`);
  });
});
