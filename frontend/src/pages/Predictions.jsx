import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, RefreshCw, ChevronDown, ChevronUp,
  Cpu, Activity, X, Zap,
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
            {p.name === 'Predicted Bill' ? `Rs ${Number(p.value).toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function timeAgo(isoStr) {
  if (!isoStr) return null
  const secs = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (secs < 60)    return `${secs}s ago`
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function Predictions() {
  const [iotStatus,  setIotStatus]  = useState(null)
  const [latest,     setLatest]     = useState(null)
  const [all,        setAll]        = useState([])
  const [compare,    setCompare]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [form,       setForm]       = useState({
    units_so_far: '', days_elapsed: '', total_cycle_days: '',
  })
  const [error, setError] = useState('')

  const loadAll = useCallback(() =>
    Promise.all([
      api.get('/predictions/iot-status/').catch(() => ({ data: null })),
      api.get('/predictions/latest/').catch(() => ({ data: null })),
      api.get('/predictions/').catch(() => ({ data: [] })),
    ]).then(([s, l, a]) => {
      setIotStatus(s.data)
      setLatest(l.data?.detail ? null : l.data)
      setAll(a.data?.results ?? a.data ?? [])
    }).finally(() => setLoading(false))
  , [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => {
    if (!iotStatus?.has_iot) return
    const t = setInterval(() => {
      api.get('/predictions/iot-status/').then(r => setIotStatus(r.data)).catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [iotStatus?.has_iot])

  const loadCompare = async id => {
    try {
      const { data } = await api.get(`/predictions/${id}/compare/`)
      setCompare({ id, data })
    } catch { setCompare(null) }
  }

  const generate = async (manual = false) => {
    setGenerating(true); setError('')
    try {
      const body = manual ? {
        ...(form.units_so_far     !== '' ? { units_so_far:     +form.units_so_far }     : {}),
        ...(form.days_elapsed     !== '' ? { days_elapsed:     +form.days_elapsed }     : {}),
        ...(form.total_cycle_days !== '' ? { total_cycle_days: +form.total_cycle_days } : {}),
      } : {}
      await api.post('/predictions/generate/', body)
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'Generation failed')
    } finally { setGenerating(false) }
  }

  if (loading) return <Spinner />

  const cycleProgress = iotStatus
    ? Math.min(100, Math.round((iotStatus.days_elapsed / iotStatus.total_cycle_days) * 100))
    : 0

  // Prediction history chart: newest last (chronological)
  const predChartData = [...all]
    .reverse()
    .slice(-12)
    .map((p, i) => ({
      run:  `#${p.id}`,
      bill: parseFloat(p.predicted_bill),
      units: p.predicted_units,
    }))

  // Hero numbers
  const heroVal     = latest ? parseFloat(latest.predicted_bill) : null
  const heroWhole   = heroVal !== null ? Math.floor(heroVal).toLocaleString() : null
  const heroDecimal = heroVal !== null ? String(Math.round((heroVal % 1) * 100)).padStart(2, '0') : null

  return (
    <div className="space-y-5">


      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-5">

          {/* Left: predicted bill */}
          <div className="lg:col-span-2 p-7 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100">
            <div>
              <div className="flex items-center justify-between mb-5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Predicted This Month
                </p>
                {iotStatus?.has_iot && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-600">
                    <Cpu size={10} /> IoT Live
                  </span>
                )}
              </div>
              {heroWhole !== null ? (
                <div>
                  <div className="flex items-end gap-1 leading-none">
                    <span className="text-lg font-medium text-slate-400 mb-1.5">Rs</span>
                    <span className="text-[3.5rem] font-bold text-slate-900 tracking-tight">{heroWhole}</span>
                    <span className="text-2xl font-semibold text-slate-400 mb-1">.{heroDecimal}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">
                    {latest.predicted_units} kWh · via {latest.primary_source}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[3.5rem] font-bold text-slate-200 leading-none">—</p>
                  <p className="text-sm text-slate-400 mt-2">Run a prediction to see your forecast</p>
                </div>
              )}
            </div>

            {/* Generate button lives here, inside the hero */}
            <div className="mt-6 space-y-2">
              {error && (
                <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                  ⚠ {error}
                </div>
              )}
              <button
                onClick={() => generate(false)} disabled={generating}
                className="bg-white text-[#8B5CF6] rounded-sm border border-slate-200 w-full flex items-center justify-center gap-2 py-3 text-sm hover:bg-[#8B5CF6] hover:border-[#8B5CF6] hover:text-white transition-colors duration-200"
              >
                {generating ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generating…</>
                ) : (
                  <><TrendingUp size={15} /> Predict Now{iotStatus?.has_iot ? ' (IoT)' : ''}</>
                )}
              </button>
              <button
                onClick={() => setShowManual(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
              >
                {showManual ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showManual ? 'Hide override' : 'Override values manually'}
              </button>
              {showManual && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <p className="text-xs text-slate-400">Leave blank to use IoT / calendar auto-values.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Units So Far',  'units_so_far',     iotStatus?.units_so_far?.toFixed(1) ?? '0'],
                      ['Days Elapsed',  'days_elapsed',     String(iotStatus?.days_elapsed ?? 15)      ],
                      ['Cycle Days',    'total_cycle_days', String(iotStatus?.total_cycle_days ?? 30)  ],
                    ].map(([label, key, placeholder]) => (
                      <div key={key}>
                        <label className="label">{label}</label>
                        <input
                          type="number" min="0" placeholder={placeholder}
                          value={form[key]}
                          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                          className="input text-xs py-2"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => generate(true)} disabled={generating}
                    className="btn-secondary flex items-center gap-2 text-xs px-4 py-2"
                  >
                    {generating ? 'Generating…' : <><TrendingUp size={12} /> Run with Override</>}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: prediction run history chart */}
          <div className="lg:col-span-3 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Prediction Runs
              </p>
              {predChartData.length > 0 && (
                <span className="text-xs text-slate-400">{predChartData.length} runs</span>
              )}
            </div>
            {predChartData.length >= 2 ? (
              <div className="flex-1" style={{ minHeight: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={predChartData} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="#F8FAFC" vertical={false} />
                    <XAxis dataKey="run" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="bill" name="Predicted Bill"
                      stroke="#8B5CF6" strokeWidth={2} fill="url(#predGrad)"
                      dot={false} activeDot={{ r: 4, fill: '#8B5CF6', strokeWidth: 2, stroke: '#fff' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : predChartData.length === 1 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-900 mb-1">
                    Rs {Number(predChartData[0].bill).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">First prediction run</p>
                  <p className="text-xs text-slate-300 mt-3">Run more predictions to see your trend</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={20} className="text-violet-300" />
                  </div>
                  <p className="text-sm text-slate-400">No predictions yet</p>
                  <p className="text-xs text-slate-300 mt-1">Click Predict Now to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cycle progress strip */}
        {iotStatus && (
          <div className="px-7 py-4 border-t border-slate-50 flex items-center gap-4">
            <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
              Day {iotStatus.days_elapsed} of {iotStatus.total_cycle_days}
            </span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${cycleProgress}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{cycleProgress}% through cycle</span>
          </div>
        )}
      </div>

      {/* ── Billing Cycle Status tiles ────────────────────────────────────── */}
{/* ── Billing Cycle Status tiles ────────────────────────────────────── */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">

  <div className="surface p-4 flex flex-col justify-between">
    <p className="text-xs text-slate-400 uppercase tracking-widest">Consumed (IoT)</p>
    <p className="text-xl font-bold text-slate-900 mt-2">
      {iotStatus?.measured_kwh != null ? `${iotStatus.measured_kwh.toFixed(2)} kWh` : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {iotStatus?.current_bill_pkr > 0
        ? `Rs ${Number(iotStatus.current_bill_pkr).toLocaleString()} est.`
        : 'this cycle'}
    </p>
  </div>

  <div className="surface p-4 flex flex-col justify-between">
    <p className="text-xs text-slate-400 uppercase tracking-widest">Days Elapsed</p>
    <p className="text-xl font-bold text-slate-900 mt-2">
      {iotStatus ? `${iotStatus.days_elapsed}` : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {iotStatus ? `of ${iotStatus.total_cycle_days} days` : 'no cycle data'}
    </p>
  </div>

  <div className="surface p-4 flex flex-col justify-between">
    <p className="text-xs text-slate-400 uppercase tracking-widest">Daily Rate</p>
    <p className="text-xl font-bold text-slate-900 mt-2">
      {iotStatus?.iot_daily_rate_kwh != null
        ? `${iotStatus.iot_daily_rate_kwh.toFixed(2)} kWh`
        : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      last 2-hour window
    </p>
  </div>

  <div className="surface p-4 flex flex-col justify-between">
    <p className="text-xs text-slate-400 uppercase tracking-widest">Last Predicted</p>
    <p className="text-sm font-semibold text-slate-900 mt-2">
      {iotStatus?.last_prediction_at
        ? timeAgo(iotStatus.last_prediction_at)
        : '—'}
    </p>
    <p className="text-xs text-slate-500 mt-1">
      {iotStatus?.last_prediction_at
        ? new Date(iotStatus.last_prediction_at).toLocaleTimeString('en-PK', {
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'never'}
    </p>
  </div>

</div>

      {/* IoT rate info banner */}
      {iotStatus?.has_iot && iotStatus.iot_runtime_hours > 0 && (
        <div className="surface p-4 flex items-start gap-3 border-blue-100">
          <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Cpu size={13} className="text-blue-600" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Measured <span className="font-semibold">{iotStatus.measured_kwh?.toFixed(3)} kWh</span> this cycle
            {' '}({iotStatus.iot_runtime_hours >= 1
              ? `${iotStatus.iot_runtime_hours.toFixed(1)}h runtime`
              : `${Math.round(iotStatus.iot_runtime_hours * 60)}m runtime`})
            {' · '}
            Rate (last 2h): <span className="font-semibold">{iotStatus.iot_daily_rate_kwh?.toFixed(2)} kWh/day</span>
            {' → '}
            projected <span className="font-semibold">{iotStatus.units_so_far?.toFixed(1)} kWh</span> over {iotStatus.days_elapsed} days
          </p>
        </div>
      )}

      {/* ── Latest prediction detail ──────────────────────────────────────── */}
      {latest && (
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <p className="font-semibold text-slate-900 text-sm">
              Latest Prediction
              <span className="text-slate-400 font-normal ml-1.5">#{latest.id}</span>
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {new Date(latest.created_at).toLocaleString()}
              </span>
              <button onClick={() => loadCompare(latest.id)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                Compare models
              </button>
            </div>
          </div>

          {latest.result?.prediction?.bill && (
            <div className="px-6 py-5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Bill Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(latest.result.prediction.bill).map(([k, v]) => (
                  <div key={k} className="flex justify-between bg-slate-50 rounded-xl px-3.5 py-2.5 text-xs">
                    <span className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="font-semibold text-slate-800">
                      {typeof v === 'number' ? `Rs ${v.toLocaleString()}` : v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Model Comparison ─────────────────────────────────────────────── */}
      {compare && (
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <p className="font-semibold text-slate-900 text-sm">
              Model Comparison — #{compare.id}
            </p>
            <button onClick={() => setCompare(null)}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  {['Model', 'Predicted Units', 'Bill (Rs)', 'LOO MAE'].map(h => (
                    <th key={h} className="text-left px-6 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(compare.data).map(([name, vals]) => (
                  <tr key={name} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-slate-800">{name}</td>
                    <td className="px-6 py-3.5 text-blue-600 font-medium tabular-nums">{vals.predicted_units}</td>
                    <td className="px-6 py-3.5 font-semibold text-slate-900 tabular-nums">
                      {Number(vals.predicted_pkr).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 text-slate-400 tabular-nums">{vals.loo_mae}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Prediction History ────────────────────────────────────────────── */}
      {all.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="font-semibold text-slate-900 text-sm">Prediction History</p>
          </div>
          <div className="divide-y divide-slate-50">
            {all.slice(0, 10).map(p => (
              <div key={p.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingUp size={12} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Run #{p.id}</p>
                    <p className="text-xs text-slate-400">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <span className="text-sm font-medium text-blue-600 tabular-nums">{p.predicted_units} kWh</span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">
                    Rs {Number(p.predicted_bill).toLocaleString()}
                  </span>
                  <button onClick={() => loadCompare(p.id)}
                    className="text-xs text-slate-400 hover:text-blue-600 transition-colors">
                    compare
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
