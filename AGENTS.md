<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# aldia — guía para agentes

## Contexto

App personal de gestión financiera: préstamos y abonos, servicios/arriendos y recordatorios por WhatsApp. La UI y los mensajes de error están en español; los commits, en inglés.

## Comandos

```bash
pnpm dev             # next dev (regenera el bloque Next de este archivo)
pnpm build           # next build
pnpm start           # next start
pnpm lint            # eslint (incluye reglas react-hooks)
pnpm exec tsc --noEmit
pnpm test            # vitest run
pnpm test:watch      # vitest
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
```

Verificación antes de commitear/abrir PR:

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm format:check && pnpm build
```

Si no hay credenciales reales, el build funciona con env dummy inline:

```bash
SESSION_SECRET=test-secret FIREBASE_PROJECT_ID=dummy \
FIREBASE_CLIENT_EMAIL=dummy@example.com \
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n" \
pnpm build
```

Tipos de rutas: tras borrar/mover páginas quedan tipos stale en `.next/types` y `.next/dev/types` que rompen `tsc`; regenerar con `pnpm exec next typegen` (o borrar `.next/dev/types`).

## Arquitectura

- Next.js 16.4.2 (App Router, Turbopack, Tailwind v4) con `cacheComponents: true` y `partialPrefetching`.
- **Regla de `cacheComponents`**: `cookies()`/`headers()` solo pueden leerse detrás de un `<Suspense>`; si no, `next build` falla. Ejemplo: `app/(app)/layout.tsx` streamea el usuario al sidebar.
- `proxy.ts` (Node runtime): guard de rutas fail-closed. Rutas públicas y guest-only en `lib/proxy/routes.ts`.
- Flujo de auth: popup de Google → `syncUserWithFirestore()` (cliente) → `POST /api/auth/session` → Admin `verifyIdToken` + whitelist → cookie `aldia_session` (jose HS256, httpOnly, 7 días). Logout: `POST /api/auth/logout`.
- Firebase: `lib/firebase.ts` (SDK cliente), `lib/firebase-admin.ts` (Admin, `server-only`), `lib/session.ts` (compartido), `lib/auth.ts` (`getCurrentUser`, server), `lib/user-sync.ts` (cliente).
- Firestore: `allowedEmails/{email en minúsculas}` con `active: boolean`; `users/{uid de Google}` con `role`, `whatsappConfig`, `preferences`; `loginLogs` (TTL 90 días, sin acceso desde cliente).
- UI: shadcn sobre base-ui; `cn` se importa del paquete `cn` (no de `clsx`). Alias `@/*` → raíz del repo.

## Convenciones

- **Gitflow**: `main` protegido (solo PR), `develop` como integración, `feature/*` → PR a `develop`. Nunca commitear directo en `main` ni `develop`.
- **Commits** convencionales en inglés: `feat(...)`, `fix(...)`, `chore(...)`, `test(...)`, `docs(...)`.
- **Prettier**: `semi: false`, `singleQuote: true`. Correr `pnpm format` antes de commitear.
- **ESLint** (`react-hooks/set-state-in-effect`): prohibido `setState` síncrono en el cuerpo de un `useEffect`. Usar `useSyncExternalStore` (media queries, ver `hooks/use-mobile.ts`) o el patrón de ajustar estado durante el render (ver `components/chart-area-interactive.tsx`).
- **Tests**: Vitest con entorno `node` por defecto. Componentes con `// @vitest-environment jsdom` y polyfills de `tests/setup.ts`. Mockear Firebase con `vi.hoisted` (ver `tests/session-route.test.ts` y `tests/user-sync.test.ts`).

## Seguridad

- `.env.local` está ignorado; el único env versionado es `.env.example`. Nunca commitear credenciales ni loguear tokens.
- La whitelist se valida en el cliente (UX) y en el servidor (seguridad real, `/api/auth/session`). Mantener ambas reglas idénticas: el doc debe existir con `active === true`.

## Pendientes manuales (consola de Firebase)

- Reglas de Firestore: `allowedEmails/{email}` → `get` solo si `request.auth.token.email == email` (sin `list`); `users/{uid}` → `read/create/update` solo si `request.auth.uid == uid`; `loginLogs` → denegar todo.
- Cada documento de `allowedEmails` debe tener `active: true`.

## Gotchas

- El bloque `nextjs-agent-rules` de arriba lo gestiona `next dev`: no editar su contenido ni sus markers; el resto del archivo es libre.
- No commitear `.env*` (excepto `.env.example`), `.next/` ni artefactos de build.
