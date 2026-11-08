// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

import { NavUser } from '@/components/nav-user'
import { SidebarProvider } from '@/components/ui/sidebar'

const user = {
  name: 'Ana María Pérez',
  email: 'ana@example.com',
  avatar: '',
}

function renderNavUser() {
  return render(
    <SidebarProvider>
      <NavUser user={user} />
    </SidebarProvider>
  )
}

async function openLogoutDialog() {
  const u = userEvent.setup()
  await u.click(screen.getByRole('button', { name: /ana maría pérez/i }))
  await u.click(await screen.findByRole('menuitem', { name: /log out/i }))
  return u
}

afterEach(() => {
  cleanup()
})

describe('NavUser logout confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.fetch.mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mocks.fetch)
  })

  it('asks for confirmation before logging out', async () => {
    renderNavUser()

    const u = await openLogoutDialog()

    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('¿Cerrar sesión?')).toBeTruthy()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: /cancelar/i }))
  })

  it('keeps the session when the user cancels', async () => {
    renderNavUser()

    const u = await openLogoutDialog()
    await u.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('logs out and redirects to /login when the user confirms', async () => {
    renderNavUser()

    const u = await openLogoutDialog()
    await u.click(screen.getByRole('button', { name: /^cerrar sesión$/i }))

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
      })
    )
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
