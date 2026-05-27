import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Mail, Lock, User, Hash, Eye, EyeOff, PlugZap, Calendar } from 'lucide-react'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '', username: '', password: '', password2: '',
    ref_no: '', sanctioned_load_kw: 2, phase: 'single_phase',
    is_protected_consumer: false, is_tax_filer: false,
    billing_cycle_day: 1,
  })
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showPw2, setShowPw2] = useState(false)

  const set = k => e =>
    setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

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
      <div className="hidden lg:flex lg:w-[38%] flex-col justify-between bg-[#0B1120] p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
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
            Set up your<br />
            <span className="text-blue-400">smart energy profile.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your LESCO reference number and billing details help us deliver accurate predictions from day one.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {[
            { title: 'Billing Cycle Day', desc: 'The day your LESCO cycle starts each month (shown on your bill)' },
            { title: 'Sanctioned Load', desc: 'Your approved maximum power in kilowatts — on your meter certificate' },
            { title: 'Protected Consumer', desc: 'Consumers using less than 200 units/month qualify for subsidized rates' },
          ].map(({ title, desc }) => (
            <div key={title} className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
              <div>
                <p className="text-white text-sm font-medium">{title}</p>
                <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 text-slate-600 text-xs">
          © {new Date().getFullYear()} SEBPS — Final Year Project
        </p>
      </div>

      {/* ── Right panel (form) ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center bg-white overflow-y-auto py-10 px-8">
        <div className="w-full max-w-lg">
          {/* Mobile brand */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Zap size={17} className="text-white" />
            </div>
            <p className="font-bold text-slate-900">SEBPS</p>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
            <p className="text-slate-400 text-sm mt-1.5">Get started in under a minute</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-red-500 text-xs mt-0.5">⚠</span>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            {/* Account credentials */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Account</p>
              <div className="space-y-3">
                <div>
                  <label className="label">Email address *</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="email" required value={form.email} onChange={set('email')}
                      placeholder="you@example.com" className="input pl-10" autoFocus />
                  </div>
                </div>
                <div>
                  <label className="label">Username *</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="text" required value={form.username} onChange={set('username')}
                      placeholder="Choose a username" className="input pl-10" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Password *</label>
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
                    <label className="label">Confirm password *</label>
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
                </div>
              </div>
            </div>

            {/* LESCO details */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">LESCO Details</p>
              <div className="space-y-3">
                <div>
                  <label className="label">Reference Number <span className="text-slate-400 font-normal">(optional — enables automatic bill fetch)</span></label>
                  <div className="relative">
                    <Hash size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="text" value={form.ref_no} onChange={set('ref_no')}
                      placeholder="e.g. 08 11274 1172000U" className="input pl-10" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Cycle Start Day</label>
                    <div className="relative">
                      <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input type="number" min="1" max="28" value={form.billing_cycle_day}
                        onChange={set('billing_cycle_day')} className="input pl-9" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Day 1–28 on your bill</p>
                  </div>
                  <div>
                    <label className="label">Sanctioned Load (kW)</label>
                    <div className="relative">
                      <PlugZap size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input type="number" step="0.5" min="0.5" value={form.sanctioned_load_kw}
                        onChange={set('sanctioned_load_kw')} className="input pl-9" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Phase</label>
                    <select value={form.phase} onChange={set('phase')} className="input">
                      <option value="single_phase">Single Phase</option>
                      <option value="three_phase">Three Phase</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-5 pt-1">
              {[
                ['is_protected_consumer', 'Protected Consumer', 'Usage under 200 units/month'],
                ['is_tax_filer',          'Active Tax Filer',   'Registered with FBR'],
              ].map(([key, label, hint]) => (
                <label key={key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input type="checkbox" checked={form[key]} onChange={set(key)} className="sr-only peer" />
                    <div className="w-4 h-4 rounded border-2 border-slate-300 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors flex items-center justify-center">
                      {form[key] && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400">{hint}</p>
                  </div>
                </label>
              ))}
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full py-3 mt-1">
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
