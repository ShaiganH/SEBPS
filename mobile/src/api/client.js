import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Backend URL resolution (priority order) ───────────────────────────────────
// 1. EXPO_PUBLIC_API_URL  — set automatically by Docker Compose via HOST_IP in root .env
// 2. Hardcoded LAN IP     — fallback for plain local dev without Docker
//
// To override without Docker, create mobile/.env:
//   EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8000/api/v1
//   EXPO_PUBLIC_WS_URL=ws://<your-LAN-IP>:8000
const _api = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.52:8000/api/v1'
const _ws  = process.env.EXPO_PUBLIC_WS_URL  || 'ws://192.168.1.52:8000'

export const API_BASE = _api
export const WS_BASE  = _ws

const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use(async cfg => {
  const token = await AsyncStorage.getItem('access')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res,
  async err => {
    const orig = err.config
    if (err.response?.status === 401 && !orig._retry) {
      orig._retry = true
      const refresh = await AsyncStorage.getItem('refresh')
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, { refresh })
          await AsyncStorage.setItem('access', data.access)
          if (data.refresh) await AsyncStorage.setItem('refresh', data.refresh)
          orig.headers.Authorization = `Bearer ${data.access}`
          return api(orig)
        } catch {
          await AsyncStorage.clear()
          // Navigation reset is handled by AuthContext listener
        }
      } else {
        await AsyncStorage.clear()
      }
    }
    return Promise.reject(err)
  }
)

export default api
