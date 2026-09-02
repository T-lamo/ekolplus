'use client';

import { useRef, type MouseEvent } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { CalendarCheck2, FileText, ShieldCheck, WalletCards, type LucideIcon } from 'lucide-react';
import { CtaLink } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';

/**
 * Banani `#hero` — dark navy→blue gradient, centered copy column, 2 blurred
 * orbs, 4 floating mock-UI stat cards and 2 pill side-notes arranged around
 * the copy from `lg:` up (below that the cards stack in a flat 2-col grid
 * under the CTAs — the absolute composition needs the 1280px canvas).
 * All motion is authored here (the export is static): entrance stagger,
 * desynchronized float loops on the cards, and a soft scroll parallax on
 * cards + orbs, all disabled when the OS asks for reduced motion.
 */

const CHIPS = ['Présences & émargement', 'Facturation & reçus', 'Bulletins & relevés'];

interface FloatCardSpec {
  id: string;
  /** Banani's static rest rotation — lives in the motion style, never a
   * competing CSS class (framer-motion's inline transform would silently
   * override it once the float loop starts). */
  rotate: number;
  /** Absolute position classes, applied from lg: only. */
  position: string;
  width: string;
  floatDelay: number;
  /** Cursor-parallax factor (px of drift per normalized mouse unit) —
   * varied per card so they separate into depth planes. */
  depth: number;
  icon?: LucideIcon;
  label: string;
  sub?: string;
  value?: string;
  text?: string;
  miniLines?: boolean;
}

const FLOAT_CARDS: FloatCardSpec[] = [
  {
    id: 'left-top',
    rotate: -11,
    position: 'lg:left-[min(-124px,470px-50vw)] lg:top-[28px]',
    width: 'lg:w-[162px]',
    floatDelay: 0,
    depth: -22,
    label: 'Dossiers élèves',
    value: '3k+',
    text: 'Profils, inscriptions et pièces académiques réunis au même endroit.',
    miniLines: true,
  },
  {
    id: 'left-bottom',
    rotate: 10,
    position: 'lg:left-[min(-88px,500px-50vw)] lg:bottom-[38px]',
    width: 'lg:w-[142px]',
    floatDelay: 0.9,
    depth: -14,
    icon: FileText,
    label: 'Bulletins',
    sub: 'Édition rapide',
  },
  {
    id: 'right-top',
    rotate: 10,
    position: 'lg:right-[min(-126px,466px-50vw)] lg:top-[42px]',
    width: 'lg:w-[164px]',
    floatDelay: 1.6,
    depth: 18,
    icon: CalendarCheck2,
    label: 'Présences',
    sub: '97% confirmées',
  },
  {
    id: 'right-bottom',
    rotate: -9,
    position: 'lg:right-[min(-96px,494px-50vw)] lg:bottom-[34px]',
    width: 'lg:w-[146px]',
    floatDelay: 0.5,
    depth: 26,
    icon: WalletCards,
    label: 'Recouvrement',
    sub: '84% ce mois',
  },
];

