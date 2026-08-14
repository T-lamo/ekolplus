'use client';

import { useEffect } from 'react';

/**
 * Drives the landing's scroll-reveal. On mount it marks <html> as `reveal-ready`
 * (which is what actually hides `.reveal-up` elements — see globals.css), then
 * observes them and adds `.active` as they enter the viewport. Because the
 * hidden state is gated on this JS-added class, the page stays fully visible
 * if JS is disabled or fails. Renders nothing.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('reveal-ready');

    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal-up'));

    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('active'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
