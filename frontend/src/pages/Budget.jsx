import { useState, useEffect } from 'react'
import { toast } from '../lib/toast'
import api from '../api/client'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import { Wallet, Bell, TrendingUp, AlertTriangle, CheckCircle2, Link as LinkIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
)

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.stroke ?? p.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-slate-900">Rs {Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default function Budget() {
  const [budget,  setBudget]  = useState(null)
  const [alerts,  setAlerts]  = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({
    max_pkr: '', max_units: '', alert_at_75_pct: true, alert_at_100_pct: true,
  })
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')
  const [msgOk,  setMsgOk]  = useState(false)

  const load = () =>
    Promise.all([
      api.get('/budget/').catch(() => ({ data: null })),
      api.get('/budget/alerts/').catch(() => ({ data: [] })),
      api.get('/budget/history/').catch(() => ({ data: [] })),
    ]).then(([b, a, h]) => {
      const bd = b.data?.detail ? null : b.data
      setBudget(bd); setAlerts(a.data); setHistory(h.data)
      // Re-fire budget alert toast whenever projected amount changes
      if (bd?.projection_exceeds_budget && bd?.projected_bill_pkr != null) {
        const key = `budget_over_${Math.round(bd.projected_bill_pkr)}`
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1')
          toast.warning(
            `Projected Rs ${Number(bd.projected_bill_pkr).toLocaleString()} — ` +
            `Rs ${Number(bd.projected_over_by_pkr).toLocaleString()} over your budget`,
            { duration: 8000 }
          )
        }
      }
      if (bd) setForm({
        max_pkr: bd.max_pkr, max_units: bd.max_units || '',
        alert_at_75_pct: bd.alert_at_75_pct, alert_at_100_pct: bd.alert_at_100_pct,
      })
    }).finally(() => setLoading(false))

  useEffect(() => { load() }, [])
  useEffect(() => {
    const t = setInterval(() => {
      api.get('/budget/').then(r => { if (r.data && !r.data.detail) setBudget(r.data) }).catch(() => {})
    }, 15_000)
    return () => clearInterval(t)
  }, [])

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      await api.post('/budget/', {
        max_pkr: +form.max_pkr,
        ...(form.max_units ? { max_units: +form.max_units } : {}),
        alert_at_75_pct:  form.alert_at_75_pct,
        alert_at_100_pct: form.alert_at_100_pct,
      })
      toast.success('Budget saved')
      setMsg('Budget saved successfully.'); setMsgOk(true); load()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Save failed'
      toast.error(msg)
      setMsg(msg); setMsgOk(false)
    } finally { setSaving(false) }
  }

  if (loading) return <Spinner />

  const pct          = budget?.budget_used_pct
  const projPkr      = budget?.projected_bill_pkr
  const projOver     = budget?.projection_exceeds_budget
  const consumed     = budget?.current_bill_pkr ?? budget?.iot_cost_pkr ?? 0
  const iotKwh       = budget?.iot_units_kwh      // measured kWh this cycle
  const tariffRate   = budget?.tariff_rate_pkr    // effective Rs/kWh
  const isProtected  = budget?.is_protected        // lifeline / unprotected

  const pctColor = !pct ? 'bg-slate-200'
    : pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'

  const statusBadge = !pct ? null
    : pct >= 100 ? { label: 'Budget Exceeded',   cls: 'bg-red-50 border-red-200 text-red-600'             }
    : pct >= 75  ? { label: 'Approaching Limit', cls: 'bg-amber-50 border-amber-200 text-amber-600'       }
    :              { label: 'On Track',           cls: 'bg-emerald-50 border-emerald-200 text-emerald-600' }

  const chartData = history.map(h => ({ month: h.month, bill: h.bill_pkr, budget: h.budget_pkr }))

  // Hero number = consumed amount
  const heroWhole   = budget ? Math.floor(consumed).toLocaleString() : null
  const heroDecimal = budget ? String(Math.round((consumed % 1) * 100)).padStart(2, '0') : null

  return (
    <div className="space-y-5">


      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      {budget ? (
        <div className="surface overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5">

            {/* Left: consumed amount */}
            <div className="lg:col-span-2 p-7 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-5">
                  Consumed This Month
                </p>
                <div>
                  <div className="flex items-end gap-1 leading-none">
                    <span className="text-lg font-medium text-slate-400 mb-1.5">Rs</span>
                    <span className="text-[3.5rem] font-bold text-slate-900 tracking-tight">{heroWhole}</span>
                    <span className="text-2xl font-semibold text-slate-400 mb-1">.{heroDecimal}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">
                    of Rs {Number(budget.max_pkr).toLocaleString()} budget
                    {budget.max_units ? ` · ${budget.max_units} unit cap` : ''}
                  </p>

                  {/* kWh breakdown + tariff context */}
                  {iotKwh != null && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        {Number(iotKwh).toFixed(1)} kWh consumed
                      </span>
                      {tariffRate != null && (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          isProtected
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}>
                          Rs {Number(tariffRate).toFixed(2)}/kWh
                          {isProtected ? ' · Lifeline' : ' · Unprotected'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                {statusBadge && (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${statusBadge.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pctColor}`} />
                    {statusBadge.label} · {pct}%
                  </div>
                )}
                {projOver && projPkr != null && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-600 leading-relaxed">
                      Projected <span className="font-semibold">Rs {Number(projPkr).toLocaleString()}</span>
                      {' '}— Rs {Number(budget.projected_over_by_pkr).toLocaleString()} over.{' '}
                      <Link to="/recommendations" className="underline hover:text-amber-800">Get advice →</Link>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: history area chart */}
            <div className="lg:col-span-3 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Bill vs Budget History
                </p>
                {chartData.length > 0 && (
                  <span className="text-xs text-slate-400">{chartData.length} months</span>
                )}
              </div>
              {chartData.length >= 2 ? (
                <div className="flex-1" style={{ minHeight: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="billGradBg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="0" stroke="#F8FAFC" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />
                      <ReferenceLine
                        y={Number(budget.max_pkr)}
                        stroke="#EF4444" strokeDasharray="5 4" strokeWidth={1.5}
                        label={{ value: 'Budget', fill: '#EF4444', fontSize: 10, position: 'insideTopRight' }}
                      />
                      <Area type="monotone" dataKey="bill" name="Actual Bill"
                        stroke="#3B82F6" strokeWidth={2} fill="url(#billGradBg)"
                        dot={false} activeDot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : chartData.length === 1 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-slate-900 mb-1">
                      Rs {Number(chartData[0].bill).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400">{chartData[0].month}</p>
                    <p className="text-xs text-slate-300 mt-3">More months needed for chart</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <TrendingUp size={20} className="text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-400">No history yet</p>
                    <p className="text-xs text-slate-300 mt-1">Fetch your LESCO bills to see trends</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar — full width */}
          {pct != null && (
            <div className="px-7 py-4 border-t border-slate-50 flex items-center gap-4">
              <span className="text-xs text-slate-400 flex-shrink-0">
                Rs {Number(consumed).toLocaleString()}
                {iotKwh != null && (
                  <span className="ml-1 text-slate-300">· {Number(iotKwh).toFixed(1)} kWh</span>
                )}
              </span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pctColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
                {pct}% of Rs {Number(budget.max_pkr).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      ) : (
        /* No budget set yet — nudge */
        <div className="surface p-6 flex items-center gap-4 border-dashed border-2 border-slate-200 bg-slate-50/50">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Wallet size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">No budget set yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Set a monthly limit below to enable tracking and alerts.</p>
          </div>
        </div>
      )}

      {/* ── Set / edit budget ─────────────────────────────────────────────── */}
      <div className="surface p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <Wallet size={15} className="text-blue-600" />
          </div>
          <p className="font-semibold text-slate-900 text-sm">{budget ? 'Update Budget' : 'Set Budget'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label">Monthly limit (Rs) *</label>
            <input
              type="number" min="0" value={form.max_pkr}
              onChange={e => setForm(p => ({ ...p, max_pkr: e.target.value }))}
              className="input" placeholder="e.g. 20000"
            />
          </div>
          <div>
            <label className="label">
              Unit cap <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="number" min="0" value={form.max_units}
              onChange={e => setForm(p => ({ ...p, max_units: e.target.value }))}
              className="input" placeholder="e.g. 400"
            />
          </div>
        </div>

        {/* Alert toggles */}
        <div className="flex gap-6 mb-5">
          {[
            ['alert_at_75_pct',  'Alert at 75% usage'],
            ['alert_at_100_pct', 'Alert at 100% usage'],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2.5 cursor-pointer">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox" checked={form[k]}
                  onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border-2 border-slate-300 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors flex items-center justify-center">
                  {form[k] && <span className="text-white text-[9px] font-bold">✓</span>}
                </div>
              </div>
              <span className="text-sm text-slate-600">{label}</span>
            </label>
          ))}
        </div>

        {msg && (
          <div className={`flex items-center gap-2 text-sm mb-4 px-3.5 py-2.5 rounded-xl ${
            msgOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {msgOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {msg}
          </div>
        )}

        <button onClick={save} disabled={saving || !form.max_pkr} className="bg-white text-black border border-slate-200 px-6 hover:bg-black hover:border-black py-1 rounded-sm hover:text-white transition-colors duration-200">
          {saving ? 'Saving…' : 'Save Budget'}
        </button>
      </div>

      {/* ── Budget alerts ─────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <Bell size={15} className="text-red-500" />
            </div>
            <p className="font-semibold text-slate-900 text-sm">Budget Alerts</p>
          </div>
          <div className="divide-y divide-slate-50">
            {alerts.slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    a.threshold_pct >= 100 ? 'bg-red-500' : 'bg-amber-400'
                  }`} />
                  <div>
                    <p className={`text-sm font-semibold ${
                      a.threshold_pct >= 100 ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {a.threshold_pct}% threshold reached
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(a.triggered_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">
                    Rs {Number(a.consumed_pkr).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">{a.consumed_units} units</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
