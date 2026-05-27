import { useState, useEffect } from 'react'
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  LayoutDashboard, FileText, ScanLine, TrendingUp, Wallet,
  Zap, Lightbulb, Cpu, Bell, LogOut,
  ChevronLeft, ChevronRight, User, Menu, X, Settings,
} from 'lucide-react'

const NAV = [
  { to: '/',                icon: LayoutDashboard, label: 'Dashboard'       },
  { to: '/bills',           icon: FileText,        label: 'Bills'           },
  { to: '/ocr',             icon: ScanLine,        label: 'OCR Scan'        },
  { to: '/predictions',     icon: TrendingUp,      label: 'Predictions'     },
  { to: '/budget',          icon: Wallet,          label: 'Budget'          },
  { to: '/appliances',      icon: Zap,             label: 'Appliances'      },
  { to: '/recommendations', icon: Lightbulb,       label: 'Recommendations' },
  { to: '/iot',             icon: Cpu,             label: 'IoT Devices'     },
  { to: '/notifications',   icon: Bell,            label: 'Notifications'   },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [collapsed,  setCollapsed]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread,     setUnread]     = useState(0)

  // Close mobile drawer whenever the route changes
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    const fetchUnread = () =>
      api.get('/notifications/unread/')
        .then(r => setUnread(r.data.unread_count || 0))
        .catch(() => {})
    fetchUnread()
    const t = setInterval(fetchUnread, 30_000)
    return () => clearInterval(t)
  }, [])

  const handleLogout = async () => { await logout(); navigate('/login') }

  const sidebarWidth = collapsed ? 'md:w-[60px]' : 'md:w-56'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* ── Mobile top bar (hidden on md+) ──────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white border-b border-slate-100 flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap size={13} className="text-white" />
          </div>
          <span className="font-bold text-slate-900 text-sm">SEBPS</span>
        </div>
        {unread > 0 && (
          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </div>

      {/* ── Mobile backdrop ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 md:z-auto
          flex flex-col bg-white border-r border-slate-100 h-full flex-shrink-0
          transition-transform md:transition-[width] duration-200 ease-in-out
          w-60 ${sidebarWidth}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* ── Logo — mobile layout ── */}
        <div className="md:hidden flex items-center gap-2.5 h-16 px-4 border-b border-slate-100">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-none">SEBPS</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Smart Bill Prediction</p>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Logo — desktop layout ── */}
        <div className={`hidden md:flex items-center border-b border-slate-100 h-16 ${
          collapsed ? 'justify-center px-3' : 'justify-between px-5'
        }`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap size={15} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm leading-none">SEBPS</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Smart Bill Prediction</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(p => !p)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }
                ${collapsed ? 'md:justify-center md:px-2 md:gap-0' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative flex-shrink-0">
                    <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                    {label === 'Notifications' && unread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── User + logout ── */}
        <div className="border-t border-slate-100 p-2">
          {/* User avatar row — click to go to Profile */}
          <Link
            to="/profile"
            title={collapsed ? 'Profile & Settings' : undefined}
            className={`flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-xl hover:bg-slate-50 transition-colors ${
              collapsed ? 'md:justify-center md:px-2' : ''
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <User size={13} className="text-white" />
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
              <p className="text-xs font-semibold text-slate-900 truncate">{user?.username}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
            </div>
            <Settings size={12} className={`text-slate-300 flex-shrink-0 ${collapsed ? 'md:hidden' : ''}`} />
          </Link>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors ${
              collapsed ? 'md:justify-center md:px-0 md:gap-0' : ''
            }`}
          >
            <LogOut size={17} strokeWidth={1.8} />
            <span className={collapsed ? 'md:hidden' : ''}>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
