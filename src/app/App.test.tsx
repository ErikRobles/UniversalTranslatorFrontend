import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { App } from './App'
import { ConversationView } from '../components/ConversationView'

function mockAuthFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : {}

      if (url.includes('/auth/login')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'login-token',
              user: { id: 'user-1', email: body.email, role: 'standard_user' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (url.includes('/auth/register')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'register-token',
              user: { id: 'user-2', email: body.email, role: 'standard_user' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (url.includes('/billing/create-subscription')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ approval_url: 'https://www.paypal.com/checkoutnow?token=sub-123', subscription_id: 'sub-123', correlation_id: 'corr-123' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (url.includes('/users/me')) {
        const authorization = init?.headers instanceof Headers
          ? init.headers.get('Authorization')
          : (init?.headers as Record<string, string> | undefined)?.Authorization
        const email = authorization?.includes('register-token') ? 'newuser@example.com' : 'person@example.com'
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'user-1', email, role: 'standard_user' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (url.includes('/admin/language-config')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 403, headers: { 'Content-Type': 'application/json' } }))
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }),
  )
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('renders the public landing page marketing sections without the workspace', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /speak naturally\. be understood\./i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /smoother multilingual conversations/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /from setup to translated speech/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /pick a plan when you're ready/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /mobile apps/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /buy with paypal/i })).toHaveLength(3)
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /^terms$/i })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: /cookies/i })).toHaveAttribute('href', '/cookies')
    expect(screen.queryByRole('heading', { name: /interpreter workspace/i })).not.toBeInTheDocument()
  })

  it('renders legal pages from simple path routing', () => {
    window.history.pushState({}, '', '/privacy')
    const { unmount } = render(<App />)

    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /audio handling/i })).toBeInTheDocument()
    unmount()

    window.history.pushState({}, '', '/terms')
    const termsView = render(<App />)
    expect(screen.getByRole('heading', { name: /terms & conditions/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /disclaimer of warranties and liability/i })).toBeInTheDocument()
    expect(screen.getByText(/translations may contain errors, omissions, or misinterpretations/i)).toBeInTheDocument()
    termsView.unmount()

    window.history.pushState({}, '', '/cookies')
    render(<App />)
    expect(screen.getByRole('heading', { name: /cookies policy/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /session and authentication/i })).toBeInTheDocument()
  })

  it('starts signed-in PayPal checkout in a new tab without navigating the current page', async () => {
    mockAuthFetch()
    const checkoutWindow = { location: { href: 'about:blank' }, close: vi.fn(), opener: {} }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(checkoutWindow as unknown as Window)
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'person@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /interpreter workspace/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /landing page/i }))
    const starterCard = screen.getByRole('heading', { name: 'Starter' }).closest('.pricing-card')
    expect(starterCard).not.toBeNull()

    await user.click(within(starterCard as HTMLElement).getByRole('button', { name: /buy with paypal/i }))

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() => {
      expect(checkoutWindow.location.href).toBe('https://www.paypal.com/checkoutnow?token=sub-123')
    })
    expect(window.location.pathname).toBe('/')
    expect(checkoutWindow.close).not.toHaveBeenCalled()
  })

  it('cleans up the new checkout tab and shows an error when backend initiation fails', async () => {
    mockAuthFetch()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation((input, init) => {
      const url = String(input)
      if (url.includes('/billing/create-subscription')) {
        return Promise.resolve(new Response(JSON.stringify({ detail: 'failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } }))
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (url.includes('/auth/login')) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'login-token', user: { id: 'user-1', email: body.email, role: 'standard_user' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }
      if (url.includes('/users/me')) {
        return Promise.resolve(new Response(JSON.stringify({ id: 'user-1', email: 'person@example.com', role: 'standard_user' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }
      if (url.includes('/admin/language-config')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 403, headers: { 'Content-Type': 'application/json' } }))
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    const checkoutWindow = { location: { href: 'about:blank' }, close: vi.fn(), opener: {} }
    vi.spyOn(window, 'open').mockReturnValue(checkoutWindow as unknown as Window)
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'person@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /interpreter workspace/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /landing page/i }))
    const proCard = screen.getByRole('heading', { name: 'Pro' }).closest('.pricing-card')
    expect(proCard).not.toBeNull()
    await user.click(within(proCard as HTMLElement).getByRole('button', { name: /buy with paypal/i }))

    await waitFor(() => {
      expect(checkoutWindow.close).toHaveBeenCalled()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/paypal checkout could not be started/i)
    expect(window.location.pathname).toBe('/')
  })

  it('prompts anonymous users to sign in before subscription checkout', async () => {
    const openSpy = vi.spyOn(window, 'open')
    const user = userEvent.setup()
    render(<App />)

    const teamCard = screen.getByRole('heading', { name: 'Team' }).closest('.pricing-card')
    expect(teamCard).not.toBeNull()
    await user.click(within(teamCard as HTMLElement).getByRole('button', { name: /buy with paypal/i }))

    expect(openSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/please sign in/i)
    expect(screen.getByRole('form', { name: /welcome back/i })).toBeInTheDocument()
  })

  it('keeps unauthenticated users on the landing page instead of the workspace', () => {
    render(<App />)

    expect(screen.getByRole('form', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/turn composer/i)).not.toBeInTheDocument()
  })

  it('toggles the theme state', async () => {
    const user = userEvent.setup()
    render(<App />)

    const shell = screen.getByText(/universal translator/i).closest('.app-shell')
    const button = screen.getByRole('button', { name: /activate dark mode/i })

    expect(shell).toHaveAttribute('data-theme', 'light')
    await user.click(button)
    expect(shell).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('button', { name: /activate light mode/i })).toBeInTheDocument()
  })

  it('routes successful registration to the authenticated workspace', async () => {
    mockAuthFetch()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /register/i }))
    await user.type(screen.getByLabelText(/email/i), 'newuser@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByLabelText(/i agree to the/i))
    const registerForm = screen.getByRole('form', { name: /create your account/i })
    await user.click(within(registerForm).getByRole('button', { name: /^register$/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /interpreter workspace/i })).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText(/i understand that translations may not be accurate/i))
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
    expect(screen.getByText(/newuser@example.com/i)).toBeInTheDocument()
  })

  it('blocks registration until the legal acknowledgment checkbox is checked', async () => {
    mockAuthFetch()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /register/i }))
    await user.type(screen.getByLabelText(/email/i), 'newuser@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    const registerForm = screen.getByRole('form', { name: /create your account/i })
    await user.click(within(registerForm).getByRole('button', { name: /^register$/i }))

    expect(screen.getByText(/you must agree to the terms & conditions and privacy policy/i)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/auth/register'), expect.anything())
    expect(screen.queryByRole('heading', { name: /interpreter workspace/i })).not.toBeInTheDocument()
  })

  it('routes successful login to the authenticated workspace', async () => {
    mockAuthFetch()
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'person@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /interpreter workspace/i })).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText(/i understand that translations may not be accurate/i))
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
    expect(screen.getByText(/person@example.com/i)).toBeInTheDocument()
  })

  it('blocks workspace entry until the translation disclaimer is acknowledged', async () => {
    mockAuthFetch()
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'person@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /translation accuracy acknowledgment/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/signed in as:/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled()

    await user.click(screen.getByLabelText(/i understand that translations may not be accurate/i))
    await user.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
    expect(screen.getByText(/person@example.com/i)).toBeInTheDocument()
  })

  it('shows the upgrade popup from the existing usage-limit signal', () => {
    render(
      <ConversationView
        conversationView={null}
        uiState="waiting_to_start"
        participantRole="A"
        isLoading={false}
        errorMessage={null}
        onSubmitTurn={vi.fn()}
        onAdvanceTurn={vi.fn()}
        onEndConversation={vi.fn()}
        onNewConversation={vi.fn()}
        usageLimitReached={true}
      />,
    )

    expect(screen.getByRole('dialog', { name: /you've reached your free limit/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute('href', '/#pricing')
  })

  it('restores authenticated workspace state from persistent storage on app load', async () => {
    window.history.pushState({}, '', '/workspace')
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = String(input)
        if (url.includes('/billing/create-subscription')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ approval_url: 'https://www.paypal.com/checkoutnow?token=sub-123', subscription_id: 'sub-123', correlation_id: 'corr-123' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (url.includes('/users/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: 'user-1', email: 'persisted@example.com', role: 'standard_user' }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        )
      }),
    )

    window.localStorage.setItem(
      'universal_translator_auth',
      JSON.stringify({
        status: 'authenticated',
        user: { id: 'user-1', email: 'persisted@example.com', role: 'standard_user' },
        accessToken: 'stored-token',
      }),
    )
    window.localStorage.setItem('universal_translator_translation_disclaimer_ack:user-1', 'true')

    render(<App />)

    expect(screen.getByRole('heading', { name: /interpreter workspace/i })).toBeInTheDocument()
    expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
    expect(screen.getByText(/persisted@example.com/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('clears stored authenticated state when the persisted access token is invalid', async () => {
    window.history.pushState({}, '', '/workspace')
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: 'Invalid access token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )

    window.localStorage.setItem(
      'universal_translator_auth',
      JSON.stringify({
        status: 'authenticated',
        user: { id: 'user-1', email: 'persisted@example.com', role: 'standard_user' },
        accessToken: 'stale-token',
      }),
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/please sign in to access this area/i)).toBeInTheDocument()
    })
    expect(window.localStorage.getItem('universal_translator_auth')).toBeNull()
  })
})
