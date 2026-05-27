import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, Dimensions } from 'react-native'
import { LineChart } from 'react-native-chart-kit'
import { Cpu, Plus, Play, Square, Zap, Radio, Copy, RefreshCw, Trash2, X, SlidersHorizontal } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import api, { WS_BASE } from '../api/client'
import { C, S } from '../theme'
import { PageLoader, Card, EmptyState, Divider, PrimaryBtn, StatusMsg } from '../components'

const W = Dimensions.get('window').width

const LOAD_PRESETS = [
  { label: 'Bulb',    watt: 60    },
  { label: 'Fan',     watt: 75    },
  { label: 'TV',      watt: 150   },
  { label: 'Fridge',  watt: 300   },
  { label: 'AC 1T',   watt: 1200  },
  { label: 'AC 1.5T', watt: 1800  },
]
const TEST_PRESETS = [
  { label: '10 kW',   watt: 10_000  },
  { label: '25 kW',   watt: 25_000  },
  { label: '50 kW',   watt: 50_000  },
  { label: '100 kW',  watt: 100_000 },
]
const INTERVALS = [1, 2, 5, 10]

export default function IoTScreen() {
  const [devices,    setDevices]    = useState([])
  const [selected,   setSelected]   = useState(null)
  const [readings,   setReadings]   = useState([])
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [period,     setPeriod]     = useState('24h')
  const [simState,   setSimState]   = useState({})
  const [curWatt,    setCurWatt]    = useState('1500')
  const [curInterval,setCurInterval]= useState(5)
  const [liveReading,setLiveReading]= useState(null)
  const [wsConn,     setWsConn]     = useState(false)
  const [showAdd,    setShowAdd]    = useState(false)
  const [addForm,    setAddForm]    = useState({ name: '', device_id: '' })
  const [msg,        setMsg]        = useState('')
  const [msgOk,      setMsgOk]      = useState(false)
  const wsRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/iot/devices/')
      const devs = r.data?.results ?? r.data ?? []
      setDevices(devs)
      devs.forEach(d => {
        api.get(`/iot/devices/${d.id}/simulate/`)
          .then(r => setSimState(p => ({ ...p, [d.id]: r.data })))
          .catch(() => {})
      })
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [])

  const loadDeviceData = useCallback(async (deviceId) => {
    try {
      const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720
      const [rr, rs] = await Promise.all([
        api.get(`/iot/readings/${deviceId}/?hours=${hours}`),
        api.get(`/iot/stats/${deviceId}/?period=${period}`),
      ])
      const data = (rr.data?.results ?? rr.data ?? [])
      setReadings(data.slice(0, 80).reverse().map(r => ({
        time:    new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        power:   r.power,
        energy:  r.energy,
        voltage: r.voltage,
      })))
      setStats(rs.data)
    } catch {}
  }, [period])

  const connectWs = (deviceId) => {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(`${WS_BASE}/ws/iot/${deviceId}/`)
    ws.onopen    = () => setWsConn(true)
    ws.onclose   = () => setWsConn(false)
    ws.onerror   = () => setWsConn(false)
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'reading') {
          setLiveReading(d.data)
          setReadings(prev => {
            const pt = {
              time:    new Date(d.data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              power:   d.data.power,
              energy:  d.data.energy,
              voltage: d.data.voltage,
            }
            return [...prev.slice(-79), pt]
          })
        }
      } catch {}
    }
    wsRef.current = ws
  }

  useEffect(() => {
    if (!selected) return
    setLiveReading(null)
    loadDeviceData(selected)
    connectWs(selected)
    return () => { if (wsRef.current) wsRef.current.close() }
  }, [selected, period])

  const sim = selected ? (simState[devices.find(d => d.device_id === selected)?.id] ?? {}) : {}
  const selectedDev = devices.find(d => d.device_id === selected)
  const isRunning = !!sim.is_running

  const simControl = async (action, extra = {}) => {
    if (!selectedDev) return
    try {
      const { data } = await api.post(`/iot/devices/${selectedDev.id}/simulate/`, {
        action,
        wattage_w: parseFloat(curWatt) || 1500,
        interval_seconds: curInterval,
        ...extra,
      })
      setSimState(p => ({
        ...p,
        [selectedDev.id]: {
          ...p[selectedDev.id], ...data,
          is_running: action === 'start' ? true : action === 'stop' ? false : p[selectedDev.id]?.is_running,
        },
      }))
      setMsg(
        action === 'start'  ? `Started @ ${(parseFloat(curWatt) || 1500).toLocaleString()}W` :
        action === 'stop'   ? 'Simulator stopped' :
        `Load → ${(extra.wattage_w ?? parseFloat(curWatt)).toLocaleString()}W`
      )
      setMsgOk(true)
    } catch (e) {
      setMsg(e.response?.data?.detail ?? `${action} failed`); setMsgOk(false)
    }
  }

  const addDevice = async () => {
    try {
      await api.post('/iot/devices/', addForm)
      setShowAdd(false); setAddForm({ name: '', device_id: '' }); load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Add failed'); setMsgOk(false)
    }
  }

  const deleteDevice = (id) => {
    Alert.alert('Remove Device', 'Remove this device and all its readings?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await api.delete(`/iot/devices/${id}/`); load(); setSelected(null)
      }},
    ])
  }

  const getToken = async (pk) => {
    try {
      const { data } = await api.get(`/iot/devices/${pk}/token/`)
      await Clipboard.setStringAsync(data.token)
      setMsg('Token copied to clipboard'); setMsgOk(true)
    } catch { setMsg('Could not get token'); setMsgOk(false) }
  }

  const rotateToken = async (pk) => {
    const { data } = await api.post(`/iot/devices/${pk}/token/`)
    await Clipboard.setStringAsync(data.token)
    setMsg('Token rotated & copied!'); setMsgOk(true)
  }

  const chartData = readings.length >= 2 ? {
    labels: readings.filter((_, i) => i % Math.ceil(readings.length / 6) === 0).map(r => r.time),
    datasets: [
      { data: readings.map(r => r.power || 0), color: () => C.primary, strokeWidth: 2 },
    ],
  } : null

  if (loading) return <PageLoader />

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>IoT Devices</Text>
          <Text style={styles.h1Sub}>Real-time energy monitoring</Text>
        </View>
        <TouchableOpacity onPress={() => setShowAdd(p => !p)} style={[styles.addBtn, showAdd && { backgroundColor: C.border }]}>
          {showAdd ? <X size={15} color={C.text} /> : <Plus size={15} color="#fff" />}
        </TouchableOpacity>
      </View>

      {msg ? <StatusMsg ok={msgOk} msg={msg} /> : null}

      {/* Add device form */}
      {showAdd && (
        <Card>
          <Text style={styles.sectionTitle}>Register ESP32 Device</Text>
          <View style={{ marginTop: 12 }}>
            <Text style={S.label}>Device Name</Text>
            <TextInput
              value={addForm.name}
              onChangeText={v => setAddForm(p => ({ ...p, name: v }))}
              placeholder="My ESP32 Meter"
              placeholderTextColor={C.textMuted}
              style={[S.input, { marginBottom: 12 }]}
            />
            <Text style={S.label}>Device ID</Text>
            <TextInput
              value={addForm.device_id}
              onChangeText={v => setAddForm(p => ({ ...p, device_id: v }))}
              placeholder="esp32-001"
              placeholderTextColor={C.textMuted}
              style={[S.input, { fontFamily: 'monospace', marginBottom: 16 }]}
              autoCapitalize="none"
            />
            <PrimaryBtn label="Register Device" onPress={addDevice} />
          </View>
        </Card>
      )}

      {/* Device list */}
      {devices.length === 0 ? (
        <Card>
          <EmptyState Icon={Cpu} title="No devices registered" subtitle="Tap + to add your ESP32 meter" />
        </Card>
      ) : (
        devices.map(d => {
          const s = simState[d.id] ?? {}
          const isSel = d.device_id === selected
          return (
            <TouchableOpacity
              key={d.id}
              onPress={() => setSelected(isSel ? null : d.device_id)}
              activeOpacity={0.8}
              style={[S.surface, styles.deviceCard, isSel && styles.deviceCardSelected]}
            >
              <View style={styles.deviceHeader}>
                <View style={[styles.deviceIcon, isSel && { backgroundColor: C.primaryLight }]}>
                  <Cpu size={17} color={isSel ? C.primary : C.textSub} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{d.name}</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>{d.device_id}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.statusPill, { backgroundColor: d.is_active ? C.successBg : C.border }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: d.is_active ? C.success : C.textMuted }}>
                      {d.is_active ? 'active' : 'inactive'}
                    </Text>
                  </View>
                  {s.is_running && (
                    <View style={[styles.statusPill, { backgroundColor: '#FFF7ED' }]}>
                      <Zap size={8} color="#EA580C" />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#EA580C', marginLeft: 2 }}>
                        {s.wattage_w?.toLocaleString()}W
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {d.last_seen && (
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  Last seen {new Date(d.last_seen).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}

              <Divider style={{ marginVertical: 10 }} />

              <View style={styles.deviceActions}>
                <TouchableOpacity onPress={() => getToken(d.id)} style={styles.actionBtn}>
                  <Copy size={12} color={C.primary} />
                  <Text style={[styles.actionText, { color: C.primary }]}>Token</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => rotateToken(d.id)} style={styles.actionBtn}>
                  <RefreshCw size={12} color={C.warning} />
                  <Text style={[styles.actionText, { color: C.warning }]}>Rotate</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteDevice(d.id)} style={[styles.actionBtn, { marginLeft: 'auto' }]}>
                  <Trash2 size={12} color={C.textMuted} />
                  <Text style={[styles.actionText, { color: C.textMuted }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )
        })
      )}

      {/* ── Simulator panel (only when device selected) ─────────────────────── */}
      {selected && selectedDev && (
        <Card style={[isRunning && { borderColor: '#FED7AA', borderWidth: 2 }]}>
          <View style={styles.simHeader}>
            <View style={[styles.deviceIcon, { backgroundColor: isRunning ? '#FFF7ED' : C.border }]}>
              <SlidersHorizontal size={15} color={isRunning ? '#EA580C' : C.textSub} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Device Simulator</Text>
              {isRunning && (
                <Text style={{ fontSize: 11, color: '#EA580C', marginTop: 2 }}>
                  ⚡ {sim.wattage_w?.toLocaleString()}W · every {sim.interval_seconds}s
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => simControl(isRunning ? 'stop' : 'start')}
              style={[styles.toggleBtn, { backgroundColor: isRunning ? C.danger : C.success }]}
            >
              {isRunning ? <Square size={13} color="#fff" /> : <Play size={13} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 5 }}>
                {isRunning ? 'Stop' : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Interval */}
          <Text style={[S.label, { marginTop: 16 }]}>Reading Interval</Text>
          <View style={styles.pillRow}>
            {INTERVALS.map(s => (
              <TouchableOpacity key={s} onPress={() => setCurInterval(s)}
                style={[styles.pill, curInterval === s && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: curInterval === s ? '#fff' : C.textSub }}>{s}s</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Appliance presets */}
          <Text style={[S.label, { marginTop: 14 }]}>Appliance Presets</Text>
          <View style={styles.presetGrid}>
            {LOAD_PRESETS.map(p => {
              const active = parseFloat(curWatt) === p.watt
              return (
                <TouchableOpacity key={p.label}
                  onPress={() => { setCurWatt(String(p.watt)); if (isRunning) simControl('setload', { wattage_w: p.watt }) }}
                  style={[styles.presetBtn, active && { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#EA580C' : C.text }}>{p.label}</Text>
                  <Text style={{ fontSize: 10, color: active ? '#EA580C' : C.textMuted }}>{p.watt}W</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Test presets */}
          <Text style={[S.label, { marginTop: 14 }]}>Fast-Data Test Presets</Text>
          <View style={styles.pillRow}>
            {TEST_PRESETS.map(p => {
              const active = parseFloat(curWatt) === p.watt
              return (
                <TouchableOpacity key={p.label}
                  onPress={() => { setCurWatt(String(p.watt)); if (isRunning) simControl('setload', { wattage_w: p.watt }) }}
                  style={[styles.pill, active && { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : C.textSub }}>{p.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Custom wattage */}
          <Text style={[S.label, { marginTop: 14 }]}>Custom Wattage (50–100,000 W)</Text>
          <View style={styles.wattRow}>
            <TextInput
              value={curWatt}
              onChangeText={setCurWatt}
              keyboardType="numeric"
              placeholderTextColor={C.textMuted}
              style={[S.input, { flex: 1, fontFamily: 'monospace' }]}
            />
            <TouchableOpacity
              onPress={() => simControl(isRunning ? 'setload' : 'start', { wattage_w: parseFloat(curWatt) })}
              style={[styles.applyBtn, { backgroundColor: '#F97316' }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{isRunning ? 'Apply' : 'Start'}</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {/* ── Live reading + chart ──────────────────────────────────────────────── */}
      {selected && (
        <>
          {/* WS status */}
          <View style={styles.liveHeader}>
            <Text style={styles.sectionTitle}>{selectedDev?.name}</Text>
            <View style={[styles.statusPill, { backgroundColor: wsConn ? C.successBg : C.border }]}>
              <Radio size={9} color={wsConn ? C.success : C.textMuted} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: wsConn ? C.success : C.textMuted, marginLeft: 3 }}>
                {wsConn ? 'Live' : 'Offline'}
              </Text>
            </View>
            <View style={styles.periodRow}>
              {['24h', '7d', '30d'].map(p => (
                <TouchableOpacity key={p} onPress={() => setPeriod(p)}
                  style={[styles.periodBtn, period === p && { backgroundColor: C.primary }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: period === p ? '#fff' : C.textSub }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Live readings grid */}
          {liveReading && (
            <Card>
              <Text style={[styles.sectionTitle, { color: C.primary, marginBottom: 12, fontSize: 12 }]}>⚡ LIVE READING</Text>
              <View style={styles.readingGrid}>
                {[
                  ['Power',   'W',    liveReading.power],
                  ['Voltage', 'V',    liveReading.voltage],
                  ['Current', 'A',    liveReading.current],
                  ['Energy',  'kWh',  liveReading.energy],
                  ['Freq',    'Hz',   liveReading.frequency],
                  ['PF',      '',     liveReading.power_factor],
                ].map(([label, unit, val]) => (
                  <View key={label} style={styles.readingCell}>
                    <Text style={{ fontSize: 10, color: C.textMuted }}>{label}</Text>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginVertical: 2 }}>
                      {typeof val === 'number' ? val.toFixed(2) : '—'}
                    </Text>
                    <Text style={{ fontSize: 10, color: C.textMuted }}>{unit}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Stats */}
          {stats && (
            <View style={styles.grid2}>
              {[
                ['Energy',     `${stats.total_energy_kwh} kWh`, C.primary],
                ['Avg Power',  `${stats.avg_power_w} W`,        C.success],
                ['Peak Power', `${stats.max_power_w} W`,        C.warning],
                ['Est. Cost',  `Rs ${Number(stats.estimated_cost_pkr).toLocaleString()}`, C.text],
              ].map(([label, value, color]) => (
                <Card key={label} style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted }}>{label}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color, marginTop: 4 }}>{value}</Text>
                  <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{stats.period}</Text>
                </Card>
              ))}
            </View>
          )}

          {/* Chart */}
          {chartData && (
            <Card>
              <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Power (W)</Text>
              <LineChart
                data={chartData}
                width={W - 64}
                height={160}
                chartConfig={{
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: () => C.primary,
                  labelColor: () => C.textMuted,
                  propsForDots: { r: '0' },
                  propsForBackgroundLines: { stroke: C.border },
                }}
                bezier
                style={{ borderRadius: 12 }}
                withOuterLines={false}
              />
            </Card>
          )}

          {readings.length === 0 && (
            <Card>
              <EmptyState Icon={Cpu} title="No readings yet" subtitle="Start the simulator or connect your ESP32" />
            </Card>
          )}
        </>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  content:  { padding: 16, gap: 12 },
  headerRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  addBtn:   { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  deviceCard: { padding: 16, marginBottom: 0 },
  deviceCardSelected: { borderColor: C.primary, borderWidth: 2 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deviceIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  deviceActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 16 },
  actionText: { fontSize: 12, fontWeight: '600' },
  simHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pill:    { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.borderMd, alignItems: 'center', backgroundColor: '#fff' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  presetBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.borderMd, alignItems: 'center', backgroundColor: '#fff' },
  wattRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  applyBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, justifyContent: 'center' },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  periodRow: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.borderMd, backgroundColor: '#fff' },
  readingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  readingCell: { width: (W - 80) / 3, backgroundColor: C.bg, borderRadius: 12, padding: 12, alignItems: 'center' },
  grid2: { flexDirection: 'row', gap: 12 },
})
