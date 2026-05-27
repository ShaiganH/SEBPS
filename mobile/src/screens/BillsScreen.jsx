import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native'
import { FileText, Plus, Download, Trash2, CheckCircle2, Clock, XCircle, ChevronRight } from 'lucide-react-native'
import api from '../api/client'
import { C, S } from '../theme'
import { PageLoader, Card, EmptyState, Divider, StatusMsg, PrimaryBtn, Field } from '../components'

export default function BillsScreen({ navigation }) {
  const [bills,     setBills]     = useState([])
  const [jobs,      setJobs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [showFetch, setShowFetch] = useState(false)
  const [refNo,     setRefNo]     = useState('')
  const [fetching,  setFetching]  = useState(false)
  const [fetchMsg,  setFetchMsg]  = useState('')
  const [fetchOk,   setFetchOk]   = useState(false)

  const load = useCallback(async () => {
    try {
      const [b, j] = await Promise.all([
        api.get('/bills/'),
        api.get('/bills/fetch/jobs/'),
      ])
      setBills(b.data?.results ?? b.data ?? [])
      setJobs(j.data?.results ?? j.data ?? [])
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [])

  const triggerFetch = async () => {
    if (!refNo.trim()) { setFetchMsg('Enter your LESCO reference number'); setFetchOk(false); return }
    setFetching(true); setFetchMsg('')
    try {
      const { data } = await api.post('/bills/fetch/', { ref_no: refNo.trim() })
      setFetchMsg(`Fetching ${data.ref_no}… poll job #${data.id} for progress.`)
      setFetchOk(true)
      setShowFetch(false)
      load()
    } catch (e) {
      setFetchMsg(e.response?.data?.detail || 'Fetch failed')
      setFetchOk(false)
    } finally { setFetching(false) }
  }

  const deleteBill = (id) => {
    Alert.alert('Delete Bill', 'Remove this bill record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await api.delete(`/bills/${id}/`); setBills(p => p.filter(b => b.id !== id)) }
          catch { Alert.alert('Error', 'Could not delete bill') }
        },
      },
    ])
  }

  const jobStatusIcon = (status) => {
    if (status === 'success') return <CheckCircle2 size={14} color={C.success} />
    if (status === 'running') return <ActivityIndicator size={12} color={C.primary} />
    if (status === 'failed')  return <XCircle size={14} color={C.danger} />
    return <Clock size={14} color={C.textMuted} />
  }

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
          <Text style={styles.h1}>Bills</Text>
          <Text style={styles.h1Sub}>Manage your billing history</Text>
        </View>
        <TouchableOpacity onPress={() => setShowFetch(p => !p)} style={styles.fetchBtn}>
          <Download size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Fetch</Text>
        </TouchableOpacity>
      </View>

      {fetchMsg ? <StatusMsg ok={fetchOk} msg={fetchMsg} /> : null}

      {/* Fetch form */}
      {showFetch && (
        <Card>
          <Text style={styles.sectionTitle}>Fetch from LESCO</Text>
          <Text style={{ fontSize: 12, color: C.textSub, marginBottom: 12, marginTop: 4 }}>
            Enter your reference number to pull 12 months of LESCO history automatically.
          </Text>
          <Field
            label="LESCO Reference No."
            value={refNo}
            onChangeText={setRefNo}
            placeholder="e.g. 08 11274 1172000U"
            autoCapitalize="characters"
          />
          <PrimaryBtn label={fetching ? 'Fetching…' : 'Start Fetch'} onPress={triggerFetch} loading={fetching} />
        </Card>
      )}

      {/* Fetch jobs */}
      {jobs.length > 0 && (
        <Card style={{ padding: 0 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Fetch Jobs</Text>
          </View>
          {jobs.slice(0, 3).map((j, i) => (
            <View key={j.id}>
              {i > 0 && <Divider style={{ marginHorizontal: 16 }} />}
              <View style={styles.jobRow}>
                {jobStatusIcon(j.status)}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: C.text }}>{j.ref_no}</Text>
                  <Text style={{ fontSize: 11, color: C.textSub }}>
                    {j.status === 'success' ? `${j.months_fetched} months fetched` : j.status}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: C.textMuted }}>
                  {new Date(j.created_at).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Bills list */}
      {bills.length > 0 ? (
        <Card style={{ padding: 0 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Bill Records ({bills.length})</Text>
          </View>
          {bills.map((b, i) => (
            <View key={b.id ?? i}>
              {i > 0 && <Divider style={{ marginHorizontal: 16 }} />}
              <View style={styles.billRow}>
                <View style={styles.billIcon}>
                  <FileText size={15} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{b.month_label}</Text>
                  <Text style={{ fontSize: 12, color: C.textSub }}>{b.units} units · {b.source ?? 'manual'}</Text>
                  {b.payment_amount ? (
                    <Text style={{ fontSize: 11, color: C.success, marginTop: 2 }}>
                      Paid: Rs {Number(b.payment_amount).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>
                    Rs {Number(b.bill_amount).toLocaleString()}
                  </Text>
                  <TouchableOpacity onPress={() => deleteBill(b.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Trash2 size={14} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState
            Icon={FileText}
            title="No bills yet"
            subtitle="Fetch from LESCO or use OCR to scan a bill image"
            action={
              <TouchableOpacity onPress={() => navigation.navigate('OcrScreen')} style={[S.btnPrimary, { paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Scan a Bill</Text>
              </TouchableOpacity>
            }
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
  headerRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  fetchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  jobRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  billRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  billIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
})
