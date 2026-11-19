// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  logoutAction: vi.fn(),
}))

vi.mock('@/features/auth/presentation/actions/auth.actions', () => ({
  logoutAction: mocks.logoutAction,
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
  await u.click(await screen.findByRole('menuitem', { name: /cerrar sesión/i }))
  return u
}

afterEach(() => {
  cleanup()
})

describe('NavUser logout confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.logoutAction.mockResolvedValue(undefined)
  })

  it('asks for confirmation before logging out', async () => {
    renderNavUser()

    const u = await openLogoutDialog()

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('¿Cerrar sesión?')).toBeTruthy()
    expect(mocks.logoutAction).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: /cancelar/i }))
  })

  it('keeps the session when the user cancels', async () => {
    renderNavUser()

    const u = await openLogoutDialog()
    await u.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.logoutAction).not.toHaveBeenCalled()
  })

  it('invokes logoutAction when the user confirms', async () => {
    renderNavUser()

    const u = await openLogoutDialog()
    await u.click(screen.getByRole('button', { name: /^cerrar sesión$/i }))

    await waitFor(() => expect(mocks.logoutAction).toHaveBeenCalledTimes(1))
  })
})
