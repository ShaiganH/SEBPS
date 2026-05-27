import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native'
import { BarChart } from 'react-native-chart-kit'
import { TrendingUp, Zap, Calendar, Clock } from 'lucide-react-native'
import api from '../api/client'
import { C } from '../theme'
import { PageLoader, Card, EmptyState, PrimaryBtn, StatusMsg, Divider } from '../components'

const W = Dimensions.get('window').width

export default function PredictionsScreen() {
  const [preds,     setPreds]     = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [generating,setGenerating]= useState(false)
  const [msg,       setMsg]       = useState('')
  const [msgOk,     setMsgOk]     = useState(false)

  const load = useCallback(async () => {
    try {
      const [pr, db] = await Promise.all([
        api.get('/predictions/'),
        api.get('/predictions/iot-status/').catch(() => ({ data: null })),
      ])
      setPreds(pr.data?.results ?? pr.data ?? [])
      setDashboard(db.data)
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [])

  const generate = async () => {
    setGenerating(true); setMsg('')
    try {
      await api.post('/predictions/generate/', {})
      setMsg('Prediction generated successfully!'); setMsgOk(true)
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Generation failed — need at least 2 months of bill history')
      setMsgOk(false)
    } finally { setGenerating(false) }
  }

  if (loading) return <PageLoader />

  // iot-status response is flat (no wrapper) — dashboard IS the IoT data
  const iot     = dashboard
  const latest  = preds[0]

  const heroValue = latest ? Number(latest.predicted_bill) : null
  const heroWhole = heroValue !== null ? Math.floor(heroValue).toLocaleString() : null
  const heroDec   = heroValue !== null ? String(Math.round((heroValue % 1) * 100)).padStart(2, '0') : null

  // Chart: last 8 predictions
  const chartPreds = [...preds].reverse().slice(-8)
  const chartData = chartPreds.length >= 2 ? {
    labels: chartPreds.map(p => p.month_label?.slice(0, 3) ?? ''),
    datasets: [{ data: chartPreds.map(p => Math.round(parseFloat(p.predicted_bill))) }],
  } : null

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
    >
      {/* Header */}
      <View style={{ paddingVertical: 4 }}>
        <Text style={styles.h1}>Predictions</Text>
        <Text style={styles.h1Sub}>AI-powered forecasts based on your billing history</Text>
      </View>

      {/* Hero */}
      <Card style={{ gap: 4 }}>
        <Text style={styles.heroLabel}>PREDICTED THIS MONTH</Text>
        {heroWhole !== null ? (
          <View style={styles.heroRow}>
            <Text style={styles.heroRs}>Rs</Text>
            <Text style={styles.heroVal}>{heroWhole}</Text>
            <Text style={styles.heroDec}>.{heroDec}</Text>
          </View>
        ) : (
          <Text style={[styles.heroVal, { color: C.border }]}>—</Text>
        )}
        {latest && (
          <Text style={{ fontSize: 13, color: C.textSub }}>{latest.predicted_units} units projected</Text>
        )}

        {iot?.has_iot && (
          <>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.iotRow}>
              <Zap size={14} color={C.primary} />
              <Text style={{ fontSize: 13, color: C.textSub, flex: 1, marginLeft: 8 }}>
                IoT Live · <Text style={{ fontWeight: '700', color: C.text }}>{iot.measured_kwh?.toFixed(2)} kWh</Text> consumed
                {' · '}Day {iot.days_elapsed}/{iot.total_cycle_days}
              </Text>
            </View>
            {iot.iot_daily_rate_kwh > 0 && (
              <View style={styles.iotRow}>
                <TrendingUp size={14} color={C.success} />
                <Text style={{ fontSize: 13, color: C.textSub, flex: 1, marginLeft: 8 }}>
                  Daily rate: <Text style={{ fontWeight: '700', color: C.text }}>{iot.iot_daily_rate_kwh?.toFixed(1)} kWh/day</Text>
                </Text>
              </View>
            )}
          </>
        )}
      </Card>

      {msg ? <StatusMsg ok={msgOk} msg={msg} /> : null}

      <PrimaryBtn
        label={generating ? 'Generating…' : 'Predict Now (IoT)'}
        onPress={generate}
        loading={generating}
      />

      {/* Chart */}
      {chartData && (
        <Card>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Prediction History</Text>
          <BarChart
            data={chartData}
            width={W - 64}
            height={180}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
              labelColor: () => C.textMuted,
              propsForBackgroundLines: { stroke: C.border },
            }}
            style={{ borderRadius: 12 }}
            showValuesOnTopOfBars
            withInnerLines
            fromZero
          />
        </Card>
      )}

      {/* Prediction list */}
      {preds.length > 0 ? (
        <Card style={{ padding: 0 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Prediction Runs ({preds.length})</Text>
          </View>
          {preds.slice(0, 10).map((p, i) => (
            <View key={p.id ?? i}>
              {i > 0 && <Divider style={{ marginHorizontal: 16 }} />}
              <View style={styles.predRow}>
                <View style={styles.predIcon}>
                  <TrendingUp size={15} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>
                    {p.month_label ?? `#${p.id}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textSub }}>
                    {p.predicted_units} units · {p.prediction_method ?? 'ML model'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.primary }}>
                    Rs {Number(p.predicted_bill).toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.textMuted }}>
                    {new Date(p.created_at).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState
            Icon={TrendingUp}
            title="No predictions yet"
            subtitle="Add at least 2 months of bill history, then tap 'Predict Now'"
          />
        </Card>
      )}

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
  heroVal:  { fontSize: 48, fontWeight: '800', color: C.text, lineHeight: 52 },
  heroDec:  { fontSize: 22, fontWeight: '600', color: C.textMuted, marginBottom: 4 },
  iotRow:   { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  predRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  predIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
})
