import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('access')
    if (token) {
      api.get('/auth/me/')
        .then(r => {
          setUser(r.data)
          if (localStorage.getItem('show_onboarding') === '1') {
            setNeedsOnboarding(true)
          }
        })
        .catch(() => { localStorage.clear(); setUser(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login/', { email, password })
    localStorage.setItem('access',  data.access)
    localStorage.setItem('refresh', data.refresh)
    setUser(data.user)
    return data
  }

  const register = async (fields) => {
    const { data } = await api.post('/auth/register/', fields)
    localStorage.setItem('access',        data.access)
    localStorage.setItem('refresh',       data.refresh)
    localStorage.setItem('show_onboarding', '1')
    setUser(data.user)
    setNeedsOnboarding(true)
    return data
  }

  const logout = async () => {
    try { await api.post('/auth/logout/', { refresh: localStorage.getItem('refresh') }) } catch {}
    localStorage.clear()
    setUser(null)
    setNeedsOnboarding(false)
  }

  const refreshUser = async () => {
    const { data } = await api.get('/auth/me/')
    setUser(data)
  }

  const completeOnboarding = () => {
    localStorage.removeItem('show_onboarding')
    localStorage.setItem('welcome_message', '1')
    setNeedsOnboarding(false)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout, refreshUser,
      needsOnboarding, setNeedsOnboarding, completeOnboarding,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
