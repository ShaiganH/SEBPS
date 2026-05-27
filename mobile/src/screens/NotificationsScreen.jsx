import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native'
import { Bell, CheckCheck, Zap, TrendingUp, AlertTriangle, Info, FileText } from 'lucide-react-native'
import api from '../api/client'
import { C } from '../theme'
import { PageLoader, Card, EmptyState, Divider } from '../components'

const TYPE_META = {
  budget_warning:    { Icon: AlertTriangle, color: '#D97706', bg: '#FFFBEB' },
  budget_exceeded:   { Icon: AlertTriangle, color: '#DC2626', bg: '#FEF2F2' },
  prediction_ready:  { Icon: TrendingUp,    color: '#2563EB', bg: '#EFF6FF' },
  fetch_complete:    { Icon: FileText,      color: '#059669', bg: '#ECFDF5' },
  iot_alert:         { Icon: Zap,           color: '#7C3AED', bg: '#F5F3FF' },
  default:           { Icon: Info,          color: '#64748B', bg: '#F8FAFC' },
}

function NotifIcon({ type }) {
  const meta = TYPE_META[type] ?? TYPE_META.default
  return (
    <View style={[styles.notifIcon, { backgroundColor: meta.bg }]}>
      <meta.Icon size={15} color={meta.color} />
    </View>
  )
}

export default function NotificationsScreen() {
  const [notifs,    setNotifs]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [markingAll,setMarkingAll]= useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/notifications/')
      setNotifs(r.data?.results ?? r.data ?? [])
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [])

  const markRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read/`)
      setNotifs(p => p.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch {}
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await api.post('/notifications/read-all/')
      setNotifs(p => p.map(n => ({ ...n, is_read: true })))
    } catch {}
    finally { setMarkingAll(false) }
  }

  const unreadCount = notifs.filter(n => !n.is_read).length

  const formatTime = (ts) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })
  }

  if (loading) return <PageLoader />

  return (
    <View style={styles.bg}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.h1Sub}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} disabled={markingAll} style={styles.markAllBtn}>
            <CheckCheck size={14} color={C.primary} />
            <Text style={styles.markAllText}>{markingAll ? 'Marking…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifs}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
        ItemSeparatorComponent={() => <Divider style={{ marginHorizontal: 16 }} />}
        ListEmptyComponent={
          <Card style={{ margin: 16 }}>
            <EmptyState Icon={Bell} title="No notifications" subtitle="Budget alerts, prediction updates and LESCO fetch results will appear here" />
          </Card>
        }
        renderItem={({ item: n }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => !n.is_read && markRead(n.id)}
            style={[styles.notifRow, !n.is_read && styles.notifUnread]}
          >
            <NotifIcon type={n.type} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[styles.notifTitle, !n.is_read && { color: C.text }]} numberOfLines={2}>
                  {n.title}
                </Text>
                {!n.is_read && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.notifMsg} numberOfLines={2}>{n.message}</Text>
              <Text style={styles.notifTime}>{formatTime(n.created_at)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: C.primaryLight },
  markAllText:{ fontSize: 12, color: C.primary, fontWeight: '600' },
  list:     { paddingBottom: 24 },
  notifRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface },
  notifUnread: { backgroundColor: '#FAFBFF' },
  notifIcon:{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifTitle:{ fontSize: 14, fontWeight: '600', color: C.textSub, flex: 1, lineHeight: 20 },
  notifMsg: { fontSize: 12, color: C.textSub, marginTop: 3, lineHeight: 18 },
  notifTime:{ fontSize: 11, color: C.textMuted, marginTop: 4 },
  unreadDot:{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.primary, marginTop: 4, flexShrink: 0 },
})
