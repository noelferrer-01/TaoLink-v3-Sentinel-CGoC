import { NextResponse } from 'next/server';
import { auth } from '@/modules/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');

  if (!email || !password) {
    return NextResponse.redirect(new URL('/login?error=invalid', request.url), { status: 303 });
  }

  const result = await auth.login(email, password);
  if (!result.ok) {
    return NextResponse.redirect(new URL('/login?error=invalid', request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.set(auth.SESSION_COOKIE_NAME, result.session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: result.session.expiresAt,
  });
  return response;
}
