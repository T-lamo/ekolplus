// @ts-check
// Serwist "configurator mode" — bundler-agnostic. Unlike the classic
// `withSerwist`-wraps-`next.config.ts` integration (webpack-only, does not
// work with Turbopack — confirmed by running `pnpm build` in this repo: the
// plugin never ran and public/sw.js was never generated), this mode drives
// service-worker generation as a separate CLI step (`serwist build`, run
// after `next build` — see package.json), so it works with this repo's
// Turbopack build (`▲ Next.js 16.3.0 (Turbopack)`) with zero --webpack flag
// anywhere. Docs: https://serwist.pages.dev/docs/next/config
import { serwist } from '@serwist/next/config';

export default serwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
});
