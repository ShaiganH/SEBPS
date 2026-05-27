import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { TrendingUp, Wallet, Zap, Lightbulb, ScanLine, User, ChevronRight } from 'lucide-react-native'
import { useAuth } from '../context/AuthContext'
import { C } from '../theme'

const ITEMS = [
  { label: 'Predictions',     subtitle: 'AI bill forecasts',       icon: TrendingUp, color: C.primary,  bg: C.primaryLight, screen: 'PredictionsScreen' },
  { label: 'Budget',          subtitle: 'Monthly spend limits',    icon: Wallet,     color: '#D97706',  bg: '#FFFBEB',      screen: 'BudgetScreen'      },
  { label: 'Appliances',      subtitle: 'Device energy tracking',  icon: Zap,        color: '#059669',  bg: '#ECFDF5',      screen: 'AppliancesScreen'  },
  { label: 'Recommendations', subtitle: 'AI energy-saving tips',   icon: Lightbulb,  color: '#7C3AED',  bg: '#F5F3FF',      screen: 'RecommendationsScreen' },
  { label: 'OCR Scan',        subtitle: 'Scan bill image',         icon: ScanLine,   color: '#0284C7',  bg: '#F0F9FF',      screen: 'OcrScreen'         },
  { label: 'Profile',         subtitle: 'Account & meter settings',icon: User,       color: '#64748B',  bg: '#F8FAFC',      screen: 'ProfileScreen'     },
]

export default function MoreScreen({ navigation }) {
  const { user } = useAuth()

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* User card */}
      <TouchableOpacity onPress={() => navigation.navigate('ProfileScreen')} style={styles.userCard} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{(user?.username?.[0] ?? 'U').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.username}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>
        <ChevronRight size={18} color={C.textMuted} />
      </TouchableOpacity>

      {/* Feature grid */}
      <Text style={styles.sectionLabel}>FEATURES</Text>
      <View style={styles.grid}>
        {ITEMS.map(item => (
          <TouchableOpacity
            key={item.label}
            onPress={() => navigation.navigate(item.screen)}
            style={styles.gridItem}
            activeOpacity={0.7}
          >
            <View style={[styles.gridIcon, { backgroundColor: item.bg }]}>
              <item.icon size={22} color={item.color} />
            </View>
            <Text style={styles.gridLabel}>{item.label}</Text>
            <Text style={styles.gridSub}>{item.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List items */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.listCard}>
        {[
          { label: 'Profile & Settings', screen: 'ProfileScreen', icon: User },
        ].map((item, i) => (
          <TouchableOpacity key={i} onPress={() => navigation.navigate(item.screen)} style={styles.listItem} activeOpacity={0.7}>
            <item.icon size={17} color={C.textSub} />
            <Text style={styles.listLabel}>{item.label}</Text>
            <ChevronRight size={15} color={C.textMuted} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        ))}
      </View>

      {/* App info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>SEBPS — Smart Electricity Bill Prediction System</Text>
        <Text style={styles.footerVersion}>v1.0.0 · FYP 2026</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  content:  { padding: 16, gap: 16, paddingBottom: 32 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  avatar:   { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 15, fontWeight: '700', color: C.text },
  userEmail:{ fontSize: 12, color: C.textSub, marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: -4 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  gridIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gridLabel:{ fontSize: 14, fontWeight: '700', color: C.text },
  gridSub:  { fontSize: 11, color: C.textSub, lineHeight: 16 },
  listCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  listLabel:{ fontSize: 14, fontWeight: '500', color: C.text },
  footer:   { alignItems: 'center', paddingTop: 8 },
  footerText: { fontSize: 12, color: C.textMuted, textAlign: 'center' },
  footerVersion: { fontSize: 11, color: C.border, marginTop: 4 },
})
