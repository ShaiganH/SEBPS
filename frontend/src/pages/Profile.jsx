import { useState, useEffect } from 'react'
import { toast } from '../lib/toast'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { User, Zap, Lock, CheckCircle2, AlertTriangle, ScanLine, LogOut } from 'lucide-react'
import OnboardingModal from '../components/OnboardingModal'

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
)

const SectionCard = ({ icon: Icon, title, iconBg = 'bg-blue-50', iconColor = 'text-blue-600', children }) => (
  <div className="surface p-6">
    <div className="flex items-center gap-2.5 mb-5">
      <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
        <Icon size={15} className={iconColor} />
      </div>
      <p className="font-semibold text-slate-900 text-sm">{title}</p>
    </div>
    {children}
  </div>
)

const StatusMsg = ({ ok, msg }) => msg ? (
  <div className={`flex items-center gap-2 text-sm px-3.5 py-2.5 rounded-md mt-4 ${
    ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
  }`}>
    {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
    {msg}
  </div>
) : null

export default function Profile() {
  const { refreshUser, logout } = useAuth()
  const [profile,    setProfile]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [showRescan, setShowRescan] = useState(false)

  // Personal info
  const [personal, setPersonal] = useState({ username: '', phone_number: '' })
  const [pSaving,  setPSaving]  = useState(false)
  const [pMsg,     setPMsg]     = useState('')
  const [pOk,      setPOk]      = useState(false)

  // LESCO meter / cycle settings (manual fields only)
  const [lesco, setLesco] = useState({
    ref_no: '', sanctioned_load_kw: '2', billing_cycle_day: '1', phase: 'single_phase',
  })
  const [lSaving, setLSaving] = useState(false)
  const [lMsg,    setLMsg]    = useState('')
  const [lOk,     setLOk]     = useState(false)

  // Change password
  const [pwd, setPwd] = useState({ old_password: '', new_password: '', new_password2: '' })
  const [cSaving, setCSaving] = useState(false)
  const [cMsg,    setCMsg]    = useState('')
  const [cOk,     setCOk]     = useState(false)

  useEffect(() => {
    api.get('/auth/me/')
      .then(r => {
        const p = r.data
        setProfile(p)
        setPersonal({ username: p.username || '', phone_number: p.phone_number || '' })
        setLesco({
          ref_no:             p.ref_no             || '',
          sanctioned_load_kw: String(p.sanctioned_load_kw ?? 2),
          billing_cycle_day:  String(p.billing_cycle_day  ?? 1),
          phase:              p.phase || 'single_phase',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const savePersonal = async () => {
    setPSaving(true); setPMsg('')
    try {
      await api.patch('/auth/me/', personal)
      setPMsg('Personal info updated.'); setPOk(true)
      toast.success('Personal info updated')
      if (refreshUser) refreshUser()
    } catch (e) {
      const msg = e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Save failed'
      setPMsg(msg); setPOk(false); toast.error(msg)
    } finally { setPSaving(false) }
  }

  const saveLesco = async () => {
    setLSaving(true); setLMsg('')
    try {
      await api.patch('/auth/me/', {
        ref_no:             lesco.ref_no,
        sanctioned_load_kw: parseFloat(lesco.sanctioned_load_kw) || 2,
        billing_cycle_day:  parseInt(lesco.billing_cycle_day)    || 1,
        phase:              lesco.phase,
      })
      setLMsg('Meter settings saved.'); setLOk(true)
      toast.success('Meter settings saved')
    } catch (e) {
      const msg = e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Save failed'
      setLMsg(msg); setLOk(false); toast.error(msg)
    } finally { setLSaving(false) }
  }

  const changePassword = async () => {
    if (pwd.new_password !== pwd.new_password2) {
      setCMsg('New passwords do not match.'); setCOk(false)
      toast.error('New passwords do not match')
      return
    }
    setCSaving(true); setCMsg('')
    try {
      await api.post('/auth/change-password/', pwd)
      setCMsg('Password changed successfully.'); setCOk(true)
      toast.success('Password changed')
      setPwd({ old_password: '', new_password: '', new_password2: '' })
    } catch (e) {
      const msg = e.response?.data?.old_password?.[0] || e.response?.data?.detail || 'Change failed'
      setCMsg(msg); setCOk(false); toast.error(msg)
    } finally { setCSaving(false) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">


      {/* Tariff info — how LESCO slab pricing works */}
      <div className="surface p-4 flex items-start gap-3 border-l-4 border-l-blue-400">
        <Zap size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          <p className="text-sm font-semibold text-slate-800">LESCO slab tariff — rate adjusts with consumption</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Your effective rate per unit changes automatically as monthly consumption increases:
            Rs 3.95/unit (≤50 units lifeline) → Rs 7.74 (51–100) → Rs 22.44 (unprotected 1–100) → Rs 33.10 (201–300) → Rs 47.20 (above 700).
            The tariff engine recalculates in real time as your IoT meter measures more kWh.
          </p>
        </div>
      </div>

      {/* ── Personal Info ─────────────────────────────────────────────────── */}
      <SectionCard icon={User} title="Personal Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label">Username</label>
            <input
              type="text" value={personal.username} className="input"
              onChange={e => setPersonal(p => ({ ...p, username: e.target.value }))}
              placeholder="Your display name"
            />
          </div>
          <div>
            <label className="label">Phone number</label>
            <input
              type="tel" value={personal.phone_number} className="input"
              onChange={e => setPersonal(p => ({ ...p, phone_number: e.target.value }))}
              placeholder="+92 3xx xxxxxxx"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="label">
            Email <span className="text-slate-400 font-normal">(cannot be changed)</span>
          </label>
          <input
            type="email" value={profile?.email || ''} readOnly
            className="input bg-slate-50 cursor-not-allowed"
          />
        </div>
        <button onClick={savePersonal} disabled={pSaving} className="bg-white text-black border border-slate-200 rounded-md py-1 hover:bg-black hover:text-white hover:border-black px-6">
          {pSaving ? 'Saving…' : 'Save Personal Info'}
        </button>
        <StatusMsg ok={pOk} msg={pMsg} />
      </SectionCard>

      {/* ── LESCO Meter Settings ──────────────────────────────────────────── */}
      <SectionCard icon={Zap} title="LESCO Meter Settings" iconBg="bg-amber-50" iconColor="text-amber-600">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label">LESCO Reference No.</label>
            <input
              type="text" value={lesco.ref_no} className="input"
              onChange={e => setLesco(p => ({ ...p, ref_no: e.target.value }))}
              placeholder="e.g. 08 11274 1172000U"
            />
          </div>
          <div>
            <label className="label">Sanctioned Load (kW)</label>
            <input
              type="number" min="0.5" max="100" step="0.5"
              value={lesco.sanctioned_load_kw} className="input"
              onChange={e => setLesco(p => ({ ...p, sanctioned_load_kw: e.target.value }))}
              placeholder="e.g. 5"
            />
            <p className="text-[10px] text-slate-400 mt-1">Printed on your LESCO bill. Affects fixed charge.</p>
          </div>
          <div>
            <label className="label">Billing Cycle Start Day</label>
            <input
              type="number" min="1" max="28"
              value={lesco.billing_cycle_day} className="input"
              onChange={e => setLesco(p => ({ ...p, billing_cycle_day: e.target.value }))}
              placeholder="1–28"
            />
            <p className="text-[10px] text-slate-400 mt-1">Day of month your LESCO meter resets.</p>
          </div>
          <div>
            <label className="label">Phase</label>
            <select
              value={lesco.phase} className="input"
              onChange={e => setLesco(p => ({ ...p, phase: e.target.value }))}
            >
              <option value="single_phase">Single Phase</option>
              <option value="three_phase">Three Phase</option>
            </select>
          </div>
        </div>
        <button onClick={saveLesco} disabled={lSaving} className="bg-white text-black border border-slate-200 rounded-md py-1 hover:bg-black hover:text-white hover:border-black px-6">
          {lSaving ? 'Saving…' : 'Save Meter Settings'}
        </button>
        <StatusMsg ok={lOk} msg={lMsg} />
      </SectionCard>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <SectionCard icon={Lock} title="Change Password" iconBg="bg-slate-100" iconColor="text-slate-600">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="sm:col-span-2">
            <label className="label">Current password</label>
            <input
              type="password" value={pwd.old_password} className="input"
              onChange={e => setPwd(p => ({ ...p, old_password: e.target.value }))}
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              type="password" value={pwd.new_password} className="input"
              onChange={e => setPwd(p => ({ ...p, new_password: e.target.value }))}
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              type="password" value={pwd.new_password2} className="input"
              onChange={e => setPwd(p => ({ ...p, new_password2: e.target.value }))}
              placeholder="Repeat new password"
            />
          </div>
        </div>
        <button
          onClick={changePassword}
          disabled={cSaving || !pwd.old_password || !pwd.new_password}
          className="bg-white text-black border border-slate-200 rounded-md py-1 hover:bg-black hover:text-white hover:border-black px-6"
        >
          {cSaving ? 'Changing…' : 'Change Password'}
        </button>
        <StatusMsg ok={cOk} msg={cMsg} />
      </SectionCard>

      {/* ── Re-scan Bill ──────────────────────────────────────────────────── */}
      <div className="surface p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-md flex items-center justify-center flex-shrink-0">
            <ScanLine size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Re-scan Bill</p>
            <p className="text-xs text-slate-400 mt-0.5">Update your LESCO data with a new bill scan</p>
          </div>
        </div>
        <button
          onClick={() => setShowRescan(true)}
          className="btn-secondary text-xs px-4 py-2 flex-shrink-0"
        >
          Scan / Update
        </button>
      </div>

      {/* ── Logout ───────────────────────────────────────────────────────── */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors text-sm font-medium"
      >
        <LogOut size={15} />
        Sign out
      </button>

      {/* Re-scan modal */}
      {showRescan && (
        <OnboardingModal rescan onComplete={() => setShowRescan(false)} />
      )}
    </div>
  )
}
