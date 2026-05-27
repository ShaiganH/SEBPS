import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Zap, Plus, Trash2, BarChart2, Settings, CheckCircle, AlertTriangle, X, Wallet } from 'lucide-react'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16']

const kwhPerMonth = (watts, hours, qty = 1, days = 30) =>
  Math.round(watts / 1000 * Math.max(0, hours) * qty * days * 100) / 100

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
)

export default function Appliances() {
  const { user } = useAuth()
  const [appliances,  setAppliances]  = useState([])
  const [catalog,     setCatalog]     = useState([])
  const [budget,      setBudget]      = useState(null)
  const [analysis,    setAnalysis]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [analyzing,   setAnalyzing]   = useState(false)
  const [optimizing,  setOptimizing]  = useState(false)
  const [applying,    setApplying]    = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [form,        setForm]        = useState({ name: '', wattage_w: '', hours_per_day: '', quantity: 1, category: 'Custom' })
  const [msg,         setMsg]         = useState('')
  const [msgOk,       setMsgOk]       = useState(false)
  const [optimizeMode,   setOptimizeMode]   = useState(false)
  const [optimizeResult, setOptimizeResult] = useState(null)
  const [sliders,        setSliders]        = useState({})
  const [liveStats,      setLiveStats]      = useState(null)
  const [liveLoading,    setLiveLoading]    = useState(false)
  const [applyDone,      setApplyDone]      = useState(false)
  const debounceRef = useRef(null)

  // Billing cycle context
  const today  = new Date()
  const cycleD = Math.min(Math.max(parseInt(user?.billing_cycle_day ?? 1, 10) || 1, 1), 28)
  const cycleStartThisMonth = today.getDate() >= cycleD
  const cycleStart = cycleStartThisMonth
    ? new Date(today.getFullYear(), today.getMonth(), cycleD)
    : (today.getMonth() === 0
        ? new Date(today.getFullYear() - 1, 11, cycleD)
        : new Date(today.getFullYear(), today.getMonth() - 1, cycleD))
  const nextCycleStart = cycleStartThisMonth
    ? new Date(today.getFullYear(), today.getMonth() + 1, cycleD)
    : new Date(today.getFullYear(), today.getMonth(), cycleD)
  const totalCycleDays  = Math.round((nextCycleStart - cycleStart) / 86_400_000)
  const daysElapsed     = Math.round((today - cycleStart) / 86_400_000) + 1
  const hasIot          = !!(budget?.iot_units_kwh)
  const alreadyConsumed = hasIot ? (budget?.iot_units_kwh ?? 0) : 0
  const remainingDays   = hasIot ? Math.max(1, totalCycleDays - daysElapsed) : 30

  const load = () =>
    Promise.all([
      api.get('/appliances/'),
      api.get('/appliances/catalog/'),
      api.get('/budget/').catch(() => ({ data: null })),
    ]).then(([a, c, b]) => {
      setAppliances(a.data?.results ?? a.data)
      setCatalog(c.data?.results ?? c.data)
      setBudget(b.data?.detail ? null : b.data)
    }).finally(() => setLoading(false))

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (budget && budget.budget_used_pct >= 100 && optimizeMode) {
      setOptimizeMode(false); setOptimizeResult(null); setSliders({}); setLiveStats(null)
    }
  }, [budget, optimizeMode])

  // Live analysis with debounce
  useEffect(() => {
    if (!optimizeMode || !appliances.length) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLiveLoading(true)
      try {
        const payload = {
          appliances: appliances.map(a => ({
            id: a.id, name: a.name, wattage_w: a.wattage_w,
            hours_per_day: sliders[a.id] ?? a.hours_per_day,
            quantity: a.quantity, category: a.category,
            monthly_units: kwhPerMonth(a.wattage_w, sliders[a.id] ?? a.hours_per_day, a.quantity, remainingDays),
          })),
          use_saved_appliances: false,
          already_consumed_units: alreadyConsumed,
          remaining_days: remainingDays,
        }
        const { data } = await api.post('/appliances/analyze/', payload)
        setLiveStats(data)
      } catch { /* silent */ }
      finally { setLiveLoading(false) }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [sliders, optimizeMode, appliances, alreadyConsumed, remainingDays])

  const pieData = useMemo(() =>
    appliances.map(a => ({
      name: a.name,
      value: optimizeMode
        ? kwhPerMonth(a.wattage_w, sliders[a.id] ?? a.hours_per_day, a.quantity, remainingDays)
        : (a.monthly_units ?? 0),
    })).filter(d => d.value > 0)
  , [appliances, sliders, optimizeMode, remainingDays])

  // CRUD
  const add = async () => {
    try {
      await api.post('/appliances/', { ...form, wattage_w: +form.wattage_w, hours_per_day: +form.hours_per_day, quantity: +form.quantity })
      setShowAdd(false); setForm({ name: '', wattage_w: '', hours_per_day: '', quantity: 1, category: 'Custom' }); load()
    } catch (err) { setMsg(err.response?.data?.detail || 'Add failed'); setMsgOk(false) }
  }
  const del = async id => {
    if (!confirm('Remove appliance?')) return
    await api.delete(`/appliances/${id}/`); load()
  }
  const fromCatalog = item => setForm({
    name: item.name, wattage_w: item.wattage_w,
    hours_per_day: item.typical_hours_per_day || 4, quantity: 1, category: item.category,
  })

  const analyze = async () => {
    setAnalyzing(true); setAnalysis(null)
    try {
      const { data } = await api.post('/appliances/analyze/', {
        appliances: appliances.map(a => ({ id: a.id, name: a.name, wattage_w: a.wattage_w, hours_per_day: a.hours_per_day, quantity: a.quantity, category: a.category })),
        use_saved_appliances: false, already_consumed_units: alreadyConsumed, remaining_days: remainingDays,
      })
      setAnalysis(data)
    } catch (err) { setMsg(err.response?.data?.detail || 'Analysis failed'); setMsgOk(false) }
    finally { setAnalyzing(false) }
  }

  const runOptimize = async () => {
    setOptimizing(true); setOptimizeResult(null); setAnalysis(null)
    try {
      const { data } = await api.post('/appliances/optimize/', {
        appliances: appliances.map(a => ({ id: a.id, name: a.name, wattage_w: a.wattage_w, hours_per_day: a.hours_per_day, quantity: a.quantity, category: a.category, monthly_units: kwhPerMonth(a.wattage_w, a.hours_per_day, a.quantity, remainingDays) })),
        already_consumed_units: alreadyConsumed, remaining_days: remainingDays,
      })
      setOptimizeResult(data)
      const init = {}
      data.optimized_appliances.forEach(oa => {
        const app = appliances.find(a => a.name === oa.name)
        if (app) init[app.id] = oa.optimized_hours_per_day
      })
      setSliders(init); setOptimizeMode(true); setApplyDone(false)
    } catch (err) { setMsg(err.response?.data?.detail || 'Optimization failed'); setMsgOk(false) }
    finally { setOptimizing(false) }
  }

  const applyOptimized = async () => {
    setApplying(true)
    try {
      const adjustments = appliances.filter(a => sliders[a.id] !== undefined).map(a => ({ id: a.id, hours_per_day: sliders[a.id] }))
      await api.post('/appliances/optimize/apply/', { adjustments })
      setApplyDone(true); await load()
      setTimeout(() => { setOptimizeMode(false); setOptimizeResult(null); setSliders({}) }, 2000)
    } catch (err) { setMsg(err.response?.data?.detail || 'Apply failed'); setMsgOk(false) }
    finally { setApplying(false) }
  }

  const exitOptimize = () => {
    setOptimizeMode(false); setOptimizeResult(null); setSliders({}); setLiveStats(null)
  }

  const budgetExceeded = !!(budget && budget.budget_used_pct >= 100)
  const originalBill   = optimizeResult?.summary?.original_bill_pkr
  const liveBill       = liveStats?.summary?.total_bill_pkr
  const liveBudget     = liveStats?.summary?.budget_pkr
  const liveUnits      = liveStats?.summary?.total_monthly_units
  const overBudget     = !!(liveBudget && liveBill > liveBudget)
  const savedVsOrig    = (originalBill && liveBill) ? originalBill - liveBill : null
  const budgetPct      = liveBudget && liveBill ? Math.round(liveBill / liveBudget * 100) : null

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appliances</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your appliances and analyse their bill impact</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!optimizeMode && (
            <>
              <button onClick={analyze} disabled={analyzing || appliances.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white transition-colors">
                <BarChart2 size={14} />{analyzing ? ' Analyzing…' : ' Analyze'}
              </button>
              {!budgetExceeded && (
                <button onClick={runOptimize} disabled={optimizing || appliances.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors">
                  <Settings size={14} />{optimizing ? ' Optimizing…' : ' Optimize'}
                </button>
              )}
            </>
          )}
          {optimizeMode && (
            <button onClick={exitOptimize}
              className="btn-secondary flex items-center gap-1.5 text-sm">
              <X size={14} /> Exit Optimization
            </button>
          )}
          <button onClick={() => setShowAdd(p => !p)}
            className={showAdd ? 'btn-secondary flex items-center gap-1.5 text-sm' : 'btn-primary flex items-center gap-1.5'}>
            {showAdd ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add Appliance</>}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          msgOk ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {msg}
        </div>
      )}

      {/* Budget exceeded banner */}
      {budgetExceeded && !optimizeMode && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
          <AlertTriangle size={17} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Budget Exceeded — Optimization Unavailable</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Your projected bill of{' '}
              <span className="font-medium text-slate-700">Rs {Number(budget.projected_bill_pkr ?? budget.current_bill_pkr ?? 0).toLocaleString()}</span>{' '}
              already exceeds your budget of{' '}
              <span className="font-medium text-slate-700">Rs {Number(budget.max_pkr).toLocaleString()}</span>.
              Reduce IoT device power or raise your budget to re-enable optimization.
            </p>
          </div>
          <Link to="/budget"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-xl text-xs text-red-700 transition-colors">
            <Wallet size={11} /> Update Budget
          </Link>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="surface p-6">
          <p className="font-semibold text-slate-900 text-sm mb-4">Add Appliance</p>
          <div className="mb-4">
            <label className="label">Pick from catalog <span className="text-slate-400 font-normal">(optional)</span></label>
            <select onChange={e => { const item = catalog.find(c => c.id === +e.target.value); if (item) fromCatalog(item) }} className="input">
              <option value="">— Select a preset appliance —</option>
              {catalog.map(c => <option key={c.id} value={c.id}>{c.name} ({c.wattage_w}W) [{c.category}]</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Name',       'text',   'name',          'Air Conditioner'],
              ['Wattage (W)','number', 'wattage_w',     '1500'],
              ['Hours/Day',  'number', 'hours_per_day', '8'],
              ['Quantity',   'number', 'quantity',      '1'],
              ['Category',   'text',   'category',      'Cooling'],
            ].map(([label, type, key, ph]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={ph} className="input" />
              </div>
            ))}
            <div className="flex items-end">
              <button onClick={add} className="btn-primary w-full">Add Appliance</button>
            </div>
          </div>
        </div>
      )}

      {/* Optimize status bar */}
      {optimizeMode && optimizeResult && (
        <div className={`surface p-4 flex flex-wrap items-center justify-between gap-3 border ${
          applyDone    ? 'border-emerald-200 bg-emerald-50/50' :
          overBudget   ? 'border-red-200 bg-red-50/50'        :
                         'border-blue-100 bg-blue-50/30'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            {applyDone
              ? <CheckCircle size={17} className="text-emerald-600 flex-shrink-0" />
              : overBudget
                ? <AlertTriangle size={17} className="text-red-500 flex-shrink-0 animate-pulse" />
                : <CheckCircle size={17} className="text-blue-600 flex-shrink-0" />
            }
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${applyDone ? 'text-emerald-700' : overBudget ? 'text-red-700' : 'text-slate-900'}`}>
                {applyDone
                  ? 'Optimization applied!'
                  : overBudget
                    ? `Over budget by Rs ${Number(liveBill - liveBudget).toLocaleString()}`
                    : 'Adjust sliders to fine-tune · bill updates live'}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {liveLoading
                  ? 'Recalculating…'
                  : liveBill != null
                    ? `Rs ${Number(originalBill).toLocaleString()} → Rs ${Number(liveBill).toLocaleString()}${savedVsOrig != null ? ` · ${savedVsOrig >= 0 ? `saves Rs ${Number(savedVsOrig).toLocaleString()}` : `Rs ${Number(-savedVsOrig).toLocaleString()} extra`}` : ''}`
                    : optimizeResult.message
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {liveLoading && <div className="w-4 h-4 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />}
            {!applyDone && (
              <button onClick={applyOptimized} disabled={applying}
                className="btn-primary flex items-center gap-2 text-xs px-4">
                {applying
                  ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                  : <><CheckCircle size={12} /> Apply &amp; Save</>
                }
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Appliance table / slider panel */}
        <div className="xl:col-span-2 surface overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900 text-sm">My Appliances</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {appliances.length} appliance{appliances.length !== 1 ? 's' : ''}
                {optimizeMode && ` · ${remainingDays}d left · drag sliders to adjust · bill updates live`}
              </p>
            </div>
          </div>

          {appliances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 px-6">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-2">
                <Zap size={22} className="text-slate-400" />
              </div>
              <p className="text-slate-700 font-medium text-sm">No appliances yet</p>
              <p className="text-slate-400 text-xs">Add from the catalog or enter manually</p>
            </div>
          ) : !optimizeMode ? (
            /* Normal table */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-100">
                    {['Appliance', 'Watts', 'Hours/Day', 'Qty', 'Monthly kWh', ''].map(h => (
                      <th key={h} className="text-left px-6 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {appliances.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-slate-800">{a.name}</td>
                      <td className="px-6 py-3.5 text-slate-500">{a.wattage_w}W</td>
                      <td className="px-6 py-3.5 text-slate-500">{a.hours_per_day}h</td>
                      <td className="px-6 py-3.5 text-slate-500">{a.quantity}</td>
                      <td className="px-6 py-3.5 font-medium text-blue-600">{a.monthly_units} kWh</td>
                      <td className="px-6 py-3.5">
                        <button onClick={() => del(a.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Slider panel */
            <div className="p-4 space-y-3">
              {appliances.map((a, idx) => {
                const origHours = a.hours_per_day
                const currHours = sliders[a.id] ?? origHours
                const delta     = currHours - origHours
                const isInc     = delta > 0.05
                const isRed     = delta < -0.05
                const currKwh   = kwhPerMonth(a.wattage_w, currHours, a.quantity, remainingDays)
                const origKwh   = kwhPerMonth(a.wattage_w, origHours, a.quantity, remainingDays)
                const kwhDelta  = currKwh - origKwh
                const trackPct  = (currHours / 24) * 100
                const origPct   = (origHours / 24) * 100

                return (
                  <div key={a.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isInc && overBudget ? 'border-red-200 bg-red-50/50' :
                      isInc              ? 'border-orange-200 bg-orange-50/30' :
                      isRed              ? 'border-emerald-200 bg-emerald-50/30' :
                                           'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                        <span className="text-sm font-semibold text-slate-800">{a.name}</span>
                        <span className="text-xs text-slate-400">{a.wattage_w}W{a.quantity > 1 ? ` ×${a.quantity}` : ''}</span>
                        {isRed && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            −{Math.abs(delta).toFixed(1)}h/day
                          </span>
                        )}
                        {isInc && (
                          <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <AlertTriangle size={9} /> +{delta.toFixed(1)}h/day
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-bold text-slate-900">{currHours.toFixed(1)}h/day</span>
                        {Math.abs(kwhDelta) > 0.1 && (
                          <span className={`text-xs ml-1.5 ${kwhDelta < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            ({kwhDelta > 0 ? '+' : ''}{kwhDelta.toFixed(1)} kWh)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 my-1">
                      <span className="text-xs text-slate-400 w-4 text-right flex-shrink-0">0</span>
                      <div className="flex-1 relative py-2">
                        <input
                          type="range" min="0" max="24" step="0.5"
                          value={currHours}
                          onChange={e => setSliders(p => ({ ...p, [a.id]: +e.target.value }))}
                          className="w-full h-2 rounded-full appearance-none cursor-pointer relative z-10"
                          style={{
                            background: `linear-gradient(to right, ${isInc ? '#F97316' : '#3B82F6'} 0%, ${isInc ? '#F97316' : '#3B82F6'} ${trackPct}%, #E2E8F0 ${trackPct}%, #E2E8F0 100%)`,
                          }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-px h-4 bg-slate-400/60 pointer-events-none"
                          style={{ left: `${origPct}%` }}
                          title={`Original: ${origHours}h`}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-5 flex-shrink-0">24h</span>
                    </div>

                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-slate-400">
                        {(a.wattage_w / 1000 * a.quantity).toFixed(2)} kW ·{' '}
                        <span className="text-blue-600 font-medium">{currKwh} kWh ({remainingDays}d)</span>
                      </span>
                      <span className="text-xs text-slate-400">
                        was {origHours}h ({origKwh} kWh)
                        {isRed && (
                          <span className="text-emerald-600 ml-1">· saves {Math.abs(kwhDelta).toFixed(1)} kWh</span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar: pie + budget */}
        <div className="space-y-4">
          {pieData.length > 0 && (
            <div className="surface p-5">
              <p className="font-semibold text-slate-900 text-sm mb-1">
                {optimizeMode ? 'Usage Share (live)' : 'Usage Share'}
              </p>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%" outerRadius={68} dataKey="value"
                    label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={false} fontSize={10}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}
                    formatter={v => [`${v} kWh`]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {pieData.slice(0, 6).map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600 truncate">{d.name}</span>
                    </div>
                    <span className="text-slate-400 flex-shrink-0 ml-2">{d.value} kWh</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optimize budget panel */}
          {optimizeMode && (
            <div className={`surface p-5 border transition-colors ${overBudget ? 'border-red-200' : 'border-slate-100'}`}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Budget vs Projection</p>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Monthly budget</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {liveBudget ? `Rs ${Number(liveBudget).toLocaleString()}` : 'Not set'}
                  </span>
                </div>

                {budget?.current_bill_pkr != null && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500">IoT Actual (this cycle)</p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Consumed so far</span>
                      <span className="text-sm font-bold text-slate-900">Rs {Number(budget.current_bill_pkr).toLocaleString()}</span>
                    </div>
                    {liveBudget && (
                      <>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.min(budget.budget_used_pct ?? 0, 100)}%` }} />
                        </div>
                        <p className="text-xs text-slate-400">{budget.budget_used_pct ?? 0}% of budget</p>
                      </>
                    )}
                  </div>
                )}

                {budget?.projection_exceeds_budget && budget?.projected_bill_pkr != null && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Projected: <span className="font-semibold">Rs {Number(budget.projected_bill_pkr).toLocaleString()}</span>
                      <span className="text-slate-500"> (Rs {Number(budget.projected_over_by_pkr).toLocaleString()} over)</span>
                    </p>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                    Month-end ({remainingDays}d left)
                    {liveLoading && <span className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />}
                  </p>
                  {hasIot && liveStats?.summary?.already_consumed_units > 0 && (
                    <p className="text-xs text-slate-400">IoT + appliances ({remainingDays}d) = total below</p>
                  )}
                  <div className={`flex justify-between items-center ${overBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                    <span className="text-xs font-medium">Total projected bill</span>
                    <span className="text-sm font-bold">Rs {liveBill != null ? Number(liveBill).toLocaleString() : '—'}</span>
                  </div>
                  {liveBudget && liveBill != null && (
                    <>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${
                          overBudget ? 'bg-red-500' : budgetPct > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                        }`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">{budgetPct}%</span>
                        {overBudget
                          ? <span className="text-red-500 font-medium">Rs {Number(liveBill - liveBudget).toLocaleString()} over</span>
                          : <span className="text-emerald-600">Rs {Number(liveBudget - liveBill).toLocaleString()} remaining</span>
                        }
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Total projected units</span>
                    <span className="text-xs font-medium text-blue-600">{liveUnits ?? '—'} kWh</span>
                  </div>
                  {savedVsOrig != null && (
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">Vs original</span>
                      <span className={`text-xs font-semibold ${savedVsOrig >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {savedVsOrig >= 0 ? '−' : '+'}Rs {Number(Math.abs(savedVsOrig)).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analysis panel */}
      {analysis && !optimizeMode && (
        <div className="surface overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
              <BarChart2 size={15} className="text-violet-600" />
            </div>
            <p className="font-semibold text-slate-900 text-sm">Analysis Result</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                ['Total Units',  `${analysis.summary.total_monthly_units} kWh`,                                                    'text-blue-600'],
                ['Total Bill',   `Rs ${Number(analysis.summary.total_bill_pkr).toLocaleString()}`,                                 'text-slate-900'],
                ['Budget Used',  analysis.summary.budget_used_pct ? `${analysis.summary.budget_used_pct}%` : 'No budget',         analysis.summary.within_budget ? 'text-emerald-600' : 'text-red-600'],
                ['Over Budget',  `Rs ${Number(analysis.summary.over_budget_by_pkr).toLocaleString()}`,                            analysis.summary.within_budget ? 'text-slate-400' : 'text-red-600'],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {analysis.slab_alerts?.length > 0 && analysis.slab_alerts.map((a, i) => (
              <div key={i} className="mb-3 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />{a.message}
              </div>
            ))}

            <p className={`text-sm mb-4 font-medium ${analysis.summary.within_budget ? 'text-emerald-600' : 'text-red-600'}`}>
              {analysis.tip}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-100">
                    {['Appliance', 'Monthly kWh', 'Share %', 'Save/1hr cut', 'Bill Contribution'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {analysis.appliance_breakdown.map(a => (
                    <tr key={a.name} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{a.name}</td>
                      <td className="px-4 py-3 text-blue-600 font-medium">{a.monthly_units}</td>
                      <td className="px-4 py-3 text-slate-500">{a.share_pct}%</td>
                      <td className="px-4 py-3 text-amber-600 font-medium">{a.save_per_1hr_units} kWh</td>
                      <td className="px-4 py-3 font-medium text-slate-700">Rs {Number(a.bill_contribution_pkr).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-400 mt-4">
              Click <span className="font-semibold text-amber-600">Optimize</span> to auto-adjust hours and enter the interactive slider view.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
