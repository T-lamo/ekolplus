'use client';

import Image from 'next/image';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import { Calendar, PlayCircle, Sparkles } from 'lucide-react';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { CtaLink } from './landing-ui';
import { fadeUp, staggerContainer } from './landing-motion';

const DASHBOARD_MOCKUP_IMG =
  'https://storage.googleapis.com/banani-generated-images/generated-images/8d83d9fb-d364-491e-84a5-a8cfea39539e.jpg';

// Base perspective pose (Banani's static `rotateX(10deg) rotateY(-14deg)
// rotateZ(-2deg)`) — desktop only. Mouse movement adds a further ±TILT_RANGE
// of rotateX/Y around this rest pose; leaving the card (or moving to
// mobile, where the design is intentionally flat) eases back to it — or to
// 0/0/0 below `lg` — via useSpring rather than snapping.
const BASE_ROTATE_X = 10;
const BASE_ROTATE_Y = -14;
const BASE_ROTATE_Z = -2;
const TILT_RANGE = 10;

const TAGS = [
  {
    title: 'Une seule plateforme',
    text: 'Pilotez inscriptions, paiements, présences, notes et bulletins depuis une seule plateforme pensée pour les établissements qui veulent gagner en rigueur.',
  },
  {
    title: 'Pensé pour la direction',
    text: 'Offrez à la direction, au secrétariat et aux enseignants un outil élégant pour suivre l’activité scolaire sans dispersion ni double saisie.',
  },
  {
    title: 'Simple et rassurant',
    text: 'Une interface claire pour toute l’équipe — direction, secrétariat, enseignants et familles retrouvent l’information dont ils ont besoin, pensée pour les établissements haïtiens.',
  },
];

/** `.hero-float-card` shared shell — glass card with a border + blurred
 * backdrop, used by the notebook and the 3 tag cards. */
function FloatCard({
  children,
  className,
  floatDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  floatDelay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`hero-float-card rounded-[24px_18px_24px_20px] border border-border bg-[rgba(29,22,46,0.44)] p-3.5 shadow-[0_22px_56px_rgba(0,0,0,0.24)] backdrop-blur-xl ${className ?? ''}`}
      animate={reduceMotion ? { y: 0 } : { y: [0, -10, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
    >
      {children}
    </motion.div>
  );
}

/** Dashboard screenshot mockup — desktop pose is Banani's static 3D
 * perspective tilt; mouse movement adds a subtle interactive parallax on
 * top of it (the hero's headline cursor "wow" moment), eased with a
 * spring rather than following the pointer 1:1. Mobile stays perfectly
 * flat by design (touch has no hover), so this resets to 0/0/0 below `lg`. */
function HeroMockup() {
  const reduceMotion = useReducedMotion();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const rotateZ = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 200, damping: 22, mass: 0.5 });
  const springY = useSpring(rotateY, { stiffness: 200, damping: 22, mass: 0.5 });
  const springZ = useSpring(rotateZ, { stiffness: 200, damping: 22, mass: 0.5 });
  const transform = useMotionTemplate`perspective(1600px) rotateX(${springX}deg) rotateY(${springY}deg) rotateZ(${springZ}deg)`;

  useEffect(() => {
    if (isDesktop) {
      rotateX.set(BASE_ROTATE_X);
      rotateY.set(BASE_ROTATE_Y);
      rotateZ.set(BASE_ROTATE_Z);
    } else {
      rotateX.set(0);
      rotateY.set(0);
      rotateZ.set(0);
    }
  }, [isDesktop, rotateX, rotateY, rotateZ]);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!isDesktop || reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(BASE_ROTATE_X - py * TILT_RANGE);
    rotateY.set(BASE_ROTATE_Y + px * TILT_RANGE);
  }

  function handleMouseLeave() {
    if (!isDesktop) return;
    rotateX.set(BASE_ROTATE_X);
    rotateY.set(BASE_ROTATE_Y);
  }

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform }}
      className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.35)] lg:absolute lg:top-[30px] lg:right-[140px] lg:left-[220px] lg:mx-0 lg:h-[490px] lg:w-auto lg:max-w-none lg:rounded-[34px_54px_28px_42px] lg:border-white/10 lg:bg-[linear-gradient(145deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] lg:p-[18px] lg:shadow-[0_40px_110px_rgba(0,0,0,0.40),0_0_100px_rgba(199,167,255,0.10)]"
    >
      <div className="relative aspect-video w-full overflow-hidden lg:h-full lg:rounded-[26px_44px_22px_34px] lg:border lg:border-white/[0.08] lg:bg-white/5">
        <Image
          src={DASHBOARD_MOCKUP_IMG}
          alt="Tableau de bord SchoolGesti sur un écran de verre incurvé, thème violet lavande"
          fill
          sizes="(min-width: 1024px) 640px, 90vw"
          className="object-cover"
          priority
          unoptimized
        />
      </div>
    </motion.div>
  );
}

