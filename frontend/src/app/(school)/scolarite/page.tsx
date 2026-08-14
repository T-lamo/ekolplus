import { redirect } from 'next/navigation';

// Bare /scolarite has no content of its own — Fee Management ("Suivi des
// paiements") is the default landing tab. Keeping this as a real page (not
// just the sidebar href) means the sidebar's prefix-based active-route
// matching (isActiveRoute) highlights "Frais & Scolarité" for all 3
// /scolarite/* sub-routes, not just one.
export default function ScolariteIndexPage() {
  redirect('/scolarite/paiements');
}
