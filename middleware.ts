import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // 1) Forcer HTTPS en production (301), hors localhost
    const host = req.headers.get('host') || '';
    const proto = req.headers.get('x-forwarded-proto') || '';
    if (
      proto &&
      proto !== 'https' &&
      host &&
      !host.startsWith('localhost') &&
      !host.startsWith('127.0.0.1')
    ) {
      const url = new URL(req.url);
      url.protocol = 'https:';
      return NextResponse.redirect(url, 301);
    }

    // 2) Protection des routes admin
    const token = req.nextauth.token;
    const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
    const isApiAdminRoute = req.nextUrl.pathname.startsWith('/api/admin');

    if (isAdminRoute || isApiAdminRoute) {
      if (!token) {
        return NextResponse.redirect(new URL('/auth/signin', req.url));
      }

      if (token.role !== 'ADMIN' && token.role !== 'EDITOR') {
        return NextResponse.redirect(new URL('/auth/unauthorized', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
        const isApiAdminRoute = req.nextUrl.pathname.startsWith('/api/admin');

        // Accès libre aux routes publiques
        if (!isAdminRoute && !isApiAdminRoute) {
          return true;
        }

        // Vérifier l'authentification pour les routes admin
        return !!token;
      },
    },
  }
);

// Appliquer le middleware (exclure les assets statiques)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};

