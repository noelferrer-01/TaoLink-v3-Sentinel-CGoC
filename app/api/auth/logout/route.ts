import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/modules/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const jar = await cookies();
  const token = jar.get(auth.SESSION_COOKIE_NAME)?.value;
  if (token) {
    await auth.logout(token);
  }
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.delete(auth.SESSION_COOKIE_NAME);
  return response;
}
