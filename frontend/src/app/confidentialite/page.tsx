import type { Metadata } from 'next';
import { LegalArticle, LegalSection } from '@/components/landing/legal-article';

const TITLE = 'Politique de confidentialité';
const DESCRIPTION =
  'Comment Schoolgesti collecte, utilise et protège les données des établissements scolaires, de leur personnel, des parents et des élèves.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: '/confidentialite' },
};

export default function ConfidentialitePage() {
  return (
    <LegalArticle title={TITLE} updated="21 août 2026">
      <p className="text-[14px] leading-relaxed text-[#2c2138]">
        Schoolgesti est un système d&apos;information scolaire (SIS) qui aide les établissements à
        gérer leurs dossiers élèves, leurs notes et bulletins, leurs présences, leur emploi du temps
        et le suivi des frais de scolarité. Cette politique explique quelles données nous traitons
        dans le cadre du service, pourquoi, et comment elles sont protégées. Elle s&apos;applique
        aux établissements clients, à leur personnel, ainsi qu&apos;aux parents et élèves auxquels
        un accès a été donné.
      </p>

      <LegalSection heading="1. Qui fait quoi">
        <p>
          Schoolgesti fournit l&apos;outil ; l&apos;établissement scolaire reste responsable des
          données qu&apos;il saisit et de la manière dont il les collecte auprès des familles.
          C&apos;est l&apos;établissement qui décide quelles informations sur un élève ou un parent
          sont enregistrées, et c&apos;est à lui d&apos;obtenir, lorsque la réglementation qui
          s&apos;applique à lui l&apos;exige, l&apos;accord des parents ou représentants légaux
          avant de créer le dossier d&apos;un élève mineur. De notre côté, nous hébergeons ces
          données, nous les sécurisons, et nous ne les utilisons que pour faire fonctionner le
          service — jamais à d&apos;autres fins.
        </p>
      </LegalSection>

      <LegalSection heading="2. Les données que nous traitons">
        <p>
          <span className="font-semibold">Comptes utilisateurs</span> — nom, adresse e-mail, mot de
          passe (jamais stocké en clair, uniquement sous forme hachée), numéro de téléphone
          facultatif, rôle au sein de l&apos;établissement. Si vous vous connectez avec Google, nous
          récupérons votre nom, votre adresse e-mail et votre photo de profil telle que fournie par
          Google.
        </p>
        <p>
          <span className="font-semibold">Dossiers élèves</span> — nom, date et lieu de naissance,
          nationalité, adresse, photo, coordonnées des parents ou tuteurs, historique scolaire
          (classes, inscriptions, notes, appréciations, absences) et, le cas échéant, des notes
          internes rédigées par le personnel de l&apos;établissement.
        </p>
        <p>
          <span className="font-semibold">Frais de scolarité</span> — montants dus et réglés, mode
          de paiement déclaré (espèces, MonCash, NatCash, chèque, virement) et référence de
          transaction le cas échéant. Ces paiements sont enregistrés manuellement par le personnel
          de l&apos;établissement dans l&apos;outil : Schoolgesti n&apos;encaisse pas les frais de
          scolarité et ne collecte aucune donnée bancaire des familles à cette occasion.
        </p>
        <p>
          <span className="font-semibold">Abonnement de l&apos;établissement</span> — lorsqu&apos;un
          établissement souscrit à un plan payant, le paiement de l&apos;abonnement est traité
          directement par Stripe, notre prestataire de paiement. Nous recevons la confirmation du
          paiement et son statut, jamais le numéro de carte bancaire.
        </p>
        <p>
          <span className="font-semibold">Documents et fichiers</span> — photos d&apos;élèves, logo
          de l&apos;établissement, signature numérisée utilisée sur les bulletins : ces fichiers
          sont stockés chez Cloudinary, notre prestataire de stockage d&apos;images.
        </p>
        <p>
          <span className="font-semibold">Données techniques</span> — adresse IP, journaux de
          connexion, informations sur l&apos;appareil et le navigateur utilisés, à des fins de
          sécurité (détection d&apos;activité suspecte, limitation du nombre de tentatives de
          connexion).
        </p>
      </LegalSection>

      <LegalSection heading="3. Pourquoi nous traitons ces données">
        <p>
          Pour fournir le service (créer les comptes, afficher les dossiers, générer les bulletins),
          pour sécuriser les accès, pour facturer l&apos;abonnement de l&apos;établissement, pour
          envoyer les e-mails nécessaires au fonctionnement du compte (vérification d&apos;adresse,
          réinitialisation de mot de passe, relances de frais de scolarité configurées par
          l&apos;établissement), et pour améliorer la fiabilité de la plateforme.
        </p>
        <p>
          Nous n&apos;utilisons pas ces données à des fins publicitaires, nous ne les revendons pas,
          et nous ne les partageons avec personne d&apos;autre que les prestataires listés
          ci-dessous.
        </p>
      </LegalSection>

      <LegalSection heading="4. Avec qui nous partageons ces données">
        <p>
          Uniquement avec les prestataires qui nous permettent de faire fonctionner Schoolgesti,
          chacun n&apos;ayant accès qu&apos;à ce dont il a besoin pour sa mission :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="font-semibold">Stripe</span> — traitement du paiement de
            l&apos;abonnement de l&apos;établissement.
          </li>
          <li>
            <span className="font-semibold">Cloudinary</span> — hébergement des photos et documents.
          </li>
          <li>
            <span className="font-semibold">Resend</span> — envoi des e-mails transactionnels
            (vérification, mot de passe, notifications).
          </li>
          <li>
            <span className="font-semibold">Google</span> — uniquement si vous choisissez de vous
            connecter avec un compte Google.
          </li>
          <li>
            Notre hébergeur d&apos;infrastructure, qui héberge l&apos;ensemble de la plateforme.
          </li>
        </ul>
        <p>
          Nous ne partageons aucune donnée avec des régies publicitaires, ni avec des courtiers en
          données.
        </p>
      </LegalSection>

      <LegalSection heading="5. Combien de temps nous les conservons">
        <p>
          Les données d&apos;un établissement sont conservées tant que son compte reste actif. En
          cas de résiliation, l&apos;établissement peut demander l&apos;export ou la suppression de
          ses données ; à défaut de demande, elles sont supprimées dans un délai raisonnable après
          la fin du contrat, sous réserve des durées de conservation imposées par la loi
          (obligations comptables notamment, pour les données de facturation).
        </p>
      </LegalSection>

      <LegalSection heading="6. Sécurité">
        <p>
          Les mots de passe sont hachés, jamais stockés en clair. Les échanges entre votre
          navigateur et nos serveurs sont chiffrés (HTTPS), et l&apos;accès aux données d&apos;un
          établissement est cloisonné : le personnel d&apos;une école ne peut pas voir les données
          d&apos;une autre école. Les accès administrateurs internes sont journalisés.
        </p>
      </LegalSection>

      <LegalSection heading="7. Cookies">
        <p>
          Nous utilisons des cookies strictement nécessaires au fonctionnement du service : maintien
          de votre session de connexion, protection contre les attaques CSRF, mémorisation de vos
          préférences d&apos;affichage (langue, thème de couleur). Nous n&apos;utilisons pas de
          cookies publicitaires ni de traceurs tiers à des fins de suivi marketing.
        </p>
      </LegalSection>

      <LegalSection heading="8. Vos droits">
        <p>
          Vous pouvez demander l&apos;accès, la correction ou la suppression des données vous
          concernant en écrivant à{' '}
          <a href="mailto:contact@schoolgesti.com" className="font-semibold underline">
            contact@schoolgesti.com
          </a>
          . Pour les données d&apos;un élève mineur, cette demande doit être adressée à
          l&apos;établissement scolaire concerné, qui reste responsable du dossier ; nous
          l&apos;accompagnons techniquement pour y répondre.
        </p>
      </LegalSection>

      <LegalSection heading="9. Modifications de cette politique">
        <p>
          Nous pouvons mettre à jour cette politique pour refléter une évolution du service ou de la
          réglementation. La date de dernière mise à jour figure en haut de cette page ; en cas de
          changement important, nous en informerons les établissements clients par e-mail.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Pour toute question sur cette politique, écrivez-nous à{' '}
          <a href="mailto:contact@schoolgesti.com" className="font-semibold underline">
            contact@schoolgesti.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
