<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# aldia — guía para agentes

## Contexto

App personal de gestión financiera: préstamos y abonos, servicios/arriendos, contactos/codeudores, calendario financiero consolidado y recordatorios manuales por WhatsApp (`$0` costo operativo). La UI y los mensajes de error están en español; los commits, en inglés.

## Comandos y verificación obligatoria

Scripts definidos en `package.json` (`pnpm@10.22.0`):

```bash
pnpm dev             # next dev (regenera el bloque nextjs-agent-rules de este archivo)
pnpm build           # next build
pnpm start           # next start
pnpm lint            # eslint (incluye reglas react-hooks)
pnpm exec tsc --noEmit
pnpm test            # vitest run
pnpm test:watch      # vitest
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
```

**Verificación obligatoria antes de dar por terminada cualquier tarea** (deben pasar sin errores):

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm format:check
```

Para validar build de producción antes de abrir PR/desplegar (si no hay credenciales reales, usar env dummy inline):

```bash
SESSION_SECRET=test-secret NEXT_PUBLIC_FIREBASE_PROJECT_ID=dummy \
FIREBASE_CLIENT_EMAIL=dummy@example.com \
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n" \
pnpm build
```

Tipos de rutas: tras borrar/mover páginas pueden quedar tipos stale en `.next/types` y `.next/dev/types` que rompen `tsc`; regenerar con `pnpm exec next typegen` (o borrar `.next/dev/types`).

## Arquitectura y módulos core

### Stack y runtime

- Next.js `16.4.6` (App Router, Turbopack, React `19.3.0`, Tailwind CSS v4) con `cacheComponents: true` y `partialPrefetching: true` (`next.config.ts`).
- **Regla de `cacheComponents`**: `cookies()` y `headers()` solo pueden leerse detrás de un `<Suspense>`; si no, `next build` falla (ej. `app/(app)/layout.tsx` streamea el usuario autenticado al sidebar).
- UI: `shadcn` sobre `@base-ui/react` en `components/ui/*`; `cn` se importa del paquete `cn` (no de `clsx`). Alias `@/*` → raíz del repo.
- `proxy.ts` (Node runtime): guard de rutas fail-closed (`lib/proxy/guard.ts`). Rutas guest-only (`/login`) y públicas (`/login`, `/privacy`, `/terms`) definidas en `lib/proxy/routes.ts`.

### Clean Architecture estricta

Los módulos de negocio viven en `features/` con separación estricta en 4 capas:

- `features/auth/` (`domain/`, `application/`, `infrastructure/`, `presentation/actions/auth.actions.ts`)
- `features/contacts/` (`domain/`, `application/`, `infrastructure/`, `presentation/actions/`, `presentation/components/`)
- `features/services/` (`domain/`, `application/`, `infrastructure/`, `presentation/actions/`, `presentation/components/`)
- `features/loans/` (`domain/`, `application/`, `infrastructure/`, `presentation/actions/`, `presentation/components/`)
- `features/dashboard/` (`domain/`, `application/`, `infrastructure/`, `presentation/components/`) — solo lectura; orquesta repositorios de `services`, `loans` y `contacts`.

Además existen capas transversales bien delimitadas:

- `core/domain/period.ts`: utilidades puras de dominio para periodos `YYYY-MM`.
- `shared/`: utilidades y componentes compartidos entre features (`shared/components/PdfCanvasViewer.tsx`, `shared/utils/image-to-webp.ts`).
- `lib/`: infraestructura y helpers base (`lib/firebase.ts` SDK cliente, `lib/firebase-admin.ts` Admin SDK con `server-only`, `lib/session.ts` JWT HS256 con `jose`, `lib/auth.ts` `getCurrentUser`, `lib/proxy/`, `lib/utils/image-compression.ts`, `lib/utils/safe-download.ts`).
- `components/`: shell de la aplicación (`app-sidebar.tsx`, `login-form.tsx`, `receipt-file-input.tsx`, etc.) y primitivos `components/ui/*`.
- `app/`: rutas App Router (`app/(app)/` → `/`, `/servicios`, `/contactos`, `/prestamos`; `app/(auth)/login/page.tsx`; `app/api/auth/session/route.ts`).

**Regla de dependencia (inviolable):**

1. `domain/`: TypeScript puro (entidades, tipos, errores de dominio, políticas, calculadoras, interfaces de repositorios y esquemas Zod de dominio en `*.schemas.ts`). **Prohibido** importar Firebase, Next.js o React.
2. `application/`: casos de uso (`*.use-case.ts`) con inyección de dependencias sobre interfaces de `domain/`, validación Zod y aplicación de políticas de dominio. Sin dependencias directas a SDKs concretos ni a Next.js.
3. `infrastructure/`: implementaciones concretas de Firestore (`firestore-*.repository.ts`), Firebase Storage privado (`firebase-*.storage.ts`), `cookie-session.manager.ts`, `firebase-token-verifier.ts` y composition roots (`*.container.ts`), marcados con `import 'server-only'`.
4. `presentation/`: Server/Client Components (`components/`) y Server Actions (`actions/*.actions.ts` con `'use server'`). Toda Server Action debe validar sesión autenticada (`getCurrentUser()`, respaldada por la cookie `aldia_session` emitida únicamente tras verificar el token de Firebase y la whitelist en `/api/auth/session`), invocar el container correspondiente, revalidar rutas afectadas y devolver errores tipados en español.

## Reglas de negocio y modelos consolidados

### Autenticación y autorización (`features/auth/`)

- Flujo de login: popup de Google (`components/login-form.tsx`) → `POST /api/auth/session` → `createUserSessionUseCase` → Firebase Admin `verifyIdToken` + verificación de whitelist en `allowedEmails/{email en minúsculas}` con `active === true` + `upsertUserProfile` en `users/{uid}` + auditoría en `loginLogs` (TTL 90 días, sin acceso desde cliente) → cookie `aldia_session` (`jose` HS256, `httpOnly`, 7 días).
- Logout unificado mediante la Server Action `logoutAction` (`features/auth/presentation/actions/auth.actions.ts`).
- Reglas e índices de Firebase versionados en `firestore.rules`, `firestore.indexes.json` y `storage.rules` (enlazados en `firebase.json`).

### Contactos (`features/contacts/`)

- Normalización de teléfonos a E.164 (asumiendo `+57` en móviles colombianos de 10 dígitos).
- Invariante de canal de contacto: todo contacto debe tener teléfono directo o un intermediario/codeudor (`guarantorContactId`), sin auto-referencia y sin permitir archivar o quitar el teléfono a un codeudor activo.
- Fotos de perfil privadas en `contacts/{userId}/{contactId}/avatar.{ext}` (máx. 2 MB; solo `image/webp`, `image/jpeg`, `image/png`; lectura por URL firmada de 1 hora).

### Préstamos (`features/loans/`)

- **5 modelos de interés (`LoanInterestModel`):**
  - `OPEN_ENDED`: sin plazo fijo de devolución de capital. Al `0%` admite abonos libres sin cuotas ni vencimientos; con tasa mensual `> 0%` opera como crédito rotativo con cobro mensual de interés sobre el capital vigente (`monthlyBillingDay` y `nextInterestDueDate`).
  - `NO_INTEREST`: capital dividido en cuotas sin interés con fechas personalizables.
  - `SINGLE_PAYMENT`: un único pago al vencimiento (capital + interés).
  - `INTEREST_ONLY_BALLOON`: cuotas periódicas de solo intereses y devolución total del capital en la última cuota.
  - `DECLINING_BALANCE`: abono fijo a capital por cuota más interés calculado sobre el saldo pendiente de cada periodo.
- **Operaciones:** creación, registro de abonos, edición de cuotas, refinanciación (`REFINANCED` generando nuevo préstamo con `parentLoanId`), archivado y adjunto diferido de comprobantes.
- **Inmutabilidad de comprobantes:** una vez guardado un comprobante de desembolso (`disbursementReceiptPath`) o de abono (`payment.receiptPath`), es estrictamente inmutable y no puede editarse ni reemplazarse (`RECEIPT_ALREADY_EXISTS`). Almacenados en `loans/{userId}/{loanId}/...` (máx. 5 MB).
- **Anulación auditada de abonos (`VOIDED`):** `voidLoanPaymentUseCase` + `voidPaymentOnLoan` preservan el registro del abono y su `receiptPath` inmutable, exigen motivo de anulación (`voidReason`, `voidedAt`) y recalculan de forma determinista saldos, cuotas, `nextInterestDueDate` y estado global del préstamo (incluyendo reapertura `PAID` → `ACTIVE`).

### Servicios (`features/services/`)

- Gestión de servicios mensuales recurrentes (`billingDay` 1–31, `startPeriod` `YYYY-MM`, `paymentUrl` opcional y `referenceCode` con interpolación dinámica de `{YYYY}`, `{YY}`, `{MM}` en `features/services/domain/reference-code.ts`).
- Registro de pagos con cobertura de 1 o múltiples periodos consecutivos (`monthsCovered` vía `generatePeriodRange`), evaluación automática de estado (`UP_TO_DATE`, `PENDING`, `OVERDUE`, `ARCHIVED`) y comprobantes estrictamente inmutables por periodo (`RECEIPT_ALREADY_EXISTS`, almacenados en `receipts/{userId}/{serviceId}/{period}.{ext}`, máx. 5 MB).

### Dashboard (`features/dashboard/`)

- `getDashboardOverviewUseCase` consolida `services`, `servicePayments`, `loans`, `contacts` y `whatsAppTemplates` en el servidor.
- Expone KPIs financieros (`DashboardSummary`: servicios por pagar/pagados, cobro esperado/recaudado en préstamos, capital activo total y vencidos), calendario mensual interactivo unificado (`DashboardCalendar.tsx` + `calendar-aggregator.ts` proyectando `SERVICE_DUE`, `LOAN_INSTALLMENT` y `LOAN_OPEN_INTEREST`) y radar de vencimientos próximos a 7 días (`upcoming-radar.tsx`).

### Mensajería manual WhatsApp (`$0` costo operativo)

- **Enlaces directos UTF-8:** usar exclusivamente `https://api.whatsapp.com/send?phone=...&text=...` (`buildWhatsAppSendUrl` y `buildTemplatedLoanWhatsAppUrl` en `features/loans/domain/loan-whatsapp-template.ts`). **Nunca usar `wa.me`** para recordatorios o mensajes con texto, ya que corrompe emojis UTF-8 de 4 bytes en clientes web/móviles.
- **Emojis en código fuente:** escribir siempre escapes Unicode explícitos (`\u{1F44B}`, `\u{1F60A}`, `\u{1F64F}`, etc.) en literales de código.
- **Plantillas personalizables por usuario:** persistidas en `users/{uid}/settings/whatsappTemplates` (`directLoanTemplate` y `thirdPartyLoanTemplate`) con soporte para `{{nombre}}`, `{{deudor}}`, `{{monto}}`, `{{fecha}}` y `{{saldo}}`.
- **Alcance:** el bot automatizado de WhatsApp se mantiene fuera de alcance / en _stand by_.

## Gestión de archivos, multimedia y UI

- **Conversión automática a WebP en navegador:** `shared/utils/image-to-webp.ts` (`convertImageFileToWebp`, con validación de entrada en `lib/utils/image-compression.ts`) convierte imágenes seleccionadas a `image/webp` usando `<canvas>` (redimensionado proporcional hasta 1600 px para comprobantes / 512 px para avatares, calidad `0.85`, fallback a `image/jpeg` solo si el navegador no soporta WebP). Los archivos `.heic`/`.heif` se intentan decodificar nativamente y, si no, mediante **`heic-to`** (`import('heic-to/next')`, paquete instalado en `package.json`). Los PDFs pasan intactos.
- **Previsualización local y almacenamiento privado:** las vistas previas locales antes de subir usan `URL.createObjectURL` validado por `parseSafeDownloadUrl` (`lib/utils/safe-download.ts`: solo `https:` y `blob:` same-origin). Todos los archivos en Firebase Storage son privados (`storage.rules`) y solo se visualizan/descargan mediante URLs firmadas temporales generadas desde el servidor (15 min / `900s` para comprobantes de servicios y préstamos; 60 min / `3600s` para fotos de contactos).
- **Visor de PDF compartido:** `shared/components/PdfCanvasViewer.tsx` renderiza cada página en `<canvas>` con `pdfjs-dist` (`pdfjs-dist/legacy/build/pdf.mjs`, `ResizeObserver`, ajuste Retina y tope de píxeles seguro para iOS Safari). **Prohibido** usar `<iframe>`, `<embed>` u `<object>` para mostrar PDFs por incompatibilidad en iOS/Android.
- **Identidad visual (favicon):** la convención objetivo es usar favicon vectorial en `app/icon.svg` y eliminar el `app/favicon.ico` genérico _(nota de auditoría: actualmente `app/favicon.ico` aún existe en el árbol y `app/icon.svg` está pendiente de añadirse; al migrar, actualizar también el matcher de `proxy.ts` si aplica)_.

## Convenciones

- **Gitflow:** `main` protegido (solo PR), `develop` como integración, `feature/*` → PR a `develop`. Nunca commitear directo en `main` ni `develop`.
- **Commits** convencionales en inglés: `feat(...)`, `fix(...)`, `chore(...)`, `test(...)`, `docs(...)`.
- **Prettier:** `semi: false`, `singleQuote: true`, `trailingComma: "es5"`. Correr `pnpm format` antes de commitear.
- **ESLint (`react-hooks/set-state-in-effect`):** prohibido `setState` síncrono en el cuerpo de un `useEffect`. Usar `useSyncExternalStore` (ej. `hooks/use-mobile.ts`) o derivación/ajuste durante el render (ej. `components/chart-area-interactive.tsx`).
- **Tests:** Vitest (`vitest.config.mts`) con entorno `node` por defecto, `setupFiles: ['./tests/setup.ts']` y alias `server-only` → `tests/helpers/server-only.ts`. Tests de componentes con `// @vitest-environment jsdom`. Mockear Firebase con `vi.hoisted` (ver `tests/session-route.test.ts` y `tests/loans-application.test.ts`).

## Seguridad

- `.env.local` está ignorado; el único archivo de entorno versionado es `.env.example`. Nunca commitear credenciales ni loguear tokens.
- La whitelist (`allowedEmails/{email}` con `active === true`) se exige en el servidor (`/api/auth/session`); los clientes nunca tienen acceso de escritura a `allowedEmails` ni lectura/escritura a `loginLogs`.
- Toda URL antes de renderizarse en previsualizaciones o descargas debe pasar por `parseSafeDownloadUrl` / `triggerSafeFileDownload` (`lib/utils/safe-download.ts`).
- Los documentos en Firestore y objetos en Storage están aislados por `userId` tanto en los casos de uso/repositorios como en `firestore.rules` y `storage.rules`.

## Gotchas

- El bloque `nextjs-agent-rules` al inicio de este archivo lo gestiona `next dev`: no editar su contenido ni sus markers; el resto del archivo es libre.
- No commitear `.env*` (excepto `.env.example`), `.next/` ni artefactos de build.
- Desplegar `firestore.rules`, `firestore.indexes.json` y `storage.rules` en Firebase cuando cambien políticas o consultas compuestas, y verificar que cada documento en `allowedEmails` tenga `active: true`.
