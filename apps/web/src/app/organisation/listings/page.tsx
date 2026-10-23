import { redirect } from 'next/navigation';

/** Listings are on the organisation dashboard (#34). */
export default function ListingsPage() {
  redirect('/organisation');
}
