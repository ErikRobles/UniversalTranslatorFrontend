import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { App } from '../app/App'

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const baseView = {
  session_id: 'session-1',
  session_status: 'active',
  backend_state: 'awaiting_speaker',
  current_turn_speaker: 'A',
  can_submit_turn: true,
  current_direction: {
    source_speaker_role: 'A',
    target_speaker_role: 'B',
    source_profile_id: 'lp-es',
    target_profile_id: 'lp-en',
    source_locale_code: 'es-MX',
    target_locale_code: 'en-US',
    source_display_name: 'Spanish (Mexico)',
    target_display_name: 'English (US)',
  },
  speaker_a_profile_id: 'lp-es',
  speaker_b_profile_id: 'lp-en',
  transcript: [],
} as const

describe('SessionPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('universal_translator_translation_disclaimer_ack:user-1', 'true')
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('renders transcript and explicit failure state from backend conversation view', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (url.includes('/auth/login')) {
        return jsonResponse({
          access_token: 'token-1',
          user: { id: 'user-1', email: body.email, role: 'standard_user' },
        })
      }
      if (url.includes('/users/me')) {
        return jsonResponse({ id: 'user-1', email: 'speaker@example.com', role: 'standard_user' })
      }
      if (url.includes('/admin/language-config')) {
        return jsonResponse([], 403)
      }
      if (url.endsWith('/sessions') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-1' }, 201)
      }
      if (url.endsWith('/sessions/session-1/start') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-1', status: 'ready' })
      }
      if (url.includes('/conversation-view')) {
        return jsonResponse({
          ...baseView,
          backend_state: 'low_confidence',
          transcript: [
            {
              interaction_id: 'interaction-1',
              interaction_sequence: 1,
              content_id: 'content-1',
              content_sequence: 1,
              speaker_role: 'A',
              source_text: 'hola mundo',
              content_status: 'finalized',
              interpretation_id: 'attempt-1',
              interpretation_status: 'low_confidence',
              interpretation_result_type: 'low_confidence',
              interpreted_text: null,
              playback_status: null,
              created_at: '2026-04-09T00:00:00Z',
              completed_at: '2026-04-09T00:00:02Z',
            },
          ],
        })
      }
      return jsonResponse({ detail: 'unexpected_request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'speaker@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
      expect(screen.getByText(/speaker@example.com/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /start conversation/i }))

    await waitFor(() => {
      expect(within(screen.getByLabelText(/conversation state/i)).getByText(/not sure, please repeat/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/hola mundo/i)).toBeInTheDocument()
    expect(screen.getByText(/no interpreted output recorded/i)).toBeInTheDocument()
    expect(screen.getByText(/interpretation: low_confidence/i)).toBeInTheDocument()
  })

  it('loads a session into the authenticated workspace', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : {}

      if (url.includes('/auth/login')) {
        return jsonResponse({
          access_token: 'token-1',
          user: { id: 'user-1', email: body.email, role: 'standard_user' },
        })
      }

      if (url.includes('/users/me')) {
        return jsonResponse({ id: 'user-1', email: 'speaker@example.com', role: 'standard_user' })
      }

      if (url.includes('/admin/language-config')) {
        return jsonResponse([], 403)
      }

      if (url.endsWith('/sessions') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-1' }, 201)
      }

      if (url.endsWith('/sessions/session-1/start') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-1', status: 'ready' })
      }

      if (url.includes('/conversation-view')) {
        return jsonResponse(baseView)
      }

      return jsonResponse({ detail: 'unexpected' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'speaker@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => {
      expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /start conversation/i }))

    await waitFor(() => {
      expect(screen.getByText(/your turn to speak/i)).toBeInTheDocument()
    })
  })

  it('creates a session using the selected speaker language profiles', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input)

      if (url.includes('/auth/login')) {
        return jsonResponse({
          access_token: 'token-1',
          user: { id: 'user-1', email: 'speaker@example.com', role: 'standard_user' },
        })
      }

      if (url.includes('/users/me')) {
        return jsonResponse({ id: 'user-1', email: 'speaker@example.com', role: 'standard_user' })
      }

      if (url.includes('/admin/language-config/profiles')) {
        return jsonResponse([
          { id: 'lp-es-mx', display_name: 'Spanish (Mexico)', locale_code: 'es-MX', is_active: true },
          { id: 'lp-en-us', display_name: 'English (US)', locale_code: 'en-US', is_active: true },
          { id: 'lp-en-gb', display_name: 'English (UK)', locale_code: 'en-GB', is_active: true },
          { id: 'lp-zh-cn', display_name: 'Mandarin Chinese (Mainland)', locale_code: 'zh-CN', is_active: true },
        ])
      }

      if (url.includes('/admin/language-config/pairs')) {
        return jsonResponse([
          { source_profile_id: 'lp-es-mx', target_profile_id: 'lp-en-us', is_active: true },
          { source_profile_id: 'lp-es-mx', target_profile_id: 'lp-en-gb', is_active: true },
          { source_profile_id: 'lp-zh-cn', target_profile_id: 'lp-en-us', is_active: true },
        ])
      }

      if (url.endsWith('/sessions') && init?.method === 'POST') {
        expect(init.body).toBe(JSON.stringify({
          speaker_a_profile_id: 'lp-zh-cn',
          speaker_b_profile_id: 'lp-en-us',
        }))
        return jsonResponse({ id: 'session-2' }, 201)
      }

      if (url.endsWith('/sessions/session-2/start') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-2', status: 'ready' })
      }

      if (url.includes('/sessions/session-2/conversation-view')) {
        return jsonResponse({
          ...baseView,
          session_id: 'session-2',
          current_direction: {
            ...baseView.current_direction,
            source_profile_id: 'lp-zh-cn',
            source_locale_code: 'zh-CN',
            source_display_name: 'Mandarin Chinese (Mainland)',
          },
          speaker_a_profile_id: 'lp-zh-cn',
          speaker_b_profile_id: 'lp-en-us',
        })
      }

      return jsonResponse({ detail: 'unexpected_request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'speaker@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
      expect(screen.getByText(/speaker@example.com/i)).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/speaker a language/i), 'lp-zh-cn')
    await user.selectOptions(screen.getByLabelText(/speaker b language/i), 'lp-en-us')
    await user.click(screen.getByRole('button', { name: /start conversation/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/sessions'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('keeps US English directly available in Speaker A options', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = String(input)

      if (url.includes('/auth/login')) {
        return jsonResponse({
          access_token: 'token-1',
          user: { id: 'user-1', email: 'speaker@example.com', role: 'standard_user' },
        })
      }

      if (url.includes('/users/me')) {
        return jsonResponse({ id: 'user-1', email: 'speaker@example.com', role: 'standard_user' })
      }

      if (url.includes('/admin/language-config/profiles')) {
        return jsonResponse([
          { id: 'lp-es-mx', display_name: 'Spanish (Mexico)', locale_code: 'es-MX', is_active: true },
          { id: 'lp-en-us', display_name: 'English (US)', locale_code: 'en-US', is_active: true },
          { id: 'lp-en-gb', display_name: 'English (UK)', locale_code: 'en-GB', is_active: true },
        ])
      }

      if (url.includes('/admin/language-config/pairs')) {
        return jsonResponse([
          { source_profile_id: 'lp-es-mx', target_profile_id: 'lp-en-us', is_active: true },
          { source_profile_id: 'lp-es-mx', target_profile_id: 'lp-en-gb', is_active: true },
          { source_profile_id: 'lp-en-us', target_profile_id: 'lp-es-mx', is_active: true },
        ])
      }

      return jsonResponse({ detail: 'unexpected_request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'speaker@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
      expect(screen.getByText(/speaker@example.com/i)).toBeInTheDocument()
    })

    const speakerA = screen.getByLabelText(/speaker a language/i)
    expect(within(speakerA).getByRole('option', { name: /english \(us\)/i })).toBeInTheDocument()
  })

  it('returns to setup after an ended session so a new conversation can be started', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input)

      if (url.includes('/auth/login')) {
        return jsonResponse({
          access_token: 'token-1',
          user: { id: 'user-1', email: 'speaker@example.com', role: 'standard_user' },
        })
      }

      if (url.includes('/users/me')) {
        return jsonResponse({ id: 'user-1', email: 'speaker@example.com', role: 'standard_user' })
      }

      if (url.includes('/admin/language-config/profiles')) {
        return jsonResponse([
          { id: 'lp-es-mx', display_name: 'Spanish (Mexico)', locale_code: 'es-MX', is_active: true },
          { id: 'lp-en-us', display_name: 'English (US)', locale_code: 'en-US', is_active: true },
        ])
      }

      if (url.includes('/admin/language-config/pairs')) {
        return jsonResponse([
          { source_profile_id: 'lp-es-mx', target_profile_id: 'lp-en-us', is_active: true },
          { source_profile_id: 'lp-en-us', target_profile_id: 'lp-es-mx', is_active: true },
        ])
      }

      if (url.endsWith('/sessions') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-ended' }, 201)
      }

      if (url.endsWith('/sessions/session-ended/start') && init?.method === 'POST') {
        return jsonResponse({ id: 'session-ended', status: 'ready' })
      }

      if (url.includes('/sessions/session-ended/conversation-view')) {
        return jsonResponse({
          ...baseView,
          session_id: 'session-ended',
          session_status: 'ended',
          backend_state: 'awaiting_speaker',
          can_submit_turn: false,
        })
      }

      return jsonResponse({ detail: 'unexpected_request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/email/i), 'speaker@example.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText(/signed in as:/i)).toBeInTheDocument()
      expect(screen.getByText(/speaker@example.com/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /start conversation/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start new conversation/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /start new conversation/i }))

    expect(screen.getByLabelText(/speaker a language/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/speaker b language/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^start conversation$/i })).toBeInTheDocument()
  })
})