function FloatCard({
  spec,
  parallaxY,
  mouseX,
  mouseY,
  reduceMotion,
}: {
  spec: FloatCardSpec;
  parallaxY: MotionValue<number>;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const Icon = spec.icon;
  // Cursor parallax: each card drifts by its own depth factor, summed with
  // the scroll parallax on the y axis so the two effects compose.
  const x = useTransform(mouseX, (v) => v * spec.depth);
  const y = useTransform([parallaxY, mouseY], (latest) => {
    const [scrollOffset = 0, mouse = 0] = latest as number[];
    return scrollOffset + mouse * spec.depth;
  });
  return (
    <motion.div
      variants={fadeUp}
      {...(reduceMotion ? {} : { style: { x, y } })}
      className={`lg:absolute ${spec.position} ${spec.width}`}
    >
      <motion.div
        animate={reduceMotion ? { rotate: 0 } : { y: [0, -10, 0] }}
        {...(reduceMotion
          ? {}
          : {
              transition: {
                duration: 5.5,
                delay: spec.floatDelay,
                repeat: Infinity,
                ease: 'easeInOut' as const,
              },
            })}
        style={{ rotate: reduceMotion ? 0 : spec.rotate }}
        className={`rounded-[18px] border border-[rgba(220,228,240,0.88)] bg-white/[0.96] shadow-[0_20px_44px_rgba(15,23,42,0.18)] backdrop-blur-[10px] ${
          spec.value ? 'p-[15px]' : 'px-3 py-2.5'
        }`}
      >
        {spec.value ? (
          <>
            <div className="text-[11px] whitespace-nowrap text-muted-foreground">{spec.label}</div>
            <div className="mt-1.5 text-2xl leading-none font-extrabold tracking-[-0.8px] text-foreground">
              {spec.value}
            </div>
            {spec.text && (
              <div className="mt-2 text-xs leading-[1.5] text-muted-foreground">{spec.text}</div>
            )}
            {spec.miniLines && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                <div className="h-1.5 w-full rounded-full bg-secondary" />
                <div className="h-1.5 w-[74%] rounded-full bg-secondary" />
                <div className="h-1.5 w-[58%] rounded-full bg-secondary" />
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-secondary">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] whitespace-nowrap text-muted-foreground">
                {spec.label}
              </div>
              {spec.sub && (
                <div className="text-xs font-semibold whitespace-nowrap text-foreground">
                  {spec.sub}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function HeroSection() {
  const reduceMotion = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  // Soft parallax: cards drift up slightly faster than the page, orbs slower.
  const cardsY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const orbsY = useTransform(scrollYProgress, [0, 1], [0, 50]);

  // Cursor parallax: normalized (-1..1) mouse position over the section,
  // spring-smoothed so the cards glide instead of twitching; plus a big
  // soft glow that follows the cursor across the gradient.
  const mouseXRaw = useMotionValue(0);
  const mouseYRaw = useMotionValue(0);
  const mouseX = useSpring(mouseXRaw, { stiffness: 60, damping: 18, mass: 0.8 });
  const mouseY = useSpring(mouseYRaw, { stiffness: 60, damping: 18, mass: 0.8 });
  const glowX = useMotionValue(-9999);
  const glowY = useMotionValue(-9999);
  const glow = useMotionTemplate`radial-gradient(520px circle at ${glowX}px ${glowY}px, rgba(96,165,250,0.16), transparent 70%)`;
  const orbAX = useTransform(mouseX, (v) => v * -46);
  const orbBX = useTransform(mouseX, (v) => v * 38);

  function onHeroMouseMove(e: MouseEvent<HTMLElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseXRaw.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    mouseYRaw.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
    glowX.set(e.clientX - rect.left);
    glowY.set(e.clientY - rect.top);
  }

  return (
    <section
      ref={sectionRef}
      id="hero"
      onMouseMove={onHeroMouseMove}
      className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#0f172a_54%,#2563eb_100%)] pt-[120px] pb-16 sm:pt-[136px] lg:pt-[150px] lg:pb-[88px]"
    >
      {/* Banani #hero::before — 4 soft radial spots. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_84%_16%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_50%_78%,rgba(37,99,235,0.20),transparent_28%),radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.05),transparent_26%)]"
      />
      {/* Cursor-tracked glow (desktop only — touch has no cursor). */}
      <motion.div
        aria-hidden="true"
        style={{ background: glow }}
        className="pointer-events-none absolute inset-0 hidden lg:block"
      />

      <div className="relative z-[2] mx-auto w-full max-w-[1280px] px-6 lg:px-12">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer(0.09)}
          className="relative mx-auto flex w-full max-w-[860px] flex-col items-center justify-center text-center lg:min-h-[560px]"
        >
          {/* Ambient orbs — behind the copy, parallax against scroll. */}
          <motion.div
            aria-hidden="true"
            {...(reduceMotion ? {} : { style: { y: orbsY, x: orbAX } })}
            className="pointer-events-none absolute top-[96px] -left-[180px] hidden h-[210px] w-[210px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),rgba(255,255,255,0.03))] blur-lg lg:block"
          />
          <motion.div
            aria-hidden="true"
            {...(reduceMotion ? {} : { style: { y: orbsY, x: orbBX } })}
            className="pointer-events-none absolute -right-[190px] bottom-[26px] hidden h-[250px] w-[250px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.34),rgba(59,130,246,0.08))] blur-lg lg:block"
          />

          {/* The 4 floating cards — absolute composition from lg: only. */}
          <div className="contents">
            {FLOAT_CARDS.map((spec) => (
              <div key={spec.id} className="hidden lg:contents">
                <FloatCard
                  spec={spec}
                  parallaxY={cardsY}
                  mouseX={mouseX}
                  mouseY={mouseY}
                  reduceMotion={reduceMotion}
                />
              </div>
            ))}
          </div>

          {/* Side notes — desktop only. */}
          <motion.div
            variants={fadeUp}
            className="absolute top-[222px] -left-[42px] hidden items-center gap-2 rounded-full border border-white/[0.14] bg-white/10 px-[13px] py-[9px] text-xs whitespace-nowrap text-white/[0.82] shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-md lg:inline-flex"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/[0.88]" aria-hidden="true" />
            Notes & relevés centralisés
          </motion.div>
          <motion.div
            variants={fadeUp}
            className="absolute top-[244px] -right-[36px] hidden items-center gap-2 rounded-full border border-white/[0.14] bg-white/10 px-[13px] py-[9px] text-xs whitespace-nowrap text-white/[0.82] shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-md lg:inline-flex"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/[0.88]" aria-hidden="true" />
            Suivi clair pour la direction
          </motion.div>

          <motion.div variants={fadeUp}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white/[0.92]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              SIS premium pour établissements exigeants
            </div>
          </motion.div>

          <h1 className="mt-[18px] max-w-[760px] text-[38px] leading-[1.02] font-extrabold tracking-[-1.2px] text-white sm:text-[52px] lg:text-[64px] lg:leading-[0.98] lg:tracking-[-2px]">
            <motion.span variants={fadeUp} className="block">
              Le dossier de scolarité
            </motion.span>
            <motion.span variants={fadeUp} className="block">
              de chaque élève,
            </motion.span>
            <motion.span variants={fadeUp} className="block">
              du premier jour au diplôme.
            </motion.span>
          </h1>

          <motion.p
            variants={fadeUp}
            className="mt-[22px] max-w-[720px] text-[15px] leading-[1.78] text-white/[0.78]"
          >
            SchoolGesti centralise inscriptions, notes, bulletins, présences, emplois du temps et
            frais de scolarité dans une expérience spectaculaire, claire et pensée pour la
            direction, les enseignants et les familles.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row"
          >
            <CtaLink href="#contact" className="w-full sm:w-auto">
              Demander une démo
            </CtaLink>
            <CtaLink href="#pricing" variant="light" className="w-full sm:w-auto">
              Voir les tarifs
            </CtaLink>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-[18px] flex flex-wrap justify-center gap-2.5">
            {CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-[7px] text-xs whitespace-nowrap text-white/[0.76]"
              >
                {chip}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Below lg the floating cards stack in a flat 2-col grid. */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.08)}
          className="mx-auto mt-10 grid max-w-[560px] grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden"
        >
          {FLOAT_CARDS.map((spec) => {
            const Icon = spec.icon;
            return (
              <motion.div
                key={spec.id}
                variants={fadeUp}
                className="rounded-[18px] border border-[rgba(220,228,240,0.88)] bg-white/[0.96] p-[15px] shadow-[0_20px_44px_rgba(15,23,42,0.18)]"
              >
                {spec.value ? (
                  <>
                    <div className="text-[11px] text-muted-foreground">{spec.label}</div>
                    <div className="mt-1.5 text-2xl leading-none font-extrabold tracking-[-0.8px] text-foreground">
                      {spec.value}
                    </div>
                    {spec.text && (
                      <div className="mt-2 text-xs leading-[1.5] text-muted-foreground">
                        {spec.text}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2.5">
                    {Icon && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-secondary">
                        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">{spec.label}</div>
                      {spec.sub && (
                        <div className="text-xs font-semibold text-foreground">{spec.sub}</div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
