import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

import Login          from './pages/Login'
import Register       from './pages/Register'
import Dashboard      from './pages/Dashboard'
import Bills          from './pages/Bills'
import Predictions    from './pages/Predictions'
import Budget         from './pages/Budget'
import Appliances     from './pages/Appliances'
import Recommendations from './pages/Recommendations'
import IoT            from './pages/IoT'
import Notifications  from './pages/Notifications'
import Profile        from './pages/Profile'

const Wrap = ({ children }) => (
  <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>
)

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/"               element={<Wrap><Dashboard /></Wrap>} />
          <Route path="/bills"          element={<Wrap><Bills /></Wrap>} />
          <Route path="/predictions"    element={<Wrap><Predictions /></Wrap>} />
          <Route path="/budget"         element={<Wrap><Budget /></Wrap>} />
          <Route path="/appliances"     element={<Wrap><Appliances /></Wrap>} />
          <Route path="/recommendations"element={<Wrap><Recommendations /></Wrap>} />
          <Route path="/iot"            element={<Wrap><IoT /></Wrap>} />
          <Route path="/notifications"  element={<Wrap><Notifications /></Wrap>} />
          <Route path="/profile"        element={<Wrap><Profile /></Wrap>} />
          {/* /ocr is no longer a nav item — Profile has Re-scan Bill instead */}
          <Route path="/ocr"            element={<Navigate to="/profile" replace />} />
          <Route path="/chatbot"        element={<Navigate to="/recommendations" replace />} />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
