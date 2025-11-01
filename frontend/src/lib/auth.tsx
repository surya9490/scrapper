'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSession, signIn, signOut, SessionProvider } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { User, AuthContextType, ApiResponse } from '@/types/auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthProviderInner>{children}</AuthProviderInner>
    </SessionProvider>
  )
}

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(status === 'loading')
  }, [status])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true)
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.ok && !result.error) {
        router.push('/dashboard')
        return true
      } else {
        console.error('Login failed:', result?.error)
        return false
      }
    } catch (error) {
      console.error('Login error:', error)
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await signOut({ redirect: false })
      router.push('/auth/signin')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const register = async (email: string, password: string, username: string): Promise<boolean> => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          username,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // After successful registration, automatically log in
        return await login(email, password)
      } else {
        console.error('Registration failed:', data.message)
        return false
      }
    } catch (error) {
      console.error('Registration error:', error)
      return false
    } finally {
      setLoading(false)
    }
  }

  const value: AuthContextType = {
    user: session?.user ? {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role as 'admin' | 'user',
    } : null,
    loading,
    login,
    logout,
    register,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useRequireAuth() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin')
    }
  }, [user, loading, router])

  return { user, loading }
}