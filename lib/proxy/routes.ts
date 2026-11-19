const GUEST_ONLY_ROUTES = ['/login']
const PUBLIC_ROUTES = ['/login', '/privacy', '/terms']

export type RoutePolicy = 'guest-only' | 'public' | 'protected'

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function classify(pathname: string): RoutePolicy {
  if (GUEST_ONLY_ROUTES.some((route) => matchesRoute(pathname, route))) {
    return 'guest-only'
  }

  if (PUBLIC_ROUTES.some((route) => matchesRoute(pathname, route))) {
    return 'public'
  }

  return 'protected'
}
