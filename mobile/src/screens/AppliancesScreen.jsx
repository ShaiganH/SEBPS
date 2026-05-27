import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Zap, Plus, Trash2, X, ChevronDown, ChevronUp, Settings2, CheckCircle2, AlertTriangle, Wallet } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import api from '../api/client'
import { C, S } from '../theme'
import { PageLoader, Card, EmptyState, PrimaryBtn, SecondaryBtn, StatusMsg, Divider, Field } from '../components'

const CATEGORY_COLORS = {
  cooling:    { bg: '#EFF6FF', color: '#2563EB' },
  heating:    { bg: '#FEF3C7', color: '#D97706' },
  lighting:   { bg: '#FFFBEB', color: '#F59E0B' },
  kitchen:    { bg: '#F0FDF4', color: '#16A34A' },
  laundry:    { bg: '#EDE9FE', color: '#7C3AED' },
  electronics:{ bg: '#F0F9FF', color: '#0284C7' },
  other:      { bg: '#F8FAFC', color: '#64748B' },
}

const COMMON_APPLIANCES = [
  { name: 'Air Conditioner',  category: 'cooling',     watts: 1500, hours: 8 },
  { name: 'Refrigerator',     category: 'kitchen',     watts: 150,  hours: 24 },
  { name: 'Ceiling Fan',      category: 'cooling',     watts: 75,   hours: 12 },
  { name: 'LED Bulb',         category: 'lighting',    watts: 10,   hours: 6  },
  { name: 'Washing Machine',  category: 'laundry',     watts: 500,  hours: 1  },
  { name: 'TV',               category: 'electronics', watts: 100,  hours: 4  },
  { name: 'Water Pump',       category: 'other',       watts: 750,  hours: 2  },
  { name: 'Iron',             category: 'other',       watts: 1000, hours: 1  },
]

