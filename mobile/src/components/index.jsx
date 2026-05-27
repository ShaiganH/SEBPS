import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { C, S } from '../theme'

// ── Loading spinner ───────────────────────────────────────────────────────────
export function Spinner({ size = 'large' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size={size} color={C.primary} />
    </View>
  )
}

// ── Full-page centered spinner ────────────────────────────────────────────────
export function PageLoader() {
  return (
    <View style={[styles.center, { flex: 1, backgroundColor: C.bg }]}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  )
}

// ── Surface card ──────────────────────────────────────────────────────────────
export function Card({ children, style, padding = 16 }) {
  return (
    <View style={[S.surface, { padding }, style]}>
      {children}
    </View>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={S.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={{ color: C.textSub, fontSize: 13, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  )
}

// ── Primary button ────────────────────────────────────────────────────────────
export function PrimaryBtn({ label, onPress, loading, disabled, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[S.btnPrimary, (disabled || loading) && { opacity: 0.6 }, style]}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{label}</Text>
      }
    </TouchableOpacity>
  )
}

// ── Secondary button ──────────────────────────────────────────────────────────
export function SecondaryBtn({ label, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[S.btnSecondary, disabled && { opacity: 0.5 }, style]}
    >
      <Text style={{ color: C.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  )
}

// ── Labeled text input ────────────────────────────────────────────────────────
export function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={S.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.textMuted}
        style={S.input}
        {...props}
      />
    </View>
  )
}

// ── Status message (success / error) ─────────────────────────────────────────
export function StatusMsg({ ok, msg }) {
  if (!msg) return null
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: ok ? C.successBg : C.dangerBg,
      borderRadius: 12, padding: 12, marginVertical: 8,
    }}>
      <Text style={{ color: ok ? C.successText : C.dangerText, fontSize: 13, flex: 1 }}>{msg}</Text>
    </View>
  )
}

// ── Icon chip (small colored label) ──────────────────────────────────────────
export function Chip({ label, color = C.primary, bg, style }) {
  return (
    <View style={[{
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 20, alignSelf: 'flex-start',
      backgroundColor: bg || C.primaryLight,
    }, style]}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  )
}

// ── KPI stat tile ─────────────────────────────────────────────────────────────
export function StatTile({ label, value, sub, iconBg = C.primaryLight, Icon, iconColor = C.primary }) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {Icon && (
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={iconColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: C.textMuted }}>{label}</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{value}</Text>
        {sub ? <Text style={{ fontSize: 11, color: C.textMuted }}>{sub}</Text> : null}
      </View>
    </Card>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ Icon, title, subtitle, action }) {
  return (
    <View style={[styles.center, { paddingVertical: 48, gap: 12 }]}>
      {Icon && (
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={24} color={C.textMuted} />
        </View>
      )}
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 13, color: C.textSub, textAlign: 'center', paddingHorizontal: 32 }}>{subtitle}</Text> : null}
      {action}
    </View>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: C.border }, style]} />
}

// ── Row item (used in list tiles) ─────────────────────────────────────────────
export function RowItem({ leftIcon, title, subtitle, right, onPress, style }) {
  const Wrap = onPress ? TouchableOpacity : View
  return (
    <Wrap onPress={onPress} activeOpacity={0.7} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }, style]}>
      {leftIcon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: C.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: C.textSub, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </Wrap>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
})
