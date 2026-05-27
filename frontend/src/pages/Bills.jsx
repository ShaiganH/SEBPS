import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  RefreshCw, Plus, Trash2, CheckCircle, Loader,
  X, TrendingUp, TrendingDown, FileText,
} from 'lucide-react'

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
)

const SOURCE_BADGE = {
  lesco_fetch: 'bg-blue-50 text-blue-600 border border-blue-100',
  ocr:         'bg-violet-50 text-violet-600 border border-violet-100',
  manual:      'bg-slate-100 text-slate-500 border border-slate-200',
}

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

export default function Bills() {
  const [bills,      setBills]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refNo,      setRefNo]      = useState('')
  const [fetching,   setFetching]   = useState(false)
  const [fetchMsg,   setFetchMsg]   = useState('')
  const [fetchOk,    setFetchOk]    = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manual,     setManual]     = useState({
    month_label: '', year: new Date().getFullYear(),
    mon_idx: 1, units: '', bill_amount: '',
  })
  const [saving, setSaving] = useState(false)
  const pollRef = useRef(null)

  const loadBills = () =>
    api.get('/bills/')
      .then(r => setBills(r.data.results ?? r.data))
      .catch(console.error)
      .finally(() => setLoading(false))

  useEffect(() => { loadBills() }, [])

  const triggerFetch = async () => {
    if (!refNo.trim()) return
    setFetching(true); setFetchMsg(''); setFetchOk(false)
    try {
      const { data } = await api.post('/bills/fetch/', { ref_no: refNo.trim() })
      setFetchMsg(`Job queued (ID ${data.id}) — polling for results…`)
      pollJob(data.id)
    } catch (err) {
      setFetchMsg(err.response?.data?.detail || 'Fetch failed')
      setFetching(false)
    }
  }

  const pollJob = jobId => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/bills/fetch/${jobId}/`)
        if (data.status === 'success') {
          clearInterval(pollRef.current)
          setFetchMsg(`Fetched ${data.months_fetched} months successfully.`)
          setFetchOk(true); setFetching(false); loadBills()
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current)
          setFetchMsg(`Failed: ${data.error_message}`)
          setFetching(false)
        }
      } catch { clearInterval(pollRef.current); setFetching(false) }
    }, 3000)
  }

  const saveManual = async () => {
    setSaving(true)
    try {
      await api.post('/bills/manual/', {
        ...manual,
        units: +manual.units, bill_amount: +manual.bill_amount,
        year: +manual.year,   mon_idx: +manual.mon_idx,
      })
      setShowManual(false)
      setManual({ month_label: '', year: new Date().getFullYear(), mon_idx: 1, units: '', bill_amount: '' })
      loadBills()
    } catch (err) { alert(err.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const deleteBill = async id => {
    if (!confirm('Delete this bill record?')) return
    await api.delete(`/bills/${id}/`); loadBills()
  }

  if (loading) return <Spinner />

  // Chronological chart data (oldest → newest)
  const chartData = [...bills]
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.mon_idx - b.mon_idx)
    .map(b => ({ month: b.month_label, bill: parseFloat(b.bill_amount), units: b.units }))

  const latestBill = bills[0]
  const prevBill   = bills[1]
  const billDelta  = latestBill && prevBill
    ? ((parseFloat(latestBill.bill_amount) - parseFloat(prevBill.bill_amount)) / parseFloat(prevBill.bill_amount) * 100).toFixed(1)
    : null
  const avgBill = bills.length
    ? bills.reduce((s, b) => s + parseFloat(b.bill_amount), 0) / bills.length
    : 0
  const maxBill = bills.length
    ? Math.max(...bills.map(b => parseFloat(b.bill_amount)))
    : 0

  const heroVal     = latestBill ? parseFloat(latestBill.bill_amount) : null
  const heroWhole   = heroVal !== null ? Math.floor(heroVal).toLocaleString() : null
  const heroDecimal = heroVal !== null ? String(Math.round((heroVal % 1) * 100)).padStart(2, '0') : null

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bills</h1>
        <p className="text-slate-500 text-sm mt-1">Your LESCO billing history</p>
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-5">

          {/* Left: latest bill number */}
          <div className="lg:col-span-2 p-7 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-5">
                Latest Recorded Bill
              </p>
              {heroWhole !== null ? (
                <div>
                  <div className="flex items-end gap-1 leading-none">
                    <span className="text-lg font-medium text-slate-400 mb-1.5">Rs</span>
                    <span className="text-[3.5rem] font-bold text-slate-900 tracking-tight">{heroWhole}</span>
                    <span className="text-2xl font-semibold text-slate-400 mb-1">.{heroDecimal}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">
                    {latestBill.month_label} · {latestBill.units} units
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[3.5rem] font-bold text-slate-200 leading-none">—</p>
                  <p className="text-sm text-slate-400 mt-2">No bills recorded yet</p>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-2">
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
              {avgBill > 0 && (
                <p className="text-xs text-slate-400">
                  Avg: Rs {Math.round(avgBill).toLocaleString()} / month
                </p>
              )}
            </div>
          </div>

          {/* Right: area chart */}
          <div className="xl:col-span-3 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Bill Trend</p>
              {chartData.length > 0 && (
                <span className="text-xs text-slate-400">{chartData.length} months</span>
              )}
            </div>
            {chartData.length >= 2 ? (
              <div className="flex-1" style={{ minHeight: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="billGradB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="#F8FAFC" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="bill" name="Bill (Rs)"
                      stroke="#3B82F6" strokeWidth={2} fill="url(#billGradB)"
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
                  <p className="text-xs text-slate-300 mt-3">Fetch more bills to see your trend</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={20} className="text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">No bill data yet</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats strip */}
        {bills.length > 0 && (
          <div className="grid grid-cols-3 border-t border-slate-50 divide-x divide-slate-50">
            {[
              { label: 'Total Records', value: bills.length,                                  sub: 'bills saved'   },
              { label: 'Monthly Avg',   value: `Rs ${Math.round(avgBill).toLocaleString()}`,  sub: 'average spend' },
              { label: 'Highest Bill',  value: `Rs ${Math.round(maxBill).toLocaleString()}`,  sub: 'ever recorded' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="px-6 py-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-400">{sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Fetch from LESCO ─────────────────────────────────────────────── */}
      <div className="surface p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <RefreshCw size={15} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">Fetch from LESCO</p>
            <p className="text-xs text-slate-400">Automatically retrieves your billing history</p>
          </div>
        </div>
        <div className="flex gap-3">
          <input
            value={refNo} onChange={e => setRefNo(e.target.value)}
            placeholder="Reference number — e.g. 08 11274 1172000U"
            className="input flex-1"
          />
          <button
            onClick={triggerFetch} disabled={fetching || !refNo.trim()}
            className="btn-primary flex items-center gap-2 flex-shrink-0 px-5"
          >
            {fetching
              ? <><Loader size={14} className="animate-spin" /> Fetching…</>
              : <><RefreshCw size={14} /> Fetch</>
            }
          </button>
        </div>
        {fetchMsg && (
          <div className={`mt-3 flex items-center gap-2 text-sm px-3.5 py-2.5 rounded-xl ${
            fetchOk     ? 'bg-emerald-50 text-emerald-700' :
            fetching    ? 'bg-blue-50 text-blue-600'       :
                          'bg-red-50 text-red-600'
          }`}>
            {fetchOk
              ? <CheckCircle size={14} />
              : <Loader size={14} className={fetching ? 'animate-spin' : ''} />
            }
            {fetchMsg}
          </div>
        )}
      </div>

      {/* ── Bills table ──────────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-900 text-sm">All Bills</p>
            <p className="text-xs text-slate-400 mt-0.5">{bills.length} record{bills.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowManual(p => !p)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
              showManual ? 'bg-slate-100 text-slate-600' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {showManual ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add Manual</>}
          </button>
        </div>

        {/* Manual add form */}
        {showManual && (
          <div className="px-6 py-5 bg-slate-50/60 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Add Bill Manually</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ['Month Label', 'text',   'month_label',  'Aug-25'],
                ['Year',        'number', 'year',         '2025'],
                ['Month Index', 'number', 'mon_idx',      '8'],
                ['Units (kWh)', 'number', 'units',        '280'],
                ['Bill Amount', 'number', 'bill_amount',  '3500'],
              ].map(([label, type, key, ph]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    type={type} value={manual[key]} placeholder={ph}
                    onChange={e => setManual(p => ({ ...p, [key]: e.target.value }))}
                    className="input"
                  />
                </div>
              ))}
              <div className="flex items-end">
                <button onClick={saveManual} disabled={saving} className="btn-primary w-full">
                  {saving ? 'Saving…' : 'Save Bill'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-2">
              <FileText size={20} className="text-slate-400" />
            </div>
            <p className="text-slate-700 font-medium text-sm">No bills yet</p>
            <p className="text-slate-400 text-xs">Fetch from LESCO or add a bill manually above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  {['Month', 'Units', 'Bill Amount', 'Change', 'Source', ''].map(h => (
                    <th key={h} className="text-left px-6 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bills.map((b, i) => {
                  const amt     = parseFloat(b.bill_amount)
                  const prevAmt = bills[i + 1] ? parseFloat(bills[i + 1].bill_amount) : null
                  const delta   = prevAmt ? ((amt - prevAmt) / prevAmt * 100).toFixed(0) : null
                  const isUp    = delta !== null && parseFloat(delta) > 0
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText size={12} className="text-slate-500" />
                          </div>
                          <span className="font-semibold text-slate-800">{b.month_label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-blue-600 font-medium tabular-nums">{b.units}</td>
                      <td className="px-6 py-3.5 font-semibold text-slate-900 tabular-nums">
                        Rs {Number(amt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5">
                        {delta !== null ? (
                          <span className={`text-xs font-medium flex items-center gap-0.5 ${
                            isUp ? 'text-red-500' : 'text-emerald-500'
                          }`}>
                            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {isUp ? '+' : ''}{delta}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          SOURCE_BADGE[b.source] ?? SOURCE_BADGE.manual
                        }`}>
                          {b.source?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <button onClick={() => deleteBill(b.id)}
                          className="text-slate-200 hover:text-red-400 transition-colors p-1">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
