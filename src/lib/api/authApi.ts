import type { LoginPayload, RegisterPayload } from '../auth/types'

export interface AuthApiResponse {
  access_token: string
  user: {
    id: string
    email: string
    role: 'admin' | 'standard_user' | 'enterprise_owner' | 'operator_support'
  }
}

export interface AuthApi {
  login: (payload: LoginPayload) => Promise<AuthApiResponse>
  register: (payload: RegisterPayload) => Promise<AuthApiResponse>
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1'

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'request_failed' }))
    throw new Error(error.detail ?? `request_failed_${response.status}`)
  }
  return response.json()
}

export const authApi: AuthApi = {
  async login(payload) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return handleResponse<AuthApiResponse>(response)
  },
  async register(payload) {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return handleResponse<AuthApiResponse>(response)
  },
}
