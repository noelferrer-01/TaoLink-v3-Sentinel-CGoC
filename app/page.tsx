import { redirect } from 'next/navigation';
import { getSessionFromCookie } from '@/modules/auth';

export default async function HomePage() {
  const session = await getSessionFromCookie();
  redirect(session ? '/dashboard' : '/login');
}