export default function AppliancesScreen() {
  const navigation = useNavigation()

  const [appliances,   setAppliances]   = useState([])
  const [budget,       setBudget]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [form,         setForm]         = useState({ name: '', category: 'other', wattage_w: '', hours_per_day: '', quantity: '1' })
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState('')
  const [msgOk,        setMsgOk]        = useState(false)

  // Optimization state
  const [optimizeMode, setOptimizeMode] = useState(false)
  const [optResult,    setOptResult]    = useState(null)   // { optimization_steps, optimized_appliances, summary, message }
  const [optLoading,   setOptLoading]   = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)
  const [optMsg,       setOptMsg]       = useState('')
  const [optMsgOk,     setOptMsgOk]     = useState(false)
  // Per-appliance manual hour adjustments (id → hours)
  const [hourEdits,    setHourEdits]    = useState({})

  const load = useCallback(async () => {
    try {
      const [appR, budgetR] = await Promise.all([
        api.get('/appliances/'),
        api.get('/budget/').catch(e => e.response?.status === 404 ? { data: null } : null),
      ])
      setAppliances(appR.data?.results ?? appR.data ?? [])
      const bd = budgetR?.data
      setBudget(bd && bd.max_pkr ? bd : null)
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  // Auto-exit optimize mode the moment budget is exceeded
  useEffect(() => {
    if (budget?.budget_used_pct >= 100 && optimizeMode) {
      setOptimizeMode(false)
      setOptResult(null)
      setHourEdits({})
      setOptMsg('')
    }
  }, [budget, optimizeMode])

  useEffect(() => { load() }, [])

  // ── totals using server-computed monthly_units ─────────────────────────────
  const totalMonthlyKwh  = appliances.reduce((s, a) => s + (parseFloat(a.monthly_units) || 0), 0)
  const totalMonthlyCost = totalMonthlyKwh * 33.10   // rough Unprotected-1 rate

  // ── Add appliance ──────────────────────────────────────────────────────────
  const addAppliance = async () => {
    if (!form.name || !form.wattage_w) { setMsg('Name and wattage are required'); setMsgOk(false); return }
    setSaving(true); setMsg('')
    try {
      await api.post('/appliances/', {
        name:         form.name,
        category:     form.category,
        wattage_w:    parseFloat(form.wattage_w)    || 0,
        hours_per_day:parseFloat(form.hours_per_day) || 0,
        quantity:     parseInt(form.quantity)        || 1,
      })
      setMsg('Appliance added!'); setMsgOk(true)
      setShowAdd(false)
      setForm({ name: '', category: 'other', wattage_w: '', hours_per_day: '', quantity: '1' })
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Add failed'); setMsgOk(false)
    } finally { setSaving(false) }
  }

  const quickAdd = async (preset) => {
    try {
      await api.post('/appliances/', {
        name:          preset.name,
        category:      preset.category,
        wattage_w:     preset.watts,
        hours_per_day: preset.hours,
        quantity:      1,
      })
      setMsg(`${preset.name} added!`); setMsgOk(true)
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Add failed'); setMsgOk(false)
    }
  }

  const deleteAppliance = (id, name) => {
    Alert.alert('Remove Appliance', `Remove ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.delete(`/appliances/${id}/`); setAppliances(p => p.filter(a => a.id !== id)) }
        catch { Alert.alert('Error', 'Could not remove appliance') }
      }},
    ])
  }

  // ── Optimization ──────────────────────────────────────────────────────────
  const runAutoOptimize = async () => {
    setOptLoading(true); setOptMsg('')
    try {
      const payload = {
        appliances: appliances.map(a => ({
          id:            a.id,
          name:          a.name,
          wattage_w:     parseFloat(a.wattage_w),
          hours_per_day: parseFloat(hourEdits[a.id] ?? a.hours_per_day),
          quantity:      a.quantity ?? 1,
          category:      a.category,
        })),
      }
      const { data } = await api.post('/appliances/optimize/', payload)
      setOptResult(data)
      setOptMsg('Optimization plan ready! Review the steps below and apply.')
      setOptMsgOk(true)
    } catch (e) {
      const msg = e.response?.data?.detail || 'Optimization failed — make sure you have a budget set.'
      setOptMsg(msg); setOptMsgOk(false)
    } finally { setOptLoading(false) }
  }

  const applyOptimization = async () => {
    if (!optResult?.optimized_appliances?.length) return
    setApplyLoading(true); setOptMsg('')
    try {
      const adjustments = optResult.optimized_appliances
        .filter(a => a.id != null)
        .map(a => ({ id: a.id, hours_per_day: a.optimized_hours_per_day ?? a.hours_per_day }))
      await api.post('/appliances/optimize/apply/', { adjustments })
      setOptMsg('Changes saved! Your appliance hours have been updated.'); setOptMsgOk(true)
      setOptResult(null); setOptimizeMode(false); setHourEdits({})
      load()
    } catch (e) {
      setOptMsg(e.response?.data?.detail || 'Apply failed'); setOptMsgOk(false)
    } finally { setApplyLoading(false) }
  }

  const adjustHours = (id, delta) => {
    setHourEdits(prev => {
      const cur = parseFloat(prev[id] ?? appliances.find(a => a.id === id)?.hours_per_day ?? 0)
      const next = Math.max(0, Math.min(24, parseFloat((cur + delta).toFixed(1))))
      return { ...prev, [id]: next }
    })
  }

  if (loading) return <PageLoader />

  const budgetExceeded = !!(budget && budget.budget_used_pct >= 100)

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Appliances</Text>
          <Text style={styles.h1Sub}>Track what's consuming your electricity</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {appliances.length > 0 && !budgetExceeded && (
            <TouchableOpacity
              onPress={() => { setOptimizeMode(p => !p); setOptResult(null); setOptMsg('') }}
              style={[styles.iconBtn, { backgroundColor: optimizeMode ? C.primary : C.border }]}
            >
              <Settings2 size={15} color={optimizeMode ? '#fff' : C.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowAdd(p => !p)}
            style={[styles.iconBtn, { backgroundColor: showAdd ? C.border : C.primary }]}
          >
            {showAdd ? <X size={15} color={C.text} /> : <Plus size={15} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {msg ? <StatusMsg ok={msgOk} msg={msg} /> : null}

      {/* Budget exceeded banner — optimization unavailable */}
      {budgetExceeded && (
        <View style={styles.exceededBanner}>
          <AlertTriangle size={16} color='#DC2626' style={{ flexShrink: 0, marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.exceededTitle}>Budget Exceeded — Optimization Unavailable</Text>
            <Text style={styles.exceededSub}>
              Your bill of{' '}
              <Text style={{ fontWeight: '700', color: '#374151' }}>
                Rs {Number(budget.current_bill_pkr ?? budget.projected_bill_pkr ?? 0).toLocaleString()}
              </Text>
              {' '}already exceeds your budget of{' '}
              <Text style={{ fontWeight: '700', color: '#374151' }}>
                Rs {Number(budget.max_pkr).toLocaleString()}
              </Text>
              . Reduce IoT device power or raise your budget limit to re-enable optimization.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('BudgetScreen')}
            style={styles.exceededBtn}
            activeOpacity={0.7}
          >
            <Wallet size={11} color='#DC2626' />
            <Text style={styles.exceededBtnText}>Update Budget</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary tiles */}
      {appliances.length > 0 && (
        <View style={styles.summaryRow}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.summaryVal}>{totalMonthlyKwh.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>kWh/month</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.summaryVal, { color: C.primary }]}>
              Rs {Math.round(totalMonthlyCost).toLocaleString()}
            </Text>
            <Text style={styles.summaryLabel}>est. cost/month</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.summaryVal}>{appliances.length}</Text>
            <Text style={styles.summaryLabel}>appliances</Text>
          </Card>
        </View>
      )}

      {/* Add form */}
      {showAdd && (
        <Card>
          <Text style={styles.sectionTitle}>Add Appliance</Text>
          <View style={{ marginTop: 12 }}>
            <Field label="Name" value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} placeholder="e.g. Living Room AC" />
            <Field label="Power (Watts)" value={form.wattage_w} onChangeText={v => setForm(p => ({ ...p, wattage_w: v }))} placeholder="e.g. 1500" keyboardType="numeric" />
            <Field label="Daily usage (hours)" value={form.hours_per_day} onChangeText={v => setForm(p => ({ ...p, hours_per_day: v }))} placeholder="e.g. 8" keyboardType="numeric" />
            <Field label="Quantity" value={form.quantity} onChangeText={v => setForm(p => ({ ...p, quantity: v }))} placeholder="1" keyboardType="numeric" />
            {/* Category picker */}
            <Text style={S.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {Object.keys(CATEGORY_COLORS).map(cat => {
                  const active = form.category === cat
                  const cc = CATEGORY_COLORS[cat]
                  return (
                    <TouchableOpacity key={cat} onPress={() => setForm(p => ({ ...p, category: cat }))}
                      style={[styles.catPill, { backgroundColor: active ? cc.bg : '#fff', borderColor: active ? cc.color : C.borderMd }]}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? cc.color : C.textSub, textTransform: 'capitalize' }}>{cat}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
            <PrimaryBtn label={saving ? 'Adding…' : 'Add Appliance'} onPress={addAppliance} loading={saving} />
          </View>
        </Card>
      )}

      {/* Quick-add presets */}
      {!showAdd && !optimizeMode && (
        <Card>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Quick Add</Text>
          <View style={styles.presetGrid}>
            {COMMON_APPLIANCES.map(p => {
              const cc = CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS.other
              return (
                <TouchableOpacity key={p.name} onPress={() => quickAdd(p)}
                  style={[styles.presetBtn, { backgroundColor: cc.bg, borderColor: cc.color + '40' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: cc.color }}>{p.name}</Text>
                  <Text style={{ fontSize: 10, color: cc.color + 'AA', marginTop: 2 }}>{p.watts}W · {p.hours}h/day</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Card>
      )}

      {/* ── Optimize Mode Panel ──────────────────────────────────────────────── */}
      {optimizeMode && appliances.length > 0 && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: C.primary }}>
          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Optimize Usage</Text>
          <Text style={{ fontSize: 12, color: C.textSub, marginBottom: 14, lineHeight: 18 }}>
            Adjust hours per appliance manually using ±0.5h buttons, or tap{' '}
            <Text style={{ fontWeight: '700', color: C.primary }}>Auto-Optimize</Text> to
            automatically find the best cuts to stay within your budget.
          </Text>

          {/* Per-appliance hour sliders */}
          {appliances.map(a => {
            const cc = CATEGORY_COLORS[a.category] ?? CATEGORY_COLORS.other
            const currentHours = parseFloat(hourEdits[a.id] ?? a.hours_per_day)
            const edited = hourEdits[a.id] !== undefined && hourEdits[a.id] !== parseFloat(a.hours_per_day)
            return (
              <View key={a.id} style={styles.optimizeRow}>
                <View style={[styles.appIcon, { backgroundColor: cc.bg }]}>
                  <Zap size={13} color={cc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{a.name}</Text>
                  <Text style={{ fontSize: 11, color: C.textSub }}>{a.wattage_w}W</Text>
                </View>
                <View style={styles.hoursControl}>
                  <TouchableOpacity onPress={() => adjustHours(a.id, -0.5)} style={styles.hoursBtn}>
                    <Text style={styles.hoursBtnText}>−</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 44 }}>
                    <Text style={[styles.hoursVal, edited && { color: C.primary }]}>
                      {currentHours}h
                    </Text>
                    {edited && <Text style={{ fontSize: 9, color: C.textMuted }}>was {a.hours_per_day}h</Text>}
                  </View>
                  <TouchableOpacity onPress={() => adjustHours(a.id, 0.5)} style={styles.hoursBtn}>
                    <Text style={styles.hoursBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}

          <Divider style={{ marginVertical: 12 }} />
          <PrimaryBtn
            label={optLoading ? 'Optimizing…' : 'Auto-Optimize for Budget'}
            onPress={runAutoOptimize}
            loading={optLoading}
          />
        </Card>
      )}

      {/* Optimization result */}
      {optMsg ? <StatusMsg ok={optMsgOk} msg={optMsg} /> : null}

      {optResult && (
        <Card style={{ gap: 0 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Optimization Plan</Text>

          {/* Summary */}
          {optResult.summary?.final_bill_pkr != null && (
            <View style={[styles.optSummary, { backgroundColor: C.successBg }]}>
              <CheckCircle2 size={16} color={C.success} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.successText }}>
                  Optimized bill: Rs {Math.round(optResult.summary.final_bill_pkr).toLocaleString()}
                </Text>
                {optResult.summary.pkr_saved > 0 && (
                  <Text style={{ fontSize: 12, color: C.successText, marginTop: 2 }}>
                    Save Rs {Math.round(optResult.summary.pkr_saved).toLocaleString()} vs current
                  </Text>
                )}
                <Text style={{ fontSize: 11, color: C.successText, marginTop: 2 }}>
                  {optResult.message}
                </Text>
              </View>
            </View>
          )}

          {/* Steps */}
          {optResult.optimization_steps?.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={[styles.stepsLabel]}>Suggested Reductions</Text>
              {optResult.optimization_steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>
                      {step.appliance} — cut {step.hours_reduced}h/day
                    </Text>
                    <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
                      Saves {Number(step.units_saved ?? 0).toFixed(1)} kWh ·
                      Rs {Math.round(step.money_saved_step ?? step.pkr_saved ?? 0).toLocaleString()}
                      {step.slab_crossed ? ' 🎯 slab drop!' : ''}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.textMuted }}>
                      New bill: Rs {Math.round(step.new_bill).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Divider style={{ marginVertical: 14 }} />
          <PrimaryBtn
            label={applyLoading ? 'Applying…' : 'Apply Changes'}
            onPress={applyOptimization}
            loading={applyLoading}
          />
          <TouchableOpacity onPress={() => setOptResult(null)} style={{ alignItems: 'center', marginTop: 10 }}>
            <Text style={{ fontSize: 13, color: C.textMuted }}>Dismiss</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* Appliance list */}
      {appliances.length > 0 ? (
        <Card style={{ padding: 0 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Your Appliances</Text>
          </View>
          {appliances.map((a, i) => {
            const cc = CATEGORY_COLORS[a.category] ?? CATEGORY_COLORS.other
            const kwh = parseFloat(a.monthly_units) || 0
            return (
              <View key={a.id ?? i}>
                {i > 0 && <Divider style={{ marginHorizontal: 16 }} />}
                <View style={styles.appRow}>
                  <View style={[styles.appIcon, { backgroundColor: cc.bg }]}>
                    <Zap size={15} color={cc.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{a.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 11, color: C.textSub }}>{a.wattage_w}W</Text>
                      {a.hours_per_day > 0 && (
                        <Text style={{ fontSize: 11, color: C.textSub }}>· {a.hours_per_day}h/day</Text>
                      )}
                      {(a.quantity ?? 1) > 1 && (
                        <Text style={{ fontSize: 11, color: C.textSub }}>· ×{a.quantity}</Text>
                      )}
                      <Text style={{ fontSize: 11, color: cc.color, fontWeight: '600', textTransform: 'capitalize' }}>· {a.category}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{kwh.toFixed(1)} kWh</Text>
                    <Text style={{ fontSize: 10, color: C.textMuted }}>per month</Text>
                    <TouchableOpacity onPress={() => deleteAppliance(a.id, a.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Trash2 size={13} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          })}
        </Card>
      ) : (
        <Card>
          <EmptyState Icon={Zap} title="No appliances added" subtitle="Track your devices to understand what drives your electricity bill" />
        </Card>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:        { flex: 1, backgroundColor: C.bg },
  content:   { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  h1:        { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:     { fontSize: 13, color: C.textSub, marginTop: 2 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryRow:{ flexDirection: 'row', gap: 10 },
  summaryVal:{ fontSize: 18, fontWeight: '800', color: C.text },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  catPill:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  presetGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minWidth: '45%' },
  cardHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  appRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  appIcon:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Optimize mode
  optimizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  hoursControl:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  hoursBtn:  { width: 30, height: 30, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  hoursBtnText:{ fontSize: 18, fontWeight: '700', color: C.text, lineHeight: 22 },
  hoursVal:  { fontSize: 14, fontWeight: '700', color: C.text },
  // Opt result
  optSummary:{ flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderRadius: 12, marginTop: 12 },
  stepsLabel:{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
  stepRow:   { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stepNum:   { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  stepNumText:{ fontSize: 11, fontWeight: '800', color: '#fff' },
  // Budget exceeded banner
  exceededBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  exceededTitle:  { fontSize: 13, fontWeight: '700', color: '#991B1B', marginBottom: 4 },
  exceededSub:    { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  exceededBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FEE2E2', borderRadius: 10, flexShrink: 0, marginTop: 2 },
  exceededBtnText:{ fontSize: 11, fontWeight: '700', color: '#DC2626' },
})
