import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { Zap } from 'lucide-react-native'
import { useAuth } from '../../context/AuthContext'
import { C, S } from '../../theme'
import { Field, PrimaryBtn, StatusMsg } from '../../components'

export default function LoginScreen({ navigation }) {
  const { login } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [err,      setErr]      = useState('')

  const handleLogin = async () => {
    if (!email || !password) { setErr('Please enter email and password'); return }
    setLoading(true); setErr('')
    try {
      await login(email.trim().toLowerCase(), password)
      // AuthContext state change → AppNavigator switches to main tabs automatically
    } catch (e) {
      setErr(e.response?.data?.detail || e.response?.data?.non_field_errors?.[0] || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.bg} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Zap size={22} color="#fff" />
          </View>
          <View>
            <Text style={styles.logoTitle}>SEBPS</Text>
            <Text style={styles.logoSub}>Smart Bill Prediction</Text>
          </View>
        </View>

        {/* Card */}
        <View style={[S.surface, styles.card]}>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subHeading}>Sign in to your account</Text>

          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoComplete="password"
          />

          <StatusMsg ok={false} msg={err} />

          <PrimaryBtn label="Sign In" onPress={handleLogin} loading={loading} style={{ marginTop: 4 }} />

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.switchRow}>
            <Text style={styles.switchText}>
              Don't have an account?{' '}
              <Text style={{ color: C.primary, fontWeight: '700' }}>Register</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
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
