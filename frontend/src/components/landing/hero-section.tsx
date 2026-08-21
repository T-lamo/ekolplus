'use client';

import Image from 'next/image';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import {
  BadgeCheck,
  Bookmark,
  Calendar,
  Files,
  FolderKanban,
  GraduationCap,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { CtaLink } from './landing-ui';
import { fadeUp, staggerContainer } from './landing-motion';

// Hosted locally (public/images/heroimage.jpg) — was the Banani-generated
// storage.googleapis.com URL; moved in-repo so it's a same-origin asset the
// service worker precaches like any other build output (a cross-origin
// no-cors image fetch yields an opaque response the SW can't inspect the
// status of, so a transient failure could get cached as if it had
// succeeded — this sidesteps that, on top of no longer depending on an
// external host staying up).
const DASHBOARD_MOCKUP_IMG = '/images/heroimage.jpg';

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

// Banani's hero mockup nests 4 miniature "document" cards, 2 pill-shaped
// text notes and 4 icon tokens directly around the headline (negative
// left/right/top offsets relative to the centered copy column) — present
// in the Banani source but dropped during the original implementation.
// Ported here 1:1 for position/content; Banani itself ships zero animation
// (a fully static mockup), so the "floating in the air" motion and the
// notes' continuous motion are this pass's own addition, using the same
// infinite-bob convention `FloatCard` already established. `lg:`-gated and
// clipped by the section's own `overflow-hidden`, same as the ambient glow
// blobs above and the rest of this hero's floating composition.
type DocPose = { rotate: number; rotateX: number; rotateY: number; z: number };

function DocSeal({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-3.5 items-center justify-center rounded-full bg-accent/[0.26] px-[7px] text-[8px] font-bold whitespace-nowrap text-[#523c75]">
      {children}
    </span>
  );
}

function DocRow({ width, center }: { width: string; center?: boolean }) {
  return (
    <div
      className={`mt-1.5 h-1 rounded-full bg-[rgba(83,63,114,0.12)] ${center ? 'mx-auto' : ''}`}
      style={{ width }}
    />
  );
}

function DocGrid() {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[18px] rounded-md border border-[rgba(83,63,114,0.08)] bg-[rgba(83,63,114,0.07)]"
        />
      ))}
    </div>
  );
}

function DocCheckRows() {
  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="h-1.5 rounded-full bg-[rgba(83,63,114,0.11)]" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mt-1.5 grid grid-cols-[10px_1fr_10px_1fr] items-center gap-1">
          <span className="h-2.5 rounded-[3px] bg-accent/[0.22]" />
          <span className="h-1 rounded-full bg-[rgba(83,63,114,0.11)]" />
          <span className="h-2.5 rounded-[3px] bg-accent/[0.22]" />
          <span className="h-1 rounded-full bg-[rgba(83,63,114,0.11)]" />
        </div>
      ))}
    </>
  );
}

