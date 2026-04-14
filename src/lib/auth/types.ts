export type UserRole = 'admin' | 'standard_user' | 'enterprise_owner' | 'operator_support'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  subscription_status?: string
  subscription_plan?: string | null
  paypal_subscription_id?: string | null
}

export interface AuthState {
  status: 'anonymous' | 'authenticated'
  user: AuthUser | null
  accessToken: string | null
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {}
