import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native'
import { LineChart } from 'react-native-chart-kit'
import { TrendingUp, TrendingDown, Wallet, Cpu, Zap, Bell, FileText, ScanLine, Lightbulb, AlertTriangle, ChevronRight } from 'lucide-react-native'
import api from '../api/client'
import { C } from '../theme'
import { PageLoader, Card, StatTile, EmptyState, Chip, Divider } from '../components'

const W = Dimensions.get('window').width

export default function DashboardScreen({ navigation }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)

  const load = useCallback(async () => {
    try { const r = await api.get('/auth/dashboard/'); setData(r.data) }
    catch (e) { console.log('Dashboard error', e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [])

  if (loading) return <PageLoader />

  const pred     = data?.prediction
  const budget   = data?.budget
  const bills    = data?.recent_bills ?? []
  const iot      = data?.iot
  const iotCycle = data?.iot_cycle
  const unread   = data?.unread_notifications ?? 0

  const pct     = budget?.budget_used_pct ?? null
  const pctColor = pct === null ? C.textMuted : pct >= 100 ? C.danger : pct >= 75 ? C.warning : C.success

  const heroValue = pred ? Number(pred.predicted_bill)
    : iotCycle ? Number(iotCycle.current_bill_pkr)
    : bills[0]  ? parseFloat(bills[0].bill_amount)
    : null

  const heroLabel = pred ? 'PREDICTED THIS MONTH'
    : iotCycle ? 'CURRENT CYCLE COST'
    : bills[0]  ? 'LAST RECORDED BILL'
    : 'NO DATA YET'

  const heroSub = pred
    ? `${pred.predicted_units} units projected`
    : iotCycle
    ? `${iotCycle.measured_kwh?.toFixed(1)} kWh · day ${iotCycle.days_elapsed}/${iotCycle.total_cycle_days}`
    : bills[0] ? `${bills[0].units} units` : 'Add your first bill to get started'

  // Budget status
  const budgetStatus = pct === null ? null
    : pct >= 100 ? { label: `Budget Exceeded · ${pct}%`, color: C.dangerText,  bg: C.dangerBg  }
    : pct >= 75  ? { label: `Approaching Limit · ${pct}%`, color: C.warningText, bg: C.warningBg }
    :              { label: `On Track · ${pct}%`, color: C.successText, bg: C.successBg }

  // Chart data
  const chartBills = [...bills].reverse()
  const chartData = chartBills.length >= 2 ? {
    labels: chartBills.map(b => b.month_label?.slice(0, 3) ?? ''),
    datasets: [{ data: chartBills.map(b => parseFloat(b.bill_amount) || 0), color: () => C.primary, strokeWidth: 2 }],
  } : null

  // MoM delta
  const delta = bills[0] && bills[1]
    ? ((parseFloat(bills[0].bill_amount) - parseFloat(bills[1].bill_amount)) / parseFloat(bills[1].bill_amount) * 100).toFixed(1)
    : null

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Dashboard</Text>
          <Text style={styles.h1Sub}>Your electricity overview</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('NotificationsTab')} style={styles.bellBtn}>
          <Bell size={20} color={unread > 0 ? C.danger : C.textSub} />
          {unread > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {/* Hero card */}
      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>{heroLabel}</Text>
        {heroValue !== null ? (
          <View style={styles.heroValueRow}>
            <Text style={styles.heroRs}>Rs</Text>
            <Text style={styles.heroValue}>{Math.floor(heroValue).toLocaleString()}</Text>
            <Text style={styles.heroDecimal}>.{String(Math.round((heroValue % 1) * 100)).padStart(2, '0')}</Text>
          </View>
        ) : (
          <Text style={[styles.heroValue, { color: C.border }]}>—</Text>
        )}
        <Text style={styles.heroSub}>{heroSub}</Text>

        {budgetStatus && (
          <View style={[styles.statusChip, { backgroundColor: budgetStatus.bg }]}>
            <View style={[styles.dot, { backgroundColor: pctColor }]} />
            <Text style={[styles.statusText, { color: budgetStatus.color }]}>{budgetStatus.label}</Text>
          </View>
        )}

        {delta !== null && (
          <View style={styles.deltaRow}>
            {parseFloat(delta) > 0
              ? <TrendingUp size={12} color={C.danger} />
              : <TrendingDown size={12} color={C.success} />
            }
            <Text style={{ fontSize: 12, fontWeight: '600', color: parseFloat(delta) > 0 ? C.danger : C.success, marginLeft: 4 }}>
              {parseFloat(delta) > 0 ? '+' : ''}{delta}% vs prev month
            </Text>
          </View>
        )}

        {budget && pct !== null && (
          <>
            <Divider style={{ marginVertical: 14 }} />
            <View style={styles.budgetBarRow}>
              <Text style={styles.budgetBarLabel}>Rs {Number(budget.current_bill_pkr ?? 0).toLocaleString()} spent</Text>
              <View style={styles.budgetBarTrack}>
                <View style={[styles.budgetBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: pctColor }]} />
              </View>
              <Text style={styles.budgetBarLabel}>Rs {Number(budget.max_pkr).toLocaleString()}</Text>
            </View>
          </>
        )}
      </Card>

      {/* Chart */}
      {chartData && (
        <Card style={{ padding: 16 }}>
          <Text style={styles.sectionTitle}>Bill History</Text>
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
              propsForDots: { r: '3', strokeWidth: '2', stroke: C.primary },
              propsForBackgroundLines: { strokeDasharray: '', stroke: C.border },
            }}
            bezier
            style={{ borderRadius: 12, marginTop: 8 }}
            withInnerLines
            withOuterLines={false}
          />
        </Card>
      )}

      {/* KPI grid */}
      <View style={styles.grid2}>
        <StatTile
          label="Monthly Budget"
          value={budget ? `Rs ${Number(budget.max_pkr).toLocaleString()}` : '—'}
          sub={pct !== null ? `${pct}% consumed` : 'Not configured'}
          Icon={Wallet} iconBg={C.primaryLight} iconColor={C.primary}
          style={{ flex: 1 }}
        />
        <StatTile
          label="IoT Devices"
          value={iot ? `${iot.active_devices}` : '—'}
          sub={iot?.latest_reading ? `${iot.latest_reading.power?.toFixed(0)} W live` : 'No device'}
          Icon={Cpu} iconBg={C.successBg} iconColor={C.success}
          style={{ flex: 1 }}
        />
      </View>
      <View style={styles.grid2}>
        <StatTile
          label="This Cycle"
          value={iotCycle ? `${iotCycle.measured_kwh?.toFixed(1)} kWh` : '—'}
          sub={iotCycle ? `Day ${iotCycle.days_elapsed}/${iotCycle.total_cycle_days}` : 'No cycle data'}
          Icon={Zap} iconBg={C.warningBg} iconColor={C.warning}
          style={{ flex: 1 }}
        />
        <StatTile
          label="Notifications"
          value={`${unread}`}
          sub={unread > 0 ? 'unread alerts' : 'All caught up'}
          Icon={Bell} iconBg={unread > 0 ? C.dangerBg : C.border} iconColor={unread > 0 ? C.danger : C.textMuted}
          style={{ flex: 1 }}
        />
      </View>

      {/* Recent bills */}
      {bills.length > 0 ? (
        <Card style={{ padding: 0 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Recent Bills</Text>
            <TouchableOpacity onPress={() => navigation.navigate('BillsTab')}>
              <Text style={{ fontSize: 12, color: C.primary, fontWeight: '600' }}>See all</Text>
            </TouchableOpacity>
          </View>
          {bills.slice(0, 5).map((b, i) => {
            const amt  = parseFloat(b.bill_amount)
            const prev = bills[i + 1] ? parseFloat(bills[i + 1].bill_amount) : null
            const d    = prev ? ((amt - prev) / prev * 100).toFixed(0) : null
            const up   = d !== null && parseFloat(d) > 0
            return (
              <View key={b.id ?? i}>
                {i > 0 && <Divider style={{ marginHorizontal: 16 }} />}
                <View style={styles.billRow}>
                  <View style={styles.billIcon}><FileText size={14} color={C.textSub} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: C.text }}>{b.month_label}</Text>
                    <Text style={{ fontSize: 12, color: C.textSub }}>{b.units} units · {b.source ?? 'manual'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Rs {Number(amt).toLocaleString()}</Text>
                    {d !== null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        {up ? <TrendingUp size={10} color={C.danger} /> : <TrendingDown size={10} color={C.success} />}
                        <Text style={{ fontSize: 11, fontWeight: '600', color: up ? C.danger : C.success }}>
                          {up ? '+' : ''}{d}%
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )
          })}
        </Card>
      ) : (
        <Card>
          <EmptyState Icon={FileText} title="No bills yet" subtitle="Scan a bill or fetch from LESCO" />
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Quick Actions</Text>
        {[
          { label: 'Scan Bill Image',  icon: ScanLine,   color: C.primary,  screen: 'OcrScreen'            },
          { label: 'Run Prediction',   icon: TrendingUp,  color: C.success,  screen: 'PredictionsScreen'   },
          { label: 'AI Advisor',       icon: Lightbulb,   color: '#7C3AED',  screen: 'RecommendationsScreen'},
          { label: 'Budget Settings',  icon: Wallet,      color: C.warning,  screen: 'BudgetScreen'         },
        ].map(({ label, icon: Icon, color, screen }) => (
          <TouchableOpacity key={label} onPress={() => navigation.navigate(screen)} style={styles.quickAction} activeOpacity={0.7}>
            <Icon size={15} color={color} />
            <Text style={styles.quickActionText}>{label}</Text>
            <ChevronRight size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        ))}
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  content:  { padding: 16, gap: 12 },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  bellBtn:  { padding: 8, position: 'relative' },
  badge:    { position: 'absolute', top: 4, right: 4, backgroundColor: C.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText:{ fontSize: 9, color: '#fff', fontWeight: '800' },
  heroCard: { gap: 4 },
  heroLabel:{ fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 4 },
  heroRs:   { fontSize: 16, fontWeight: '600', color: C.textMuted, marginBottom: 4 },
  heroValue:{ fontSize: 48, fontWeight: '800', color: C.text, lineHeight: 52 },
  heroDecimal:{ fontSize: 22, fontWeight: '600', color: C.textMuted, marginBottom: 4 },
  heroSub:  { fontSize: 13, color: C.textSub, marginTop: 4 },
  statusChip:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8 },
  dot:      { width: 6, height: 6, borderRadius: 3 },
  statusText:{ fontSize: 12, fontWeight: '600' },
  deltaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  budgetBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  budgetBarLabel: { fontSize: 11, color: C.textSub, flexShrink: 0 },
  budgetBarTrack: { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  budgetBarFill:  { height: '100%', borderRadius: 3 },
  grid2: { flexDirection: 'row', gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  billRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  billIcon: { width: 34, height: 34, backgroundColor: C.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  quickActionText: { fontSize: 14, color: C.text, fontWeight: '500' },
})
