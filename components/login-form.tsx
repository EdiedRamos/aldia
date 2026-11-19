'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'
import { signInWithPopup, signOut } from 'firebase/auth'
import { GalleryVerticalEndIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { auth, googleProvider } from '@/lib/firebase'
import { syncUserWithFirestore } from '@/lib/user-sync'

function getAuthErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Cancelaste el inicio de sesión.'
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana emergente. Permite las ventanas emergentes e inténtalo de nuevo.'
    case 'auth/network-request-failed':
      return 'Error de conexión. Revisa tu internet e inténtalo de nuevo.'
    default:
      return 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  }
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await signInWithPopup(auth, googleProvider)

      const sync = await syncUserWithFirestore(result.user)

      if (!sync.success) {
        setError(
          sync.reason === 'UNAUTHORIZED_EMAIL'
            ? 'Tu correo no está autorizado. Contacta al administrador.'
            : 'No se pudo sincronizar tu cuenta. Inténtalo de nuevo.'
        )
        return
      }

      const idToken = await result.user.getIdToken()

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        console.error('[/api/auth/session]', response.status, data)
        await signOut(auth)
        setError(
          response.status === 403
            ? 'Tu correo no está autorizado. Contacta al administrador.'
            : response.status === 500
              ? 'El servidor no está configurado correctamente.'
              : 'No se pudo iniciar sesión. Inténtalo de nuevo.'
        )
        return
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <a href="#" className="flex flex-col items-center gap-2 font-medium">
            <div className="flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEndIcon className="size-6" />
            </div>
            <span className="sr-only">Aldia</span>
          </a>
          <h1 className="text-xl font-bold">Bienvenido a aldia</h1>
        </div>
        <Field>
          <Button
            variant="outline"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path
                d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                fill="currentColor"
              />
            </svg>
            {isLoading ? 'Conectando...' : 'Continuar con Google'}
          </Button>
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
    </div>
  )
}
