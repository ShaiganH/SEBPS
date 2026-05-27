import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Change this to your backend's LAN IP when testing on a real device ───────
// Android emulator:  http://10.0.2.2:8000
// iOS simulator:     http://localhost:8000
// Physical device:   http://<your-machine-LAN-IP>:8000
export const API_BASE = 'http://192.168.1.52:8000/api/v1'
export const WS_BASE  = 'ws://192.168.1.52:8000'

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
