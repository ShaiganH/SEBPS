import { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem('access').then(token => {
      if (token) {
        api.get('/auth/me/')
          .then(r => setUser(r.data))
          .catch(() => AsyncStorage.clear())
          .finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login/', { email, password })
    await AsyncStorage.setItem('access',  data.access)
    await AsyncStorage.setItem('refresh', data.refresh)
    setUser(data.user)
    return data
  }

  const register = async (fields) => {
    const { data } = await api.post('/auth/register/', fields)
    await AsyncStorage.setItem('access',  data.access)
    await AsyncStorage.setItem('refresh', data.refresh)
    setUser(data.user)
    return data
  }

  const logout = async () => {
    try {
      const refresh = await AsyncStorage.getItem('refresh')
      await api.post('/auth/logout/', { refresh })
    } catch {}
    await AsyncStorage.clear()
    setUser(null)
  }

  const refreshUser = async () => {
    const { data } = await api.get('/auth/me/')
    setUser(data)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
