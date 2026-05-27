import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Cpu, Plus, RefreshCw, Radio, Copy, Play, Square, Zap, SlidersHorizontal, X } from 'lucide-react'

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
)

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-2 h-2 rounded-full" style={{ background: p.stroke }} />
          <span>{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const LOAD_PRESETS = [
  { label: 'Bulb',     watt: 60    },
  { label: 'Fan',      watt: 75    },
  { label: 'TV',       watt: 150   },
  { label: 'Fridge',   watt: 300   },
  { label: 'Pump',     watt: 750   },
  { label: 'AC 1T',    watt: 1200  },
  { label: 'AC 1.5T',  watt: 1800  },
  { label: 'Washing',  watt: 500   },
]

const TEST_PRESETS = [
  { label: '10 kW',  watt: 10_000  },
  { label: '25 kW',  watt: 25_000  },
  { label: '50 kW',  watt: 50_000  },
  { label: '100 kW', watt: 100_000 },
]

const INTERVALS = [1, 2, 5, 10]

export default function IoT() {
  const [devices,  setDevices]  = useState([])
  const [selected, setSelected] = useState(null)
  const [readings, setReadings] = useState([])
  const [stats,    setStats]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [period,   setPeriod]   = useState('24h')
  const [token,    setToken]    = useState(null)
  const [liveReading,  setLiveReading]  = useState(null)
  const [wsConnected,  setWsConnected]  = useState(false)
  const [form,    setForm]    = useState({ name: '', device_id: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [msg,     setMsg]     = useState('')
  const [msgOk,   setMsgOk]   = useState(false)
  const [simState,    setSimState]    = useState({})
  const [simWattage,  setSimWattage]  = useState({})
  const [simInterval, setSimInterval] = useState({})
  const wsRef = useRef(null)

  const loadDevices = () =>
    api.get('/iot/devices/').then(r => setDevices(r.data?.results ?? r.data)).finally(() => setLoading(false))

  useEffect(() => { loadDevices() }, [])
  useEffect(() => {
    devices.forEach(d => {
      api.get(`/iot/devices/${d.id}/simulate/`)
        .then(r => setSimState(p => ({ ...p, [d.id]: r.data })))
        .catch(() => {})
    })
  }, [devices])

  useEffect(() => {
    if (!selected) return
    loadDeviceData(selected)
    connectWs(selected)
    return () => { if (wsRef.current) wsRef.current.close() }
  }, [selected, period])

  const loadDeviceData = async deviceId => {
    try {
      const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720
      const [r, s] = await Promise.all([
        api.get(`/iot/readings/${deviceId}/?hours=${hours}`),
        api.get(`/iot/stats/${deviceId}/?period=${period}`),
      ])
      const data = (r.data?.results ?? r.data) || []
      setReadings(data.slice(0, 100).reverse().map(r => ({
        time: new Date(r.time).toLocaleTimeString(),
        power: r.power, voltage: r.voltage, energy: r.energy,
      })))
      setStats(s.data)
    } catch (err) { console.error(err) }
  }

  const connectWs = deviceId => {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(`ws://localhost:8000/ws/iot/${deviceId}/`)
    ws.onopen  = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'reading') {
          setLiveReading(d.data)
          setReadings(prev => {
            const pt = {
              time: new Date(d.data.time).toLocaleTimeString(),
              power: d.data.power, voltage: d.data.voltage, energy: d.data.energy,
            }
            return [...prev.slice(-99), pt]
          })
        }
      } catch {}
    }
    wsRef.current = ws
  }

  const getToken = async pk => {
    try { const { data } = await api.get(`/iot/devices/${pk}/token/`); setToken(data); setMsgOk(true) }
    catch { setMsg('Could not retrieve token'); setMsgOk(false) }
  }

  const rotateToken = async pk => {
    try { const { data } = await api.post(`/iot/devices/${pk}/token/`); setToken(data); setMsg('Token rotated!'); setMsgOk(true) }
    catch { setMsg('Failed to rotate token'); setMsgOk(false) }
  }

  const addDevice = async () => {
    try {
      await api.post('/iot/devices/', form)
      setShowAdd(false); setForm({ name: '', device_id: '' }); loadDevices()
    } catch (err) { setMsg(err.response?.data?.detail || 'Add failed'); setMsgOk(false) }
  }

  const del = async id => {
    if (!confirm('Remove this device?')) return
    await api.delete(`/iot/devices/${id}/`)
    loadDevices(); setSelected(null)
  }

  const simControl = async (pk, action, extra = {}) => {
    const watt     = extra.wattage_w       ?? simState[pk]?.wattage_w       ?? 1500
    const interval = extra.interval_seconds ?? simInterval[pk]               ?? 5
    try {
      const { data } = await api.post(`/iot/devices/${pk}/simulate/`, {
        action, wattage_w: watt, interval_seconds: interval, ...extra,
      })
      setSimState(p => ({
        ...p,
        [pk]: { ...p[pk], ...data, is_running: action === 'start' ? true : action === 'stop' ? false : p[pk]?.is_running },
      }))
      setMsg(
        action === 'start'  ? `Simulator started @ ${watt.toLocaleString()}W` :
        action === 'stop'   ? 'Simulator stopped'                              :
        `Load updated to ${watt.toLocaleString()}W`
      )
      setMsgOk(true)
    } catch (err) { setMsg(err.response?.data?.detail || `${action} failed`); setMsgOk(false) }
  }

  if (loading) return <Spinner />

  const selectedDevice = devices.find(d => d.device_id === selected)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IoT Devices</h1>
          <p className="text-slate-500 text-sm mt-1">Monitor real-time energy consumption from your ESP32 meters</p>
        </div>
        <button
          onClick={() => setShowAdd(p => !p)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
            showAdd ? 'btn-secondary' : 'btn-primary'
          }`}
        >
          {showAdd ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Register Device</>}
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${msgOk ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
          {msg}
        </div>
      )}

      {/* Add device form */}
      {showAdd && (
        <div className="surface p-6">
          <p className="font-semibold text-slate-900 text-sm mb-4">Register ESP32 Device</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">Device Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="My ESP32 Meter" className="input" />
            </div>
            <div>
              <label className="label">Device ID</label>
              <input value={form.device_id} onChange={e => setForm(p => ({ ...p, device_id: e.target.value }))}
                placeholder="esp32-001" className="input font-mono" />
            </div>
          </div>
          <button onClick={addDevice} className="btn-primary px-5">Register Device</button>
        </div>
      )}

      {/* Device cards */}
      {devices.length === 0 ? (
        <div className="surface p-6">
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-2">
              <Cpu size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-700 font-medium text-sm">No devices registered</p>
            <p className="text-slate-400 text-xs">Click "Register Device" to add your ESP32 meter</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map(d => {
            const sim = simState[d.id] || {}
            return (
              <div
                key={d.id}
                onClick={() => setSelected(d.device_id === selected ? null : d.device_id)}
                className={`surface p-5 cursor-pointer transition-all hover:shadow-md ${
                  d.device_id === selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${d.device_id === selected ? 'bg-blue-50' : 'bg-slate-100'}`}>
                      <Cpu size={17} className={d.device_id === selected ? 'text-blue-600' : 'text-slate-500'} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{d.name}</p>
                      <p className="text-xs font-mono text-slate-400">{d.device_id}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      d.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {d.is_active ? 'active' : 'inactive'}
                    </span>
                    {sim.is_running && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 flex items-center gap-1">
                        <Zap size={9} className="animate-pulse" /> {sim.wattage_w?.toLocaleString()}W
                      </span>
                    )}
                  </div>
                </div>
                {d.last_seen && (
                  <p className="text-xs text-slate-400 mb-3">
                    Last seen {new Date(d.last_seen).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                <div className="flex gap-3 pt-3 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                  <button onClick={() => getToken(d.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors">
                    <Copy size={11} /> Token
                  </button>
                  <button onClick={() => rotateToken(d.id)}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors">
                    <RefreshCw size={11} /> Rotate
                  </button>
                  <button onClick={() => del(d.id)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-auto">
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Token display */}
      {token && (
        <div className="surface p-5">
          <p className="font-semibold text-slate-900 text-sm mb-1">Device Bearer Token</p>
          <p className="text-xs text-slate-400 mb-3">
            Use as <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">X-Device-Token</code> header in your ESP32 firmware
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 font-mono text-sm text-emerald-700 break-all">
            {token.token}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            POST readings to <code className="text-slate-600">http://your-server/api/v1/iot/readings/</code>
          </p>
        </div>
      )}

      {/* ── Simulator Panel ──────────────────────────────────────────────── */}
      {selected && selectedDevice && (() => {
        const dev        = selectedDevice
        const sim        = simState[dev.id] || {}
        const isRunning  = !!sim.is_running
        const curWatt    = simWattage[dev.id]  ?? sim.wattage_w       ?? 1500
        const curIntv    = simInterval[dev.id] ?? sim.interval_seconds ?? 5

        return (
          <div className={`surface p-6 border ${isRunning ? 'border-orange-200 ring-1 ring-orange-100' : ''}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRunning ? 'bg-orange-50' : 'bg-slate-100'}`}>
                  <SlidersHorizontal size={15} className={isRunning ? 'text-orange-600' : 'text-slate-500'} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Device Simulator</p>
                  {isRunning && (
                    <p className="text-xs text-orange-600 mt-0.5 flex items-center gap-1">
                      <Zap size={10} className="animate-pulse" /> Running @ {sim.wattage_w?.toLocaleString()}W · every {sim.interval_seconds}s
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => simControl(dev.id, isRunning ? 'stop' : 'start', { wattage_w: curWatt, interval_seconds: curIntv })}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isRunning ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isRunning ? <><Square size={12} /> Stop</> : <><Play size={12} /> Start</>}
              </button>
            </div>

            {/* Interval */}
            <div className="mb-5">
              <label className="label">Reading Interval</label>
              <div className="flex gap-2">
                {INTERVALS.map(s => (
                  <button key={s}
                    onClick={() => setSimInterval(prev => ({ ...prev, [dev.id]: s }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-mono border font-medium transition-colors ${
                      curIntv === s
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>
                    {s}s
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Use 1s for real-time chart testing</p>
            </div>

            {/* Appliance presets */}
            <div className="mb-4">
              <label className="label">Appliance Load Presets</label>
              <div className="flex flex-wrap gap-2">
                {LOAD_PRESETS.map(p => (
                  <button key={p.label}
                    onClick={() => {
                      setSimWattage(prev => ({ ...prev, [dev.id]: p.watt }))
                      if (isRunning) simControl(dev.id, 'setload', { wattage_w: p.watt })
                    }}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${
                      curWatt === p.watt
                        ? 'bg-orange-50 border-orange-300 text-orange-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>
                    {p.label} <span className="font-mono text-[10px]">{p.watt}W</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Test presets */}
            <div className="mb-5">
              <label className="label">
                Fast-Data Test Presets{' '}
                <span className="text-slate-400 font-normal">(accumulates kWh quickly for prediction testing)</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {TEST_PRESETS.map(p => (
                  <button key={p.label}
                    onClick={() => {
                      setSimWattage(prev => ({ ...prev, [dev.id]: p.watt }))
                      if (isRunning) simControl(dev.id, 'setload', { wattage_w: p.watt })
                    }}
                    className={`py-2 rounded-xl text-xs border font-mono font-medium transition-colors ${
                      curWatt === p.watt
                        ? 'bg-violet-50 border-violet-300 text-violet-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-violet-200 hover:text-violet-600'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom wattage */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="label">Custom Wattage (50 – 100,000 W)</label>
                <input
                  type="number" min="50" max="100000" step="50"
                  value={curWatt}
                  onChange={e => setSimWattage(prev => ({ ...prev, [dev.id]: +e.target.value }))}
                  className="input font-mono"
                />
              </div>
              <button
                onClick={() => simControl(dev.id, isRunning ? 'setload' : 'start', { wattage_w: curWatt, interval_seconds: curIntv })}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 rounded-xl text-sm font-medium text-white transition-colors whitespace-nowrap"
              >
                {isRunning ? 'Apply Load' : 'Start at this W'}
              </button>
            </div>

            {isRunning && (
              <div className="mt-4 px-4 py-3 bg-orange-50 border border-orange-100 rounded-xl">
                <p className="text-xs text-orange-700">
                  ⚡ {sim.wattage_w?.toLocaleString()}W · every {sim.interval_seconds}s ·{' '}
                  <span className="font-mono font-semibold">
                    ~{((sim.wattage_w / 1000) * (sim.interval_seconds / 3600)).toFixed(4)} kWh/reading
                  </span>
                  {' '}· budget alerts every 5 min · auto-predict every 30 min
                </p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Live readings */}
      {selected && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{selectedDevice?.name}</h2>
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
              wsConnected ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
            }`}>
              <Radio size={10} className={wsConnected ? 'animate-pulse' : ''} />
              {wsConnected ? 'Live' : 'Offline'}
            </div>
            <div className="flex gap-1 ml-auto">
              {['24h', '7d', '30d'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    period === p ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {liveReading && (
            <div className="surface p-5 border-blue-100 ring-1 ring-blue-100">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Radio size={11} className="animate-pulse" /> Live Reading
              </p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  ['Power', 'W',   liveReading.power],
                  ['Voltage', 'V', liveReading.voltage],
                  ['Current', 'A', liveReading.current],
                  ['Energy', 'kWh',liveReading.energy],
                  ['Freq', 'Hz',   liveReading.frequency],
                  ['PF', '',       liveReading.power_factor],
                ].map(([l, u, v]) => (
                  <div key={l} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 font-medium">{l}</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">
                      {typeof v === 'number' ? v.toFixed(2) : v ?? '—'}
                    </p>
                    <p className="text-[10px] text-slate-400">{u}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['Energy',     `${stats.total_energy_kwh} kWh`,            'text-blue-600'   ],
                ['Avg Power',  `${stats.avg_power_w} W`,                   'text-emerald-600'],
                ['Peak Power', `${stats.max_power_w} W`,                   'text-amber-600'  ],
                ['Est. Cost',  `Rs ${Number(stats.estimated_cost_pkr).toLocaleString()}`, 'text-slate-900'],
              ].map(([label, value, color]) => (
                <div key={label} className="surface p-4">
                  <p className="text-xs text-slate-400 mb-1">{label} ({stats.period})</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {readings.length > 0 && (
            <div className="surface p-6">
              <p className="font-semibold text-slate-900 text-sm mb-5">Power &amp; Energy ({period})</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={readings}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line yAxisId="l" type="monotone" dataKey="power"  stroke="#3B82F6" dot={false} name="Power (W)"    strokeWidth={2} />
                  <Line yAxisId="r" type="monotone" dataKey="energy" stroke="#10B981" dot={false} name="Energy (kWh)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {readings.length === 0 && (
            <div className="surface p-6">
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-2">
                  <Cpu size={22} className="text-slate-400" />
                </div>
                <p className="text-slate-700 font-medium text-sm">No readings yet</p>
                <p className="text-slate-400 text-xs">Start the simulator above or connect your ESP32.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
