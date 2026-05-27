import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { User, Zap, Lock, LogOut, ChevronRight } from 'lucide-react-native'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { C, S } from '../theme'
import { PageLoader, Card, Field, PrimaryBtn, StatusMsg, Divider } from '../components'

function Section({ icon: Icon, title, iconBg = C.primaryLight, iconColor = C.primary, children }) {
  return (
    <Card>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
          <Icon size={15} color={iconColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </Card>
  )
}

export default function ProfileScreen() {
  const { refreshUser, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Personal
  const [personal, setPersonal] = useState({ username: '', phone_number: '' })
  const [pSaving,  setPSaving]  = useState(false)
  const [pMsg,     setPMsg]     = useState('')
  const [pOk,      setPOk]      = useState(false)

  // LESCO settings
  const [lesco, setLesco] = useState({ ref_no: '', sanctioned_load_kw: '2', billing_cycle_day: '1', phase: 'single_phase' })
  const [lSaving, setLSaving] = useState(false)
  const [lMsg,    setLMsg]    = useState('')
  const [lOk,     setLOk]     = useState(false)

  // Password
  const [pwd, setPwd] = useState({ old_password: '', new_password: '', new_password2: '' })
  const [cSaving, setCSaving] = useState(false)
  const [cMsg,    setCMsg]    = useState('')
  const [cOk,     setCOk]     = useState(false)

  useEffect(() => {
    api.get('/auth/me/').then(r => {
      const p = r.data
      setProfile(p)
      setPersonal({ username: p.username ?? '', phone_number: p.phone_number ?? '' })
      setLesco({
        ref_no:             p.ref_no             ?? '',
        sanctioned_load_kw: String(p.sanctioned_load_kw ?? 2),
        billing_cycle_day:  String(p.billing_cycle_day  ?? 1),
        phase:              p.phase ?? 'single_phase',
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const savePersonal = async () => {
    setPSaving(true); setPMsg('')
    try {
      await api.patch('/auth/me/', personal)
      setPMsg('Personal info updated'); setPOk(true)
      if (refreshUser) refreshUser()
    } catch (e) {
      setPMsg(e.response?.data?.detail || 'Save failed'); setPOk(false)
    } finally { setPSaving(false) }
  }

  const saveLesco = async () => {
    setLSaving(true); setLMsg('')
    try {
      await api.patch('/auth/me/', {
        ref_no:             lesco.ref_no,
        sanctioned_load_kw: parseFloat(lesco.sanctioned_load_kw) || 2,
        billing_cycle_day:  parseInt(lesco.billing_cycle_day)    || 1,
        phase:              lesco.phase,
      })
      setLMsg('Meter settings saved'); setLOk(true)
    } catch (e) {
      setLMsg(e.response?.data?.detail || 'Save failed'); setLOk(false)
    } finally { setLSaving(false) }
  }

  const changePassword = async () => {
    if (pwd.new_password !== pwd.new_password2) { setCMsg('New passwords do not match'); setCOk(false); return }
    setCSaving(true); setCMsg('')
    try {
      await api.post('/auth/change-password/', pwd)
      setCMsg('Password changed successfully'); setCOk(true)
      setPwd({ old_password: '', new_password: '', new_password2: '' })
    } catch (e) {
      setCMsg(e.response?.data?.old_password?.[0] || e.response?.data?.detail || 'Change failed'); setCOk(false)
    } finally { setCSaving(false) }
  }

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  if (loading) return <PageLoader />

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* Header with avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{(profile?.username?.[0] ?? profile?.email?.[0] ?? 'U').toUpperCase()}</Text>
        </View>
        <Text style={styles.avatarName}>{profile?.username}</Text>
        <Text style={styles.avatarEmail}>{profile?.email}</Text>
      </View>

      {/* Tariff info banner */}
      <Card style={{ flexDirection: 'row', gap: 12, borderLeftWidth: 4, borderLeftColor: C.primary }}>
        <Zap size={15} color={C.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>LESCO slab tariff</Text>
          <Text style={{ fontSize: 11, color: C.textSub, marginTop: 4, lineHeight: 17 }}>
            Rate adjusts automatically with consumption: Rs 3.95 (≤50 lifeline) → Rs 7.74 (51–100) → Rs 22.44 (unprotected 1–100) → Rs 33.10 (201–300) → Rs 47.20 (above 700).
          </Text>
        </View>
      </Card>

      {/* Personal info */}
      <Section icon={User} title="Personal Information">
        <View style={{ marginTop: 12 }}>
          <Field label="Username" value={personal.username} onChangeText={v => setPersonal(p => ({ ...p, username: v }))} placeholder="Display name" />
          <Field label="Phone number" value={personal.phone_number} onChangeText={v => setPersonal(p => ({ ...p, phone_number: v }))} placeholder="+92 3xx xxxxxxx" keyboardType="phone-pad" />
          <View style={{ marginBottom: 14 }}>
            <Text style={S.label}>Email (cannot be changed)</Text>
            <Text style={[S.input, { color: C.textMuted, textAlignVertical: 'center', paddingTop: 11 }]}>{profile?.email}</Text>
          </View>
          <StatusMsg ok={pOk} msg={pMsg} />
          <PrimaryBtn label={pSaving ? 'Saving…' : 'Save Personal Info'} onPress={savePersonal} loading={pSaving} />
        </View>
      </Section>

      {/* LESCO settings */}
      <Section icon={Zap} title="LESCO Meter Settings" iconBg="#FFFBEB" iconColor="#D97706">
        <View style={{ marginTop: 12 }}>
          <Field label="LESCO Reference No." value={lesco.ref_no} onChangeText={v => setLesco(p => ({ ...p, ref_no: v }))} placeholder="e.g. 08 11274 1172000U" autoCapitalize="characters" />
          <Field label="Sanctioned Load (kW)" value={lesco.sanctioned_load_kw} onChangeText={v => setLesco(p => ({ ...p, sanctioned_load_kw: v }))} placeholder="e.g. 5" keyboardType="decimal-pad" />
          <Field label="Billing Cycle Start Day (1–28)" value={lesco.billing_cycle_day} onChangeText={v => setLesco(p => ({ ...p, billing_cycle_day: v }))} placeholder="1" keyboardType="numeric" />

          {/* Phase selector */}
          <Text style={S.label}>Phase</Text>
          <View style={styles.phaseRow}>
            {[{ val: 'single_phase', label: 'Single Phase' }, { val: 'three_phase', label: 'Three Phase' }].map(opt => (
              <TouchableOpacity key={opt.val} onPress={() => setLesco(p => ({ ...p, phase: opt.val }))}
                style={[styles.phaseBtn, lesco.phase === opt.val && styles.phaseBtnActive]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: lesco.phase === opt.val ? '#fff' : C.textSub }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <StatusMsg ok={lOk} msg={lMsg} />
          <PrimaryBtn label={lSaving ? 'Saving…' : 'Save Meter Settings'} onPress={saveLesco} loading={lSaving} style={{ marginTop: 4 }} />
        </View>
      </Section>

      {/* Change password */}
      <Section icon={Lock} title="Change Password" iconBg={C.border} iconColor={C.textSub}>
        <View style={{ marginTop: 12 }}>
          <Field label="Current password" value={pwd.old_password} onChangeText={v => setPwd(p => ({ ...p, old_password: v }))} placeholder="Enter current password" secureTextEntry />
          <Field label="New password" value={pwd.new_password} onChangeText={v => setPwd(p => ({ ...p, new_password: v }))} placeholder="Min 8 characters" secureTextEntry />
          <Field label="Confirm new password" value={pwd.new_password2} onChangeText={v => setPwd(p => ({ ...p, new_password2: v }))} placeholder="Repeat new password" secureTextEntry />
          <StatusMsg ok={cOk} msg={cMsg} />
          <PrimaryBtn
            label={cSaving ? 'Changing…' : 'Change Password'}
            onPress={changePassword}
            loading={cSaving}
            disabled={!pwd.old_password || !pwd.new_password}
          />
        </View>
      </Section>

      {/* Sign out */}
      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
        <LogOut size={16} color={C.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:          { flex: 1, backgroundColor: C.bg },
  content:     { padding: 16, gap: 12 },
  avatarSection:{ alignItems: 'center', paddingVertical: 24 },
  avatar:      { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarLetter:{ fontSize: 28, fontWeight: '800', color: '#fff' },
  avatarName:  { fontSize: 18, fontWeight: '800', color: C.text },
  avatarEmail: { fontSize: 13, color: C.textSub, marginTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ fontSize: 14, fontWeight: '700', color: C.text },
  phaseRow:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
  phaseBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.borderMd, alignItems: 'center', backgroundColor: '#fff' },
  phaseBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  logoutBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: C.dangerBg },
  logoutText:  { fontSize: 15, fontWeight: '700', color: C.danger },
})
