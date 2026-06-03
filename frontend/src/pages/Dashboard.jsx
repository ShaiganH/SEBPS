import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from '../lib/toast'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, FileText, Cpu, Bell,
  Zap, AlertTriangle, ArrowRight, Lightbulb,
} from 'lucide-react'

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
          <span className="font-semibold text-slate-900">
            {p.name === 'Bill (Rs)' ? `Rs ${Number(p.value).toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { refreshSignal } = useAuth()
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [showWelcome, setShowWelcome] = useState(() => {
    if (localStorage.getItem('welcome_message') === '1') {
      localStorage.removeItem('welcome_message')
      return true
    }
    return false
  })

  useEffect(() => {
    setLoading(true)
    api.get('/auth/dashboard/')
      .then(r => {
        setData(r.data)
        // Budget-exceeded toast — keyed to the projected amount so it fires
        // again if the projection rises further (not once-per-session).
        const b = r.data?.budget
        if (b?.projection_exceeds_budget && b?.projected_bill_pkr != null) {
          const key = `budget_over_${Math.round(b.projected_bill_pkr)}`
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1')
            toast.warning(
              `Budget alert — projected Rs ${Number(b.projected_bill_pkr).toLocaleString()},` +
              ` Rs ${Number(b.projected_over_by_pkr).toLocaleString()} over limit`,
              { duration: 8000 }
            )
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [refreshSignal])

  if (loading) return <Spinner />

  const pred     = data?.prediction
  const budget   = data?.budget
  const bills    = data?.recent_bills ?? []
  const iot      = data?.iot
  const iotCycle = data?.iot_cycle
  const unread   = data?.unread_notifications ?? 0

  const pct      = budget?.budget_used_pct ?? null
  const projOver = budget?.projection_exceeds_budget
  const projPkr  = budget?.projected_bill_pkr

  const pctColor = pct === null ? 'bg-slate-300'
    : pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'

  const budgetBadge = pct === null ? null
    : pct >= 100 ? { label: 'Budget Exceeded',    cls: 'bg-red-50 border-red-200 text-red-600'       }
    : pct >= 75  ? { label: 'Approaching Limit',  cls: 'bg-amber-50 border-amber-200 text-amber-600' }
    :              { label: 'On Track',            cls: 'bg-emerald-50 border-emerald-200 text-emerald-600' }

  // Chart: bills in chronological order (oldest → newest)
  const chartData = [...bills].reverse().map(b => ({
    month: b.month_label,
    bill:  parseFloat(b.bill_amount),
    units: b.units,
  }))

  // Hero stat — prefer prediction, fall back to IoT cycle, fall back to last bill
  const heroValue = pred
    ? Number(pred.predicted_bill)
    : iotCycle
    ? Number(iotCycle.current_bill_pkr)
    : bills[0]
    ? parseFloat(bills[0].bill_amount)
    : null

  const heroLabel = pred ? 'Predicted This Month'
    : iotCycle ? 'Current Cycle Cost'
    : bills[0]  ? 'Last Recorded Bill'
    : 'No Data Yet'

  const heroSub = pred
    ? `${pred.predicted_units} units projected`
    : iotCycle
    ? `${iotCycle.measured_kwh?.toFixed(1)} kWh measured · day ${iotCycle.days_elapsed}/${iotCycle.total_cycle_days}`
    : bills[0]
    ? `${bills[0].units} units`
    : 'Add your first bill to get started'

  // MoM delta
  const lastBill = bills[0]
  const prevBill = bills[1]
  const billDelta = lastBill && prevBill
    ? ((parseFloat(lastBill.bill_amount) - parseFloat(prevBill.bill_amount)) / parseFloat(prevBill.bill_amount) * 100).toFixed(1)
    : null

  // Whole + decimal parts for the hero number
  const heroWhole   = heroValue !== null ? Math.floor(heroValue).toLocaleString() : null
  const heroDecimal = heroValue !== null ? String(Math.round((heroValue % 1) * 100)).padStart(2, '0') : null

  return (
    <div className="space-y-5">
      {/* Welcome banner — shown once after first onboarding */}
      {showWelcome && (
        <div className="relative overflow-hidden surface p-5 border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <button
            onClick={() => setShowWelcome(false)}
            className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors text-lg leading-none"
          >
            ×
          </button>
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900">Welcome to SEBPS! 🎉</p>
              <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
                Your bill history has been imported and your energy profile is ready. Explore your predictions, set a budget, and let the AI advisor help you save.
              </p>
            </div>
          </div>
        </div>
      )}


      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-5">

          {/* Left: big number */}
          <div className="lg:col-span-2 p-7 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-5">
                {heroLabel}
              </p>
              {heroWhole !== null ? (
                <div className="mb-4">
                  <div className="flex items-end gap-1 leading-none">
                    <span className="text-lg font-medium text-slate-400 mb-1.5">Rs</span>
                    <span className="text-[3.5rem] font-bold text-slate-900 tracking-tight">
                      {heroWhole}
                    </span>
                    <span className="text-2xl font-semibold text-slate-400 mb-1">
                      .{heroDecimal}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">{heroSub}</p>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-[3.5rem] font-bold text-slate-200 leading-none">—</p>
                  <p className="text-sm text-slate-400 mt-2">{heroSub}</p>
                </div>
              )}
            </div>

            {/* Status badges */}
            <div className="space-y-2 mt-2">
              {budgetBadge && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${budgetBadge.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${pctColor}`} />
                  {budgetBadge.label} · {pct}% used
                </div>
              )}
              {billDelta !== null && (
                <p className={`text-xs font-medium flex items-center gap-1.5 ${
                  parseFloat(billDelta) > 0 ? 'text-red-500' : 'text-emerald-500'
                }`}>
                  {parseFloat(billDelta) > 0
                    ? <TrendingUp size={12} />
                    : <TrendingDown size={12} />
                  }
                  {parseFloat(billDelta) > 0 ? '+' : ''}{billDelta}% vs previous month
                </p>
              )}
              {projOver && projPkr != null && (
                <div className="flex items-start gap-2">
                  <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 leading-relaxed">
                    Projected <span className="font-semibold">Rs {Number(projPkr).toLocaleString()}</span> — Rs {Number(budget.projected_over_by_pkr).toLocaleString()} over budget
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right: area chart */}
          <div className="lg:col-span-3 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Bill History
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
                      <linearGradient id="billGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="#F8FAFC" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#94A3B8', fontSize: 10 }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#94A3B8', fontSize: 10 }}
                      axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="bill"
                      name="Bill (Rs)"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#billGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
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
                  <p className="text-xs text-slate-400">{chartData[0].month} · {chartData[0].units} units</p>
                  <p className="text-xs text-slate-300 mt-3">Add more bills to see your trend</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={20} className="text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">No bill history yet</p>
                  <p className="text-xs text-slate-300 mt-1">Scan a bill or fetch from LESCO to begin</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Budget bar — spans full width below the hero split */}
        {budget && pct !== null && (
          <div className="px-7 py-4 border-t border-slate-50 flex items-center gap-4">
            <span className="text-xs text-slate-400 flex-shrink-0">
              Rs {Number(budget.current_bill_pkr ?? 0).toLocaleString()} spent
            </span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${pctColor}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
              Rs {Number(budget.max_pkr).toLocaleString()} budget
            </span>
          </div>
        )}
      </div>

      {/* ── KPI tiles ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">

  {/* Budget - emphasized */}
  <div className="surface p-4 flex flex-col justify-between">
    <p className="text-xs text-slate-400 uppercase tracking-widest">Monthly Budget</p>
    <p className="text-2xl font-bold text-slate-900 mt-2">
      {budget ? `Rs ${Number(budget.max_pkr).toLocaleString()}` : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {pct !== null ? `${pct}% consumed` : 'Not configured yet'}
    </p>
  </div>

  {/* IoT */}
  <div className="surface p-4 flex flex-col justify-between">
    <p className="text-xs text-slate-400 uppercase tracking-widest">IoT</p>
    <p className="text-xl font-bold text-slate-900 mt-2">
      {iot ? `${iot.active_devices}` : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {iot?.latest_reading
        ? `${iot.latest_reading.power?.toFixed(0)} W live`
        : 'No data'}
    </p>
  </div>

  {/* Cycle - visually different */}
  <div className="surface p-4 bg-slate-50 flex flex-col justify-between border-slate-200">
    <p className="text-xs text-slate-400 uppercase tracking-widest">Current Cycle</p>
    <p className="text-xl font-bold text-slate-900 mt-2">
      {iotCycle ? `${iotCycle.measured_kwh?.toFixed(1)} kWh` : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {iotCycle
        ? `Day ${iotCycle.days_elapsed} / ${iotCycle.total_cycle_days}`
        : 'No cycle data'}
    </p>
  </div>

  {/* Notifications - slightly alert style */}
  <div className={`surface p-4 flex flex-col justify-between ${
    unread > 0 ? 'border-red-200 bg-red-50/30' : ''
  }`}>
    <p className="text-xs text-slate-400 uppercase tracking-widest">Notifications</p>
    <p className={`text-xl font-bold mt-2 ${unread > 0 ? 'text-red-600' : 'text-slate-900'}`}>
      {unread}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {unread > 0 ? 'Unread alerts' : 'All caught up'}
    </p>
  </div>

</div>

      {/* ── Recent bills + Quick actions ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Recent bills as activity list */}
        {bills.length > 0 ? (
          <div className="surface overflow-hidden md:col-span-2">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <p className="font-semibold text-slate-900 text-sm">Recent Bills</p>
              <Link to="/bills" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                See all <ArrowRight size={11} />
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {bills.slice(0, 5).map((b, i) => {
                const billAmt  = parseFloat(b.bill_amount)
                const prevAmt  = bills[i + 1] ? parseFloat(bills[i + 1].bill_amount) : null
                const delta    = prevAmt
                  ? ((billAmt - prevAmt) / prevAmt * 100).toFixed(0)
                  : null
                const isUp = delta !== null && parseFloat(delta) > 0
                return (
                  <div key={b.id ?? i} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText size={13} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{b.month_label}</p>
                        <p className="text-xs text-slate-400">{b.units} units · {b.source ?? 'manual'}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-slate-900">
                        Rs {Number(billAmt).toLocaleString()}
                      </p>
                      {delta !== null && (
                        <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isUp ? 'text-red-500' : 'text-emerald-500'}`}>
                          {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {isUp ? '+' : ''}{delta}%
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="surface p-6 md:col-span-2 flex flex-col items-center justify-center py-14 gap-3 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
              <FileText size={20} className="text-slate-300" />
            </div>
            <p className="text-slate-700 font-medium text-sm">No bills recorded yet</p>
            <p className="text-slate-400 text-xs">Fetch your bill history from LESCO to get started</p>
            <div className="flex gap-2 mt-1">
              <Link to="/bills" className="btn-primary text-xs px-4 py-2">View Bills</Link>
              <Link to="/profile" className="btn-secondary text-xs px-4 py-2">Re-scan Bill</Link>
            </div>
          </div>
        )}

        {/* Right column: quick actions + notification callout */}
        <div className="space-y-4">
          <div className="surface p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Quick Actions</p>
            <div className="space-y-1.5">
              {[
                { to: '/bills',           label: 'Bill History',      icon: FileText,   color: 'text-slate-400'   },
                { to: '/predictions',     label: 'Run Prediction',    icon: TrendingUp, color: 'text-emerald-500' },
                { to: '/recommendations', label: 'AI Advisor',        icon: Lightbulb,  color: 'text-violet-500'  },
                { to: '/appliances',      label: 'Appliances',        icon: Zap,        color: 'text-amber-500'   },
              ].map(({ to, label, icon: Icon, color }) => (
                <Link
                  key={to} to={to}
                  className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-700
                    hover:bg-slate-50 hover:text-blue-600 border border-slate-100 hover:border-blue-100
                    transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={14} className={`${color} group-hover:text-blue-500 transition-colors`} />
                    <span>{label}</span>
                  </div>
                  <ArrowRight size={12} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                </Link>
              ))}
            </div>
          </div>

          {unread > 0 && (
            <Link
              to="/notifications"
              className="surface p-4 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <Bell size={14} className="text-red-500" />
                </div>
                <p className="text-sm font-medium text-slate-800">
                  <span className="text-red-600 font-semibold">{unread}</span> unread alert{unread > 1 ? 's' : ''}
                </p>
              </div>
              <ArrowRight size={14} className="text-slate-400" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
