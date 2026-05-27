import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { Zap } from 'lucide-react-native'
import { useAuth } from '../../context/AuthContext'
import { C, S } from '../../theme'
import { Field, PrimaryBtn, StatusMsg } from '../../components'

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth()
  const [form, setForm] = useState({
    username: '', email: '', phone_number: '', password: '', password2: '',
  })
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')

  const set = key => val => setForm(p => ({ ...p, [key]: val }))

  const handleRegister = async () => {
    if (form.password !== form.password2) { setErr('Passwords do not match'); return }
    if (!form.email || !form.password || !form.username) { setErr('Please fill all required fields'); return }
    setLoading(true); setErr('')
    try {
      await register({
        username: form.username,
        email:    form.email.trim().toLowerCase(),
        phone_number: form.phone_number,
        password: form.password,
        password2: form.password2,
      })
    } catch (e) {
      const d = e.response?.data
      setErr(d?.detail || d?.email?.[0] || d?.username?.[0] || d?.password?.[0] || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.bg} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Zap size={22} color="#fff" />
          </View>
          <View>
            <Text style={styles.logoTitle}>SEBPS</Text>
            <Text style={styles.logoSub}>Smart Bill Prediction</Text>
          </View>
        </View>

        <View style={[S.surface, styles.card]}>
          <Text style={styles.heading}>Create account</Text>
          <Text style={styles.subHeading}>Start tracking your electricity today</Text>

          <Field label="Username *"      value={form.username}     onChangeText={set('username')}     placeholder="johndoe" autoCapitalize="none" />
          <Field label="Email *"         value={form.email}        onChangeText={set('email')}        placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone (optional)" value={form.phone_number} onChangeText={set('phone_number')} placeholder="+92 3xx xxxxxxx" keyboardType="phone-pad" />
          <Field label="Password *"      value={form.password}     onChangeText={set('password')}     placeholder="Min 8 characters" secureTextEntry />
          <Field label="Confirm password *" value={form.password2}  onChangeText={set('password2')}   placeholder="Repeat password" secureTextEntry />

          <StatusMsg ok={false} msg={err} />

          <PrimaryBtn label="Create Account" onPress={handleRegister} loading={loading} style={{ marginTop: 4 }} />

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.switchRow}>
            <Text style={styles.switchText}>
              Already have an account?{' '}
              <Text style={{ color: C.primary, fontWeight: '700' }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 48 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32, justifyContent: 'center' },
  logoBox: { width: 44, height: 44, backgroundColor: C.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  logoSub: { fontSize: 11, color: C.textSub },
  card: { padding: 24 },
  heading: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  subHeading: { fontSize: 14, color: C.textSub, marginBottom: 24 },
  switchRow: { marginTop: 20, alignItems: 'center' },
  switchText: { fontSize: 13, color: C.textSub },
})
