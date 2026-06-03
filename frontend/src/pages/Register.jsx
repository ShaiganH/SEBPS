import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Mail, Lock, User, Eye, EyeOff } from 'lucide-react'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '', username: '', password: '', password2: '',
  })
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [showPw,  setShowPw]  = useState(false)
  const [showPw2, setShowPw2] = useState(false)

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async e => {
    e.preventDefault(); setError(''); setBusy(true)
    try { await register(form); navigate('/') }
    catch (err) {
      const d = err.response?.data
      setError(d?.detail || (typeof d === 'object' ? Object.values(d).flat().join(' ') : '') || 'Registration failed')
    }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel ────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between bg-[#0B1120] p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-[-60px] left-[-60px] w-[300px] h-[300px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-14">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Zap size={19} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">SEBPS</p>
              <p className="text-slate-400 text-[11px] mt-0.5">Smart Electricity Bill Prediction</p>
            </div>
          </div>

          <h2 className="text-white text-3xl font-bold leading-snug mb-3">
            Your energy,<br />
            <span className="text-blue-400">predicted precisely.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Create your account and we'll guide you through connecting your LESCO meter for accurate predictions and cost insights.
          </p>
        </div>

        {/* Flow preview */}
        <div className="relative z-10 space-y-3">
          {[
            { step: '01', title: 'Create account',        desc: 'Email + password — takes 30 seconds'              },
            { step: '02', title: 'Scan or enter your bill', desc: 'We extract your LESCO reference automatically'  },
            { step: '03', title: 'Import 12 months data', desc: 'Full bill history fetched instantly'              },
            { step: '04', title: 'Enter your dashboard',  desc: 'Predictions, budget tracking, AI advisor'         },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3.5 items-start">
              <span className="text-[10px] font-bold text-blue-500 font-mono mt-0.5 w-5 flex-shrink-0">{step}</span>
              <div>
                <p className="text-white text-sm font-medium">{title}</p>
                <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 text-slate-600 text-xs">
          © {new Date().getFullYear()} SEBPS — Final Year Project
        </p>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile brand */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Zap size={17} className="text-white" />
            </div>
            <p className="font-bold text-slate-900">SEBPS</p>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
            <p className="text-slate-400 text-sm mt-1.5">
              Get started in seconds — LESCO setup comes next.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-red-500 text-xs mt-0.5">⚠</span>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="email" required value={form.email} onChange={set('email')}
                  placeholder="you@example.com" className="input pl-10" autoFocus />
              </div>
            </div>

            <div>
              <label className="label">Username</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" required value={form.username} onChange={set('username')}
                  placeholder="Choose a username" className="input pl-10" />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type={showPw ? 'text' : 'password'} required value={form.password}
                  onChange={set('password')} placeholder="Min 8 characters" className="input pl-10 pr-10" />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Confirm password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type={showPw2 ? 'text' : 'password'} required value={form.password2}
                  onChange={set('password2')} placeholder="Repeat password" className="input pl-10 pr-10" />
                <button type="button" onClick={() => setShowPw2(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw2 ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy} className="bg-blue-50 text-black border border-slate-200 hover:bg-black hover:text-white rounded-md transition hover:border-black w-full mt-2 py-3">
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:text-blue-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
