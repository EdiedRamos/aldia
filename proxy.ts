import type { NextRequest } from 'next/server'

import { guard } from '@/lib/proxy/guard'

export async function proxy(request: NextRequest) {
  return guard(request)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
