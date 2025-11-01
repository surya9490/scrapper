// Authentication related types

export interface User {
  id: string
  email: string
  username: string
  role: 'admin' | 'user'
  createdAt?: string
  updatedAt?: string
}

export interface AuthResponse {
  success: boolean
  message: string
  data?: {
    user: User
    token: string
  }
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  username: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, username: string) => Promise<boolean>
  logout: () => Promise<void>
}

export interface AuthError {
  message: string
  code?: string
  field?: string
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: AuthError
}

// Form validation types
export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

// Password reset types
export interface ResetTokenVerification {
  valid: boolean
  message: string
}