export function HeroSection() {
  const reduceMotion = useReducedMotion();
  return (
    <section
      id="hero"
      className="relative overflow-hidden px-4 pt-[104px] pb-12 sm:px-6 sm:pt-32 sm:pb-16 lg:px-10 lg:pt-[132px]"
    >
      {/* Ambient blurred glows — decorative, clipped by the section's
          overflow-hidden, drifting slowly and out of sync with each other. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute top-[140px] -left-[90px] h-[460px] w-[460px] bg-[radial-gradient(circle,rgba(199,167,255,0.24)_0%,rgba(199,167,255,0)_70%)] blur-2xl"
        animate={
          reduceMotion
            ? { x: 0, y: 0, scale: 1 }
            : { x: [0, 40, -10, 0], y: [0, -30, 20, 0], scale: [1, 1.15, 0.95, 1] }
        }
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute top-10 -right-[120px] h-[520px] w-[520px] bg-[radial-gradient(circle,rgba(231,216,255,0.18)_0%,rgba(231,216,255,0)_72%)] blur-2xl"
        animate={
          reduceMotion
            ? { x: 0, y: 0, scale: 1 }
            : { x: [0, -50, 20, 0], y: [0, 30, -20, 0], scale: [1, 0.9, 1.1, 1] }
        }
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[120px] left-1/2 h-[280px] w-[980px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(199,167,255,0.12)_0%,rgba(199,167,255,0)_70%)] blur-2xl"
        animate={
          reduceMotion
            ? { x: '-50%', scale: 1 }
            : { x: ['-50%', '-45%', '-55%', '-50%'], scale: [1, 1.1, 1, 1] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer(0.12)}
        className="relative z-[2] mx-auto max-w-[1280px]"
      >
        <div className="mx-auto max-w-[760px] text-center">
          <motion.div variants={fadeUp} className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.06] px-3.5 py-2 text-[11px] font-bold tracking-wide whitespace-nowrap text-accent">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              SIS premium pour établissements exigeants
            </span>
          </motion.div>

          <motion.h1
            variants={staggerContainer(0.1)}
            className="mt-6 text-[36px] leading-[1.05] font-extrabold tracking-[-0.02em] text-foreground sm:text-[52px] lg:text-[72px] lg:tracking-[-3px]"
          >
            <motion.span variants={fadeUp} className="block">
              Le dossier de scolarité
            </motion.span>
            <motion.span variants={fadeUp} className="block">
              de chaque élève,
            </motion.span>
            <motion.span
              variants={fadeUp}
              className="block text-accent [text-shadow:0_0_26px_rgba(231,216,255,0.18)]"
            >
              du premier jour au diplôme.
            </motion.span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-[660px] text-[15px] text-secondary-foreground sm:text-base"
          >
            SchoolGesti centralise inscriptions, notes, bulletins, présences, emplois du temps et
            frais de scolarité dans une expérience spectaculaire, claire et pensée pour la
            direction, les enseignants et les familles.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <CtaLink href="#contact-demo" className="w-full py-3.5 sm:w-auto">
              <Calendar className="h-[15px] w-[15px]" aria-hidden="true" />
              Demander une démo
            </CtaLink>
            <CtaLink href="#contact-demo" variant="secondary" className="w-full py-3.5 sm:w-auto">
              <PlayCircle className="h-[15px] w-[15px]" aria-hidden="true" />
              Voir la démo
            </CtaLink>
          </motion.div>
        </div>

        {/* Hero scene — stacked cards on mobile/tablet, Banani's absolute
            floating composition from lg (1024px) up. */}
        <motion.div
          variants={fadeUp}
          className="relative mt-12 flex flex-col gap-5 sm:mt-16 lg:mt-[72px] lg:block lg:h-[640px] lg:gap-0"
        >
          <FloatCard
            floatDelay={0}
            className="mx-auto w-full max-w-[280px] lg:absolute lg:top-[66px] lg:left-6 lg:mx-0 lg:w-[230px] lg:max-w-none lg:-rotate-[8deg]"
          >
            <div className="relative overflow-hidden rounded-[18px_28px_20px_26px] border border-white/[0.08] bg-[linear-gradient(160deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02)),radial-gradient(circle_at_30%_20%,rgba(231,216,255,0.18),transparent_40%),linear-gradient(160deg,#33224c_0%,#211633_100%)] p-[22px]">
              <Image
                src="/logos/schoolgesti-lockup-blanc.svg"
                alt="Schoolgesti"
                width={92}
                height={25}
                className="h-5 w-auto"
              />
              <p className="mt-[26px] text-[22px] leading-[1.35] tracking-[-0.5px] text-accent">
                La gestion scolaire
                <br />
                qui inspire confiance,
                <br />
                du bureau à la classe.
              </p>
              <p className="mt-4 text-xs text-secondary-foreground">
                Un SIS qui donne de la présence à votre établissement.
              </p>
              <div className="mt-3.5 inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-3.5 py-2.5 text-xs font-bold text-foreground">
                <motion.span
                  className="h-[18px] w-[18px] rounded-full bg-[radial-gradient(circle_at_30%_30%,#f8e2ff,var(--color-primary))]"
                  animate={
                    reduceMotion
                      ? { boxShadow: '0 0 18px rgba(199,167,255,0.34)' }
                      : {
                          boxShadow: [
                            '0 0 12px rgba(199,167,255,0.28)',
                            '0 0 22px rgba(199,167,255,0.55)',
                            '0 0 12px rgba(199,167,255,0.28)',
                          ],
                        }
                  }
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                Demander une démo
              </div>
            </div>
          </FloatCard>

          <HeroMockup />

          <FloatCard
            floatDelay={0.6}
            className="mx-auto w-full max-w-[280px] lg:absolute lg:top-[66px] lg:right-0 lg:mx-0 lg:w-[220px] lg:max-w-none lg:rotate-[8deg]"
          >
            <p className="text-xs font-bold text-foreground">{TAGS[0]!.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-secondary-foreground">
              {TAGS[0]!.text}
            </p>
          </FloatCard>

          <FloatCard
            floatDelay={1.2}
            className="mx-auto w-full max-w-[300px] lg:absolute lg:right-7 lg:bottom-[88px] lg:mx-0 lg:w-[260px] lg:max-w-none lg:-rotate-[7deg]"
          >
            <p className="text-xs font-bold text-foreground">{TAGS[1]!.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-secondary-foreground">
              {TAGS[1]!.text}
            </p>
          </FloatCard>

          <FloatCard
            floatDelay={1.8}
            className="mx-auto w-full max-w-[300px] lg:absolute lg:bottom-6 lg:left-[180px] lg:mx-0 lg:w-[260px] lg:max-w-none lg:rotate-[7deg]"
          >
            <p className="text-xs font-bold text-foreground">{TAGS[2]!.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-secondary-foreground">
              {TAGS[2]!.text}
            </p>
          </FloatCard>
        </motion.div>
      </motion.div>
    </section>
  );
}
