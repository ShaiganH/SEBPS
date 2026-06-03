import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  LayoutDashboard, FileText, TrendingUp, Wallet, User,
} from 'lucide-react'
import OnboardingModal from './OnboardingModal'

const NAV = [
  { to: '/',            icon: LayoutDashboard, label: 'Home'        },
  { to: '/bills',       icon: FileText,        label: 'Bills'       },
  { to: '/predictions', icon: TrendingUp,      label: 'Predictions' },
  { to: '/budget',      icon: Wallet,          label: 'Budget'      },
  { to: '/profile',     icon: User,            label: 'Profile'     },
]

export default function Layout({ children }) {
  const { needsOnboarding, completeOnboarding } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const fetch = () =>
      api.get('/notifications/unread/')
        .then(r => setUnread(r.data.unread_count || 0))
        .catch(() => {})
    fetch()
    const t = setInterval(fetch, 30_000)
    return () => clearInterval(t)
  }, [])

  const handleOnboardingComplete = () => {
    completeOnboarding()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Onboarding modal — blocks until setup complete ── */}
      {needsOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      {/* ── Main content ── */}
      <main className="max-w-4xl mx-auto px-4 pt-6 pb-24">
        {children}
      </main>

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_30px_rgba(0,0,0,0.07)]">
        <div className="flex items-stretch h-16 max-w-lg mx-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 relative
                 transition-colors duration-200 cursor-pointer
                 ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Notification dot on Profile */}
                  {label === 'Profile' && unread > 0 && (
                    <span
                      className="absolute top-2.5 right-[calc(50%-10px)] w-2 h-2 bg-red-500 rounded-full
                                 ring-2 ring-white animate-pulse"
                    />
                  )}

                  {/* Active pill indicator at top */}
                  <span
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-blue-600
                                transition-all duration-300 ease-out
                                ${isActive ? 'w-8 opacity-100' : 'w-0 opacity-0'}`}
                  />

                  {/* Icon */}
                  <span className={`transition-all duration-200 ${isActive ? '-translate-y-0.5 scale-110' : 'scale-100'}`}>
                    <Icon size={21} strokeWidth={isActive ? 2.2 : 1.7} />
                  </span>

                  {/* Label */}
                  <span className={`text-[10px] font-medium tracking-wide transition-all duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-50'
                  }`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
