import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  LayoutDashboard, FileText, TrendingUp, Wallet,
  Zap, Lightbulb, Cpu, User,
} from 'lucide-react'
import OnboardingModal from './OnboardingModal'

const NAV = [
  { to: '/',                icon: LayoutDashboard, label: 'Home'            },
  { to: '/bills',           icon: FileText,        label: 'Bills'           },
  { to: '/predictions',     icon: TrendingUp,      label: 'Predictions'     },
  { to: '/budget',          icon: Wallet,          label: 'Budget'          },
  { to: '/appliances',      icon: Zap,             label: 'Appliances'      },
  { to: '/recommendations', icon: Lightbulb,       label: 'Advisor'         },
  { to: '/iot',             icon: Cpu,             label: 'IoT'             },
  { to: '/profile',         icon: User,            label: 'Profile'         },
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Onboarding modal — blocks until LESCO setup is complete */}
      {needsOnboarding && (
        <OnboardingModal onComplete={completeOnboarding} />
      )}

      {/* Page content — extra bottom padding clears the nav bar */}
      <main className="max-w-4xl mx-auto px-4 pt-6 pb-24">
        {children}
      </main>

      {/* ── Bottom Navigation ─────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_30px_rgba(0,0,0,0.07)]">
        <div className="flex items-stretch h-[58px] max-w-2xl mx-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center relative
                 transition-colors duration-200
                 ${isActive ? 'text-black' : 'text-slate-400 hover:text-slate-600'}`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Notification badge on Profile */}
                  {label === 'Profile' && unread > 0 && (
                    <span className="absolute top-2 right-[calc(50%-14px)] w-[7px] h-[7px] bg-red-500 rounded-full ring-[1.5px] ring-white" />
                  )}

                  {/* Top-edge active indicator */}
                  <span
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full bg-black
                                transition-all duration-300 ease-out
                                ${isActive ? 'w-6 opacity-100' : 'w-0 opacity-0'}`}
                  />

                  {/* Icon — lifts up on active */}
                  <span className={`transition-all duration-200 leading-none
                    ${isActive ? '-translate-y-0.5' : ''}`}
                  >
                    <Icon
                      size={isActive ? 20 : 18}
                      strokeWidth={isActive ? 2.2 : 1.7}
                    />
                  </span>

                  {/* Label — only rendered when active to keep items compact */}
                  <span
                    className={`text-[9px] font-semibold tracking-wide leading-none mt-0.5
                                transition-all duration-200
                                ${isActive ? 'opacity-100 max-h-4' : 'opacity-0 max-h-0 overflow-hidden'}`}
                  >
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
