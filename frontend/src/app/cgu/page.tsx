import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalSection } from '@/components/landing/legal-article';

const TITLE = "Conditions générales d'utilisation";
const DESCRIPTION =
  "Conditions d'accès et d'utilisation de Schoolgesti par les établissements scolaires clients.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: '/cgu' },
};

export default function CguPage() {
  return (
    <LegalArticle title={TITLE} updated="21 août 2026">
      <p className="text-[14px] leading-relaxed text-[#2c2138]">
        Les présentes conditions régissent l&apos;utilisation de Schoolgesti, la plateforme de
        gestion scolaire éditée par [Raison sociale de l&apos;éditeur], [forme juridique], dont le
        siège social est situé [adresse du siège social] (« Schoolgesti », « nous »). En créant un
        compte ou en utilisant le service, l&apos;établissement scolaire (« l&apos;Établissement »,
        « vous ») accepte ces conditions.
      </p>

      <LegalSection heading="1. Objet du service">
        <p>
          Schoolgesti est un système d&apos;information scolaire destiné aux établissements
          d&apos;enseignement. Il permet notamment de gérer les dossiers élèves, les inscriptions,
          les notes et bulletins, les présences, l&apos;emploi du temps, le suivi des frais de
          scolarité et la communication avec les familles.
        </p>
      </LegalSection>

      <LegalSection heading="2. Compte et accès">
        <p>
          L&apos;inscription se fait au nom d&apos;un établissement scolaire. La personne qui crée
          le compte doit avoir l&apos;autorité nécessaire pour engager l&apos;établissement.
          C&apos;est ensuite l&apos;Établissement qui crée et gère les comptes de son personnel,
          ainsi que les accès donnés aux parents et aux élèves.
        </p>
        <p>
          Chaque utilisateur est responsable de la confidentialité de ses identifiants et de toute
          action réalisée depuis son compte. Toute suspicion d&apos;accès non autorisé doit être
          signalée sans délai à{' '}
          <a href="mailto:support@schoolgesti.com" className="font-semibold underline">
            support@schoolgesti.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="3. Données saisies dans le service">
        <p>
          L&apos;Établissement reste seul responsable de l&apos;exactitude des informations
          qu&apos;il saisit (dossiers élèves, notes, présences, montants dus) et de la conformité de
          leur collecte auprès des familles, notamment lorsque celle-ci concerne des mineurs. Le
          traitement de ces données par Schoolgesti est décrit dans notre{' '}
          <Link href="/confidentialite" className="font-semibold underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="4. Abonnement et tarification">
        <p>
          Schoolgesti propose un plan gratuit, limité à 50 élèves, et un plan payant facturé par
          élève et par mois, sans limite jusqu&apos;à 1000 élèves. Les tarifs en vigueur sont
          indiqués sur la page Tarifs du site.
        </p>
        <p>
          Le paiement de l&apos;abonnement est prélevé par carte bancaire via Stripe.
          L&apos;abonnement se renouvelle automatiquement à l&apos;échéance choisie (mensuelle ou
          annuelle) tant qu&apos;il n&apos;a pas été résilié. Le nombre d&apos;élèves facturés est
          celui constaté sur le compte de l&apos;Établissement à la date de facturation.
        </p>
        <p>
          L&apos;Établissement peut résilier son abonnement à tout moment depuis son espace
          Paramètres ; la résiliation prend effet à la fin de la période déjà payée, sans
          remboursement au prorata sauf disposition légale contraire.
        </p>
      </LegalSection>

      <LegalSection heading="5. Disponibilité du service">
        <p>
          Nous mettons tout en œuvre pour que le service soit accessible en continu, mais nous ne
          garantissons pas une disponibilité absolue : des interruptions peuvent survenir pour
          maintenance, mise à jour, ou en raison de facteurs indépendants de notre volonté (panne
          d&apos;un prestataire d&apos;hébergement, coupure réseau). Nous informons les
          établissements des interventions programmées lorsque cela est possible.
        </p>
      </LegalSection>

      <LegalSection heading="6. Usage autorisé">
        <p>
          L&apos;Établissement s&apos;engage à utiliser Schoolgesti conformément à sa destination :
          la gestion administrative et pédagogique de son propre établissement. Sont notamment
          interdits : l&apos;utilisation du service pour un autre établissement que celui déclaré,
          la tentative de contournement des mesures de sécurité, l&apos;extraction massive de
          données à des fins étrangères au service, et toute utilisation portant atteinte aux droits
          de tiers.
        </p>
      </LegalSection>

      <LegalSection heading="7. Propriété intellectuelle">
        <p>
          Le logiciel, son code, son interface et sa marque restent la propriété de [Raison sociale
          de l&apos;éditeur]. Les données saisies par l&apos;Établissement (dossiers élèves, notes,
          documents) restent sa propriété ; nous ne nous en attribuons aucun droit au-delà de ce qui
          est nécessaire pour faire fonctionner le service.
        </p>
      </LegalSection>

      <LegalSection heading="8. Responsabilité">
        <p>
          Schoolgesti est un outil de gestion : les décisions pédagogiques, administratives ou
          disciplinaires prises à partir des informations qu&apos;il contient relèvent de la seule
          responsabilité de l&apos;Établissement. Notre responsabilité, si elle est engagée, est
          limitée aux sommes versées par l&apos;Établissement au titre de son abonnement au cours
          des douze derniers mois, sauf en cas de faute lourde ou intentionnelle de notre part.
        </p>
      </LegalSection>

      <LegalSection heading="9. Suspension et résiliation">
        <p>
          Nous pouvons suspendre ou résilier l&apos;accès d&apos;un Établissement en cas de
          manquement grave à ces conditions (impayé prolongé, usage frauduleux, atteinte à la
          sécurité du service), après notification préalable sauf urgence.
        </p>
      </LegalSection>

      <LegalSection heading="10. Modification des présentes conditions">
        <p>
          Nous pouvons faire évoluer ces conditions pour refléter un changement du service ou de la
          réglementation applicable. Les établissements clients en seront informés par e-mail ; la
          poursuite de l&apos;utilisation du service après notification vaut acceptation des
          nouvelles conditions.
        </p>
      </LegalSection>

      <LegalSection heading="11. Droit applicable">
        <p>
          Les présentes conditions sont soumises au droit [juridiction applicable]. Tout litige
          relatif à leur interprétation ou leur exécution relève de la compétence [tribunal
          compétent], sauf disposition légale impérative contraire.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact">
        <p>
          Pour toute question relative à ces conditions, écrivez à{' '}
          <a href="mailto:contact@schoolgesti.com" className="font-semibold underline">
            contact@schoolgesti.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