function DocGradeBars() {
  return (
    <div className="mt-2.5 flex h-[34px] items-end gap-1">
      {[36, 62, 78, 50].map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-md rounded-b-[2px] bg-[linear-gradient(180deg,rgba(199,167,255,0.72),rgba(199,167,255,0.2))]"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function DocCertificateBadge() {
  return (
    <>
      <div className="mx-auto mt-2 h-[34px] w-[34px] rounded-full border-2 border-accent/[0.34] shadow-[inset_0_0_0_6px_rgba(199,167,255,0.08)]" />
      <div className="mt-3 text-center text-[9px] font-bold whitespace-nowrap text-[#523c75]">
        Certificat
      </div>
      <DocRow width="74%" center />
      <DocRow width="54%" center />
      <div className="mx-auto mt-3 h-2.5 w-[42px] -rotate-[6deg] rounded-full border-b-2 border-[rgba(83,63,114,0.20)]" />
    </>
  );
}

/** Miniature floating "document" card — folded corner + ruled-paper texture,
 * gently bobbing forever on top of its fixed 3D rest pose. Framer-motion
 * composes `rotate`/`rotateX`/`rotateY`/`z`/`y` into one `transform` itself,
 * so the whole pose lives in `animate` rather than a competing static
 * Tailwind transform class — mixing the two silently drops the static one
 * the moment the element animates (bug hit once already on this page, see
 * STATUS.md's post-launch animation pass). */
function HeroAirDocument({
  className,
  pose,
  depth,
  floatDelay = 0,
  children,
}: {
  className?: string;
  pose: DocPose;
  depth?: 'soft' | 'strong';
  floatDelay?: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const restOpacity = depth === 'strong' ? 0.9 : depth === 'soft' ? 0.95 : 1;
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{
        opacity: restOpacity,
        rotate: pose.rotate,
        rotateX: pose.rotateX,
        rotateY: pose.rotateY,
        z: pose.z,
        y: reduceMotion ? 0 : [0, -10, 0],
      }}
      transition={{
        opacity: { duration: 0.8, delay: 0.4 + floatDelay * 0.12 },
        default: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: floatDelay },
      }}
      style={{
        filter: depth === 'strong' ? 'blur(1px)' : depth === 'soft' ? 'blur(0.6px)' : 'none',
      }}
      className={`hidden w-[94px] min-h-[118px] rounded-[18px_22px_16px_24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(245,241,250,0.965))] p-2.5 shadow-[0_24px_40px_rgba(0,0,0,0.22),inset_0_2px_0_rgba(255,255,255,0.8),inset_0_-10px_16px_rgba(80,58,118,0.08)] lg:absolute lg:block ${className ?? ''}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(117,95,149,0.04)),repeating-linear-gradient(0deg,rgba(71,53,101,0.035),rgba(71,53,101,0.035)_1px,transparent_1px,transparent_12px)] opacity-95" />
      <div className="absolute top-0 right-0 h-[18px] w-[18px] rounded-tr-xl bg-[linear-gradient(135deg,rgba(224,216,238,0.96),rgba(255,255,255,1))] [clip-path:polygon(0_0,100%_0,100%_100%)]" />
      <div className="relative z-[2]">{children}</div>
    </motion.div>
  );
}

/** Small pill-shaped text label — the "petit texte" that needs its own
 * permanent animation, per Banani's `.hero-air-note`. Bobs forever like the
 * document cards, independently staggered. */
function HeroAirNote({
  icon,
  children,
  rotate,
  className,
  floatDelay = 0,
}: {
  icon: ReactNode;
  children: ReactNode;
  rotate: number;
  className?: string;
  floatDelay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, rotate, y: reduceMotion ? 0 : [0, -8, 0] }}
      transition={{
        opacity: { duration: 0.8, delay: 0.6 + floatDelay * 0.15 },
        default: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay },
      }}
      className={`hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-2 text-[11px] whitespace-nowrap text-secondary-foreground backdrop-blur-md lg:absolute lg:flex ${className ?? ''}`}
    >
      {icon}
      {children}
    </motion.div>
  );
}

/** Small circular icon-only token — same permanent bob as the notes/cards. */
function HeroAirToken({
  icon,
  rotate,
  className,
  floatDelay = 0,
}: {
  icon: ReactNode;
  rotate: number;
  className?: string;
  floatDelay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, rotate, y: reduceMotion ? 0 : [0, -6, 0] }}
      transition={{
        opacity: { duration: 0.8, delay: 0.5 + floatDelay * 0.15 },
        default: { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay },
      }}
      className={`hidden h-[34px] w-[34px] items-center justify-center rounded-full border border-white/[0.08] bg-white/5 text-accent shadow-[0_12px_24px_rgba(0,0,0,0.14)] backdrop-blur-md lg:absolute lg:flex ${className ?? ''}`}
    >
      {icon}
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
        <div className="relative mx-auto max-w-[760px] text-center lg:[perspective:1200px]">
          <HeroAirDocument
            floatDelay={0}
            pose={{ rotate: -24, rotateX: 18, rotateY: -18, z: 40 }}
            className="lg:top-[60px] lg:left-[-300px]"
          >
            <DocSeal>Bulletin</DocSeal>
            <DocRow width="92%" />
            <DocRow width="68%" />
            <DocGrid />
            <DocRow width="84%" />
            <DocRow width="56%" />
          </HeroAirDocument>
          <HeroAirDocument
            floatDelay={0.8}
            depth="soft"
            pose={{ rotate: 17, rotateX: -12, rotateY: 16, z: -10 }}
            className="lg:top-[222px] lg:left-[-320px] lg:w-[86px]"
          >
            <DocSeal>Présences</DocSeal>
            <DocCheckRows />
          </HeroAirDocument>
          <HeroAirDocument
            floatDelay={1.4}
            depth="strong"
            pose={{ rotate: 24, rotateX: 16, rotateY: 18, z: -12 }}
            className="lg:top-[64px] lg:right-[-300px] lg:w-[84px]"
          >
            <DocCertificateBadge />
          </HeroAirDocument>
          <HeroAirDocument
            floatDelay={2}
            pose={{ rotate: -18, rotateX: -10, rotateY: -16, z: 26 }}
            className="lg:top-[230px] lg:right-[-322px] lg:w-[92px]"
          >
            <DocSeal>Notes</DocSeal>
            <DocRow width="86%" />
            <DocGradeBars />
            <DocRow width="66%" />
            <DocRow width="48%" />
          </HeroAirDocument>

          <HeroAirNote
            icon={<FolderKanban className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
            rotate={-7}
            floatDelay={0.3}
            className="lg:top-[178px] lg:left-[-222px]"
          >
            Dossiers &amp; archives
          </HeroAirNote>
          <HeroAirNote
            icon={<BadgeCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
            rotate={8}
            floatDelay={0.9}
            className="lg:top-[190px] lg:right-[-226px]"
          >
            Bulletins • Présences • Paiements
          </HeroAirNote>

          <HeroAirToken
            icon={<Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}
            rotate={-12}
            floatDelay={0.2}
            className="lg:top-[40px] lg:left-[-158px]"
          />
          <HeroAirToken
            icon={<GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />}
            rotate={11}
            floatDelay={0.7}
            className="lg:top-[36px] lg:right-[-160px]"
          />
          <HeroAirToken
            icon={<Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
            rotate={9}
            floatDelay={1.2}
            className="lg:top-[342px] lg:left-[-156px]"
          />
          <HeroAirToken
            icon={<Files className="h-3.5 w-3.5" aria-hidden="true" />}
            rotate={-8}
            floatDelay={1.7}
            className="lg:top-[346px] lg:right-[-158px]"
          />

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
