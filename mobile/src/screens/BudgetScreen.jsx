import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert } from 'react-native'
import { Wallet, AlertTriangle, CheckCircle2, Zap, TrendingUp } from 'lucide-react-native'
import api from '../api/client'
import { C, S } from '../theme'
import { PageLoader, Card, PrimaryBtn, SecondaryBtn, StatusMsg, Divider, Field } from '../components'

export default function BudgetScreen() {
  const [status,    setStatus]    = useState(null)
  const [budget,    setBudget]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [editing,   setEditing]   = useState(false)
  const [form,      setForm]      = useState({ max_pkr: '', label: '' })
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')
  const [msgOk,     setMsgOk]     = useState(false)

  const load = useCallback(async () => {
    try {
      // GET /budget/ returns a single enriched object (status + budget in one),
      // or 404 if no budget is set — we catch 404 and treat it as "no budget"
      const bg = await api.get('/budget/').catch(e => {
        if (e.response?.status === 404) return { data: null }
        throw e
      })
      const data = bg.data && bg.data.max_pkr ? bg.data : null
      setBudget(data)
      setStatus(data)   // status fields (budget_used_pct, etc.) are embedded in same object
      if (data) setForm({ max_pkr: String(data.max_pkr), label: data.label ?? '' })
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [])

  const saveBudget = async () => {
    const val = parseFloat(form.max_pkr)
    if (!val || val <= 0) { setMsg('Enter a valid budget amount'); setMsgOk(false); return }
    setSaving(true); setMsg('')
    try {
      // POST /budget/ is an upsert — works for both create and update
      await api.post('/budget/', { max_pkr: val, label: form.label || 'Monthly Budget' })
      setMsg('Budget saved!'); setMsgOk(true)
      setEditing(false)
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Save failed'); setMsgOk(false)
    } finally { setSaving(false) }
  }

  const deleteBudget = () => {
    if (!budget) return
    Alert.alert('Delete Budget', 'Remove your budget limit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete('/budget/')
          setBudget(null); setStatus(null)
        } catch { Alert.alert('Error', 'Could not delete budget') }
      }},
    ])
  }

  if (loading) return <PageLoader />

  const pct      = status?.budget_used_pct ?? null
  const consumed = status?.current_bill_pkr ?? 0
  const maxPkr   = status?.max_pkr ?? budget?.max_pkr ?? 0
  const source   = status?.consumption_source ?? 'prediction'

  const pctColor = pct === null ? C.textMuted
    : pct >= 100 ? C.danger
    : pct >= 75  ? C.warning
    : C.success

  const statusInfo = pct === null ? null
    : pct >= 100 ? { label: 'Budget Exceeded',   Icon: AlertTriangle, color: C.dangerText,  bg: C.dangerBg  }
    : pct >= 75  ? { label: 'Approaching Limit', Icon: AlertTriangle, color: C.warningText, bg: C.warningBg }
    :              { label: 'On Track',           Icon: CheckCircle2,  color: C.successText, bg: C.successBg }

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
    >
      {/* Header */}
      <View style={{ paddingVertical: 4 }}>
        <Text style={styles.h1}>Budget</Text>
        <Text style={styles.h1Sub}>Track spending against your monthly limit</Text>
      </View>

      {/* Hero spend card */}
      {budget ? (
        <Card style={{ gap: 6 }}>
          <Text style={styles.heroLabel}>CONSUMED THIS MONTH</Text>

          <View style={styles.heroRow}>
            <Text style={styles.heroRs}>Rs</Text>
            <Text style={styles.heroVal}>{Math.floor(consumed).toLocaleString()}</Text>
            <Text style={styles.heroDec}>.{String(Math.round((consumed % 1) * 100)).padStart(2, '0')}</Text>
          </View>

          <Text style={{ fontSize: 13, color: C.textSub }}>
            of Rs {Number(maxPkr).toLocaleString()} budget
            {source === 'iot' ? ' · via IoT meter' : source === 'prediction' ? ' · via AI prediction' : ''}
          </Text>

          {/* IoT kWh chips */}
          {status?.iot_units_kwh != null && (
            <View style={styles.chipRow}>
              <View style={[styles.chip, { backgroundColor: C.primaryLight }]}>
                <Zap size={11} color={C.primary} />
                <Text style={[styles.chipText, { color: C.primary }]}>{Number(status.iot_units_kwh).toFixed(1)} kWh consumed</Text>
              </View>
              {status.tariff_rate_pkr != null && (
                <View style={[styles.chip, { backgroundColor: status.is_protected ? C.successBg : C.border }]}>
                  <Text style={[styles.chipText, { color: status.is_protected ? C.success : C.textSub }]}>
                    Rs {Number(status.tariff_rate_pkr).toFixed(2)}/kWh
                    {status.is_protected ? ' · Lifeline' : ' · Unprotected'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Progress bar */}
          {pct !== null && (
            <View style={{ marginTop: 8 }}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: pctColor }]} />
              </View>
              <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 4, textAlign: 'right' }}>{pct}% of budget used</Text>
            </View>
          )}

          {/* Status badge */}
          {statusInfo && (
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <statusInfo.Icon size={13} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          )}

          {/* Projection */}
          {status?.projection_exceeds_budget && status?.projected_bill_pkr != null && (
            <View style={[styles.alertBox, { backgroundColor: C.warningBg, borderColor: '#FCD34D' }]}>
              <TrendingUp size={14} color={C.warning} />
              <Text style={{ fontSize: 12, color: C.warningText, flex: 1, marginLeft: 8, lineHeight: 18 }}>
                Projected <Text style={{ fontWeight: '700' }}>Rs {Number(status.projected_bill_pkr).toLocaleString()}</Text>
                {' '}— Rs {Number(status.projected_over_by_pkr ?? 0).toLocaleString()} over budget
              </Text>
            </View>
          )}

          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.editRow}>
            <TouchableOpacity onPress={() => setEditing(p => !p)} style={styles.editBtn}>
              <Text style={{ color: C.primary, fontWeight: '600', fontSize: 13 }}>{editing ? 'Cancel Edit' : 'Edit Budget'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={deleteBudget} style={styles.deleteBtn}>
              <Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : (
        <Card style={styles.emptyHero}>
          <Wallet size={36} color={C.textMuted} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12 }}>No budget set</Text>
          <Text style={{ fontSize: 13, color: C.textSub, textAlign: 'center', marginTop: 6 }}>
            Set a monthly PKR limit to get alerts when you approach it
          </Text>
        </Card>
      )}

      {msg ? <StatusMsg ok={msgOk} msg={msg} /> : null}

      {/* Edit / Create form */}
      {(editing || !budget) && (
        <Card>
          <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>{budget ? 'Edit Budget' : 'Set Monthly Budget'}</Text>
          <Field
            label="Monthly limit (Rs)"
            value={form.max_pkr}
            onChangeText={v => setForm(p => ({ ...p, max_pkr: v }))}
            placeholder="e.g. 5000"
            keyboardType="numeric"
          />
          <Field
            label="Label (optional)"
            value={form.label}
            onChangeText={v => setForm(p => ({ ...p, label: v }))}
            placeholder="Monthly Budget"
          />
          <PrimaryBtn label={saving ? 'Saving…' : 'Save Budget'} onPress={saveBudget} loading={saving} />
        </Card>
      )}

      {/* Quick reference */}
      <Card style={[{ borderLeftWidth: 4, borderLeftColor: C.primary }, { flexDirection: 'row', gap: 12 }]}>
        <Zap size={16} color={C.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>LESCO slab tariff</Text>
          <Text style={{ fontSize: 11, color: C.textSub, marginTop: 4, lineHeight: 17 }}>
            Rs 3.95/unit (≤50 lifeline) · Rs 7.74 (51–100) · Rs 22.44 (unprotected 1–100) · Rs 33.10 (201–300) · Rs 47.20 (above 700).
            Rate recalculates automatically as your IoT meter records more kWh.
          </Text>
        </View>
      </Card>

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  content:  { padding: 16, gap: 12 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  heroLabel:{ fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  heroRow:  { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 4 },
  heroRs:   { fontSize: 16, fontWeight: '600', color: C.textMuted, marginBottom: 4 },
  heroVal:  { fontSize: 44, fontWeight: '800', color: C.text, lineHeight: 48 },
  heroDec:  { fontSize: 20, fontWeight: '600', color: C.textMuted, marginBottom: 4 },
  chipRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '600' },
  barTrack: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12, alignSelf: 'flex-start' },
  statusText:  { fontSize: 13, fontWeight: '600' },
  alertBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 12, borderWidth: 1 },
  editRow:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  editBtn:  { paddingVertical: 4 },
  deleteBtn:{ paddingVertical: 4, marginLeft: 'auto' },
  emptyHero:{ alignItems: 'center', paddingVertical: 36 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
})
