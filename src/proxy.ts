import { NextRequest, NextResponse } from 'next/server';

const blockedPagePrefixes = [
  '/accounts',
  '/analysis',
  '/dashboard',
  '/favorites',
  '/report',
  '/settings',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (blockedPagePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (pathname.startsWith('/api/')) {
    const isReadMethod = request.method === 'GET' || request.method === 'HEAD';
    const isArticleListApi = pathname === '/api/articles';
    const isArticleDetailApi = /^\/api\/articles\/[^/]+$/.test(pathname);
    const isAllowedReadApi = isArticleListApi || isArticleDetailApi;

    if (!isReadMethod || !isAllowedReadApi) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/accounts/:path*',
    '/analysis/:path*',
    '/dashboard/:path*',
    '/favorites/:path*',
    '/report/:path*',
    '/settings/:path*',
    '/api/:path*',
  ],
};
