import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import {
  Lightbulb, TrendingDown, Zap, ChevronDown, ChevronUp,
  Bot, AlertTriangle, CheckCircle2, Clock, TrendingUp, Send, MessageSquare, X,
} from 'lucide-react-native'
import api from '../api/client'
import { C } from '../theme'
import { PageLoader, Card, EmptyState, PrimaryBtn, SecondaryBtn, StatusMsg, Divider } from '../components'

// ── Priority styles for rule-based recs ───────────────────────────────────────
const PRIORITY_STYLE = {
  high:   { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  medium: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  low:    { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
}

// ── Situation config for Smart AI ─────────────────────────────────────────────
const SITUATION_META = {
  well_within: { label: 'On Track',          color: C.successText,  bg: C.successBg,  Icon: CheckCircle2 },
  midway:      { label: 'Monitor Usage',     color: C.warningText,  bg: C.warningBg,  Icon: Clock },
  approaching: { label: 'Approaching Limit', color: '#92400E',      bg: '#FFFBEB',    Icon: AlertTriangle },
  exceeded:    { label: 'Budget Exceeded',   color: C.dangerText,   bg: C.dangerBg,   Icon: AlertTriangle },
}

// ── Transform Recommendation analysis → tip cards ────────────────────────────
function buildTips(recs) {
  if (!recs?.length) return []
  // Use the most recent Recommendation's appliance_breakdown
  const latest = recs[0]
  const breakdown = latest?.analysis?.appliance_breakdown ?? []
  return breakdown.map((item, i) => {
    const hourlyDropPkr = item.bill_drop_per_1hr ?? 0
    const savingPkr = Math.round(hourlyDropPkr * Math.min(item.hours_per_day ?? 1, 2) * 30)
    const pct = item.pct_of_total ?? 0
    const priority = pct > 100 ? 'high' : pct > 30 ? 'medium' : 'low'
    const newHours = Math.max(0, (item.hours_per_day ?? 0) - 1)
    return {
      id: `${latest.id}-${i}`,
      title: `Reduce ${item.name} usage`,
      category: (item.category ?? 'other').toLowerCase(),
      priority,
      estimated_saving_pkr: savingPkr,
      estimated_kwh_saving: item.savings_per_1hr ?? 0,
      description:
        `${item.name} consumes ${(item.monthly_units ?? 0).toFixed(1)} kWh/month at ` +
        `${item.hours_per_day ?? 0}h/day. Cutting 1 hour saves ~${(item.savings_per_1hr ?? 0).toFixed(1)} kWh ` +
        `and ~Rs ${hourlyDropPkr.toFixed(0)} per hour reduced.`,
      action_steps: [
        `Current usage: ${item.hours_per_day ?? 0} hours/day`,
        `Try cutting to ${newHours} hours/day`,
        `Each hour cut saves ${(item.savings_per_1hr ?? 0).toFixed(1)} kWh · Rs ${hourlyDropPkr.toFixed(0)}/month`,
      ],
    }
  })
}

export default function RecommendationsScreen() {
  // Rule-based recs (stored list)
  const [recs,       setRecs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expanded,   setExpanded]   = useState({})

  // Smart AI
  const [smart,        setSmart]        = useState(null)
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartErr,     setSmartErr]     = useState('')
  const [optExpanded,  setOptExpanded]  = useState(false)

  // Chat
  const [chatMessages,   setChatMessages]   = useState([])
  const [chatSessionId,  setChatSessionId]  = useState(null)
  const [chatInput,      setChatInput]      = useState('')
  const [chatSending,    setChatSending]    = useState(false)
  const [chatErr,        setChatErr]        = useState('')
  const [starters,       setStarters]       = useState([])
  const [chatOpen,       setChatOpen]       = useState(false)
  const scrollRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/recommendations/')
      const raw = r.data?.results ?? r.data ?? []
      setRecs(buildTips(raw))
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  const loadStarters = useCallback(async () => {
    try {
      const { data } = await api.get('/chatbot/starters/')
      setStarters(data?.starters ?? [])
    } catch {}
  }, [])

  useEffect(() => { load(); loadStarters() }, [])

  // ── Rule-based generate ────────────────────────────────────────────────────
  const generate = async () => {
    setGenerating(true)
    try {
      await api.post('/recommendations/generate/')
      load()
    } catch {}
    finally { setGenerating(false) }
  }

  // ── Smart AI Advisor ───────────────────────────────────────────────────────
  const runSmart = async () => {
    setSmartLoading(true); setSmartErr('')
    try {
      const { data } = await api.post('/recommendations/smart/')
      setSmart(data)
    } catch (e) {
      setSmartErr(
        e.response?.data?.detail ||
        'Could not generate AI advice. Make sure you have a prediction and appliances configured.'
      )
    } finally { setSmartLoading(false) }
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendChat = async (text) => {
    const msg = (text ?? chatInput).trim()
    if (!msg || chatSending) return
    setChatInput('')
    setChatErr('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatSending(true)
    try {
      const body = { message: msg }
      if (chatSessionId) body.session_id = chatSessionId
      const { data } = await api.post('/chatbot/message/', body)
      setChatSessionId(data.session_id)
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch (e) {
      const errMsg = e.response?.data?.detail || 'AI response failed. Try again.'
      setChatErr(errMsg)
      setChatMessages(prev => [...prev, { role: 'error', content: errMsg }])
    } finally { setChatSending(false) }
  }

  const clearChat = () => {
    setChatMessages([])
    setChatSessionId(null)
    setChatErr('')
  }

  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const totalSavings = recs.reduce((s, r) => s + (parseFloat(r.estimated_saving_pkr) || 0), 0)

  if (loading) return <PageLoader />

  const sitMeta = smart ? (SITUATION_META[smart.situation] ?? SITUATION_META.midway) : null
  const bs      = smart?.budget_status
  const autoOpt = smart?.auto_optimization
  const groq    = smart?.groq_advice

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.bg}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.primary} />}
      >
        <View style={{ paddingVertical: 4 }}>
          <Text style={styles.h1}>Recommendations</Text>
          <Text style={styles.h1Sub}>AI-powered tips to lower your electricity bill</Text>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════════
            SMART AI ADVISOR
        ═══════════════════════════════════════════════════════════════════════ */}
        <Card style={{ borderLeftWidth: 4, borderLeftColor: '#7C3AED' }}>
          <View style={styles.smartHeader}>
            <View style={styles.botIconWrap}>
              <Bot size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smartTitle}>Smart AI Advisor</Text>
              <Text style={{ fontSize: 12, color: C.textSub }}>
                Groq AI + IoT-aware budget analysis
              </Text>
            </View>
          </View>

          {/* Situation badge */}
          {smart && sitMeta && (
            <View style={[styles.situationBadge, { backgroundColor: sitMeta.bg }]}>
              <sitMeta.Icon size={14} color={sitMeta.color} />
              <Text style={[styles.situationText, { color: sitMeta.color }]}>{sitMeta.label}</Text>
              {bs?.pct_used != null && (
                <Text style={[styles.situationPct, { color: sitMeta.color }]}>
                  {bs.pct_used}% used
                </Text>
              )}
            </View>
          )}

          {/* Budget numbers */}
          {smart && bs && (
            <View style={styles.bsRow}>
              <View style={styles.bsTile}>
                <Text style={styles.bsTileVal}>
                  Rs {Math.round(bs.iot_cost_pkr || 0).toLocaleString()}
                </Text>
                <Text style={styles.bsTileLabel}>consumed (IoT)</Text>
              </View>
              <View style={styles.bsTile}>
                <Text style={styles.bsTileVal}>
                  Rs {Math.round(bs.remaining_budget_pkr || 0).toLocaleString()}
                </Text>
                <Text style={styles.bsTileLabel}>remaining</Text>
              </View>
              <View style={styles.bsTile}>
                <Text style={[styles.bsTileVal, { color: C.danger }]}>
                  Rs {Math.round(bs.predicted_bill_pkr || 0).toLocaleString()}
                </Text>
                <Text style={styles.bsTileLabel}>projected</Text>
              </View>
            </View>
          )}

          {/* Groq advice */}
          {groq ? (
            <View style={styles.groqBox}>
              <View style={styles.groqHeader}>
                <Bot size={13} color="#7C3AED" />
                <Text style={styles.groqLabel}>AI Advisor ({smart?.remaining_days} days left)</Text>
              </View>
              <Text style={styles.groqText}>{groq}</Text>
            </View>
          ) : smart ? (
            <View style={[styles.groqBox, { backgroundColor: C.border }]}>
              <Text style={{ fontSize: 13, color: C.textSub, textAlign: 'center' }}>
                AI advice unavailable — check your Groq API key.
              </Text>
            </View>
          ) : null}

          {/* Auto-optimization steps */}
          {autoOpt?.steps?.length > 0 && (
            <>
              <TouchableOpacity
                onPress={() => setOptExpanded(p => !p)}
                style={styles.optToggle}
                activeOpacity={0.7}
              >
                <TrendingDown size={14} color={C.success} />
                <Text style={styles.optToggleText}>
                  Auto-Optimization · Save Rs {Math.round(autoOpt.total_saved_pkr || 0).toLocaleString()}
                </Text>
                {optExpanded
                  ? <ChevronUp size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
                  : <ChevronDown size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
                }
              </TouchableOpacity>

              {optExpanded && (
                <View style={{ marginTop: 8 }}>
                  {autoOpt.optimized_bill_pkr != null && (
                    <Text style={{ fontSize: 12, color: C.successText, fontWeight: '600', marginBottom: 10 }}>
                      Optimized bill: Rs {Math.round(autoOpt.optimized_bill_pkr).toLocaleString()}
                    </Text>
                  )}
                  {autoOpt.steps.map((step, i) => (
                    <View key={i} style={styles.optStep}>
                      <View style={styles.stepNum}>
                        <Text style={styles.stepNumText}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>
                          {step.appliance} — cut {step.hours_reduced}h/day
                        </Text>
                        <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
                          Saves {Number(step.units_saved ?? 0).toFixed(1)} kWh ·
                          Rs {Math.round(step.money_saved_step ?? step.pkr_saved ?? 0).toLocaleString()}
                          {step.slab_crossed ? ' 🎯 slab drop!' : ''}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.textMuted }}>
                          New bill: Rs {Math.round(step.new_bill).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  ))}
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 16 }}>
                    Go to Appliances → Optimize to apply these reductions.
                  </Text>
                </View>
              )}
            </>
          )}

          {smartErr ? <StatusMsg ok={false} msg={smartErr} /> : null}

          <PrimaryBtn
            label={smartLoading ? 'Analyzing…' : smart ? 'Refresh AI Advice' : 'Get AI Advice'}
            onPress={runSmart}
            loading={smartLoading}
            style={{ marginTop: smart ? 12 : 0 }}
          />
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════════
            AI CHAT
        ═══════════════════════════════════════════════════════════════════════ */}
        <Card style={{ borderLeftWidth: 4, borderLeftColor: '#0EA5E9' }}>
          <TouchableOpacity
            style={styles.chatToggleRow}
            activeOpacity={0.8}
            onPress={() => setChatOpen(p => !p)}
          >
            <View style={styles.chatIconWrap}>
              <MessageSquare size={18} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smartTitle}>AI Chat</Text>
              <Text style={{ fontSize: 12, color: C.textSub }}>
                Ask anything about your electricity usage
              </Text>
            </View>
            {chatOpen
              ? <ChevronUp size={16} color={C.textMuted} />
              : <ChevronDown size={16} color={C.textMuted} />
            }
          </TouchableOpacity>

          {chatOpen && (
            <>
              {/* Starter prompts */}
              {starters.length > 0 && chatMessages.length === 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Suggested questions
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {starters.map((s, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => sendChat(s)}
                          style={styles.starterPill}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.starterText} numberOfLines={2}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Chat messages */}
              {chatMessages.length > 0 && (
                <View style={styles.messagesBox}>
                  {chatMessages.map((m, i) => (
                    <View
                      key={i}
                      style={[
                        styles.bubble,
                        m.role === 'user'
                          ? styles.bubbleUser
                          : m.role === 'error'
                          ? styles.bubbleError
                          : styles.bubbleAI,
                      ]}
                    >
                      {m.role !== 'user' && (
                        <View style={styles.bubbleLabel}>
                          {m.role === 'assistant'
                            ? <Bot size={11} color="#0EA5E9" />
                            : <AlertTriangle size={11} color={C.danger} />
                          }
                          <Text style={{ fontSize: 10, color: m.role === 'error' ? C.danger : '#0EA5E9', fontWeight: '700', marginLeft: 3 }}>
                            {m.role === 'assistant' ? 'AI' : 'Error'}
                          </Text>
                        </View>
                      )}
                      <Text style={[
                        styles.bubbleText,
                        m.role === 'user' ? { color: '#fff' } : m.role === 'error' ? { color: C.danger } : { color: C.text },
                      ]}>
                        {m.content}
                      </Text>
                    </View>
                  ))}
                  {chatSending && (
                    <View style={[styles.bubble, styles.bubbleAI]}>
                      <ActivityIndicator size="small" color="#0EA5E9" />
                    </View>
                  )}
                </View>
              )}

              {/* Input row */}
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask about your electricity bill…"
                  placeholderTextColor={C.textMuted}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={() => sendChat()}
                  editable={!chatSending}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, { opacity: (!chatInput.trim() || chatSending) ? 0.4 : 1 }]}
                  onPress={() => sendChat()}
                  disabled={!chatInput.trim() || chatSending}
                >
                  <Send size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              {chatMessages.length > 0 && (
                <TouchableOpacity onPress={clearChat} style={{ alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: C.textMuted }}>Clear conversation</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════════
            RULE-BASED RECOMMENDATIONS
        ═══════════════════════════════════════════════════════════════════════ */}

        {/* Savings summary */}
        {recs.length > 0 && totalSavings > 0 && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={styles.savingsIcon}>
              <TrendingDown size={20} color={C.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: C.textSub }}>Potential monthly savings</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.success }}>
                Rs {Math.round(totalSavings).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 11, color: C.textMuted }}>{recs.length} recommendations</Text>
            </View>
          </Card>
        )}

        <SecondaryBtn
          label={generating ? 'Generating…' : 'Refresh Rule-Based Tips'}
          onPress={generate}
          disabled={generating}
        />

        {recs.length > 0 ? (
          recs.map((rec, i) => {
            const priority = rec.priority ?? 'medium'
            const ps       = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.medium
            const isOpen   = expanded[rec.id]
            return (
              <TouchableOpacity key={rec.id ?? i} activeOpacity={0.8} onPress={() => toggleExpand(rec.id)}>
                <Card style={[{ borderLeftWidth: 4, borderLeftColor: ps.color }, { gap: 0 }]}>
                  <View style={styles.recHeader}>
                    <View style={[styles.priorityBadge, { backgroundColor: ps.bg, borderColor: ps.border }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: ps.color, textTransform: 'uppercase' }}>{priority}</Text>
                    </View>
                    {rec.category && (
                      <View style={styles.catBadge}>
                        <Text style={{ fontSize: 10, color: C.textSub, textTransform: 'capitalize' }}>{rec.category}</Text>
                      </View>
                    )}
                    <View style={{ marginLeft: 'auto' }}>
                      {isOpen ? <ChevronUp size={15} color={C.textMuted} /> : <ChevronDown size={15} color={C.textMuted} />}
                    </View>
                  </View>

                  <Text style={styles.recTitle}>{rec.title}</Text>

                  {rec.estimated_saving_pkr != null && parseFloat(rec.estimated_saving_pkr) > 0 && (
                    <View style={styles.savingRow}>
                      <TrendingDown size={12} color={C.success} />
                      <Text style={{ fontSize: 12, color: C.success, fontWeight: '600', marginLeft: 4 }}>
                        Save ~Rs {Math.round(rec.estimated_saving_pkr).toLocaleString()}/month
                      </Text>
                    </View>
                  )}

                  {isOpen && (
                    <>
                      <Divider style={{ marginVertical: 12 }} />
                      <Text style={styles.recDesc}>{rec.description ?? rec.detail}</Text>
                      {rec.action_steps?.length > 0 && (
                        <View style={{ marginTop: 12 }}>
                          <Text style={styles.stepsTitle}>Action Steps</Text>
                          {rec.action_steps.map((step, si) => (
                            <View key={si} style={styles.stepRow}>
                              <View style={styles.stepDot} />
                              <Text style={styles.stepText}>{step}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {rec.estimated_kwh_saving != null && (
                        <View style={[styles.savingRow, { marginTop: 10 }]}>
                          <Zap size={12} color={C.primary} />
                          <Text style={{ fontSize: 12, color: C.primary, marginLeft: 4 }}>
                            ~{Number(rec.estimated_kwh_saving).toFixed(1)} kWh saved per 1h cut
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </Card>
              </TouchableOpacity>
            )
          })
        ) : (
          <Card>
            <EmptyState
              Icon={Lightbulb}
              title="No rule-based tips yet"
              subtitle="Add appliances and billing history, then tap 'Refresh Rule-Based Tips'"
              action={
                <PrimaryBtn label="Generate Tips" onPress={generate} loading={generating} style={{ marginTop: 4 }} />
              }
            />
          </Card>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  content:  { padding: 16, gap: 12 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  // Smart AI
  smartHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  botIconWrap:  { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' },
  smartTitle:   { fontSize: 15, fontWeight: '700', color: C.text },
  situationBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12, marginBottom: 14 },
  situationText:  { fontSize: 13, fontWeight: '700', flex: 1 },
  situationPct:   { fontSize: 13, fontWeight: '600' },
  bsRow:  { flexDirection: 'row', gap: 8, marginBottom: 14 },
  bsTile: { flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
  bsTileVal:   { fontSize: 13, fontWeight: '800', color: C.text },
  bsTileLabel: { fontSize: 10, color: C.textMuted, marginTop: 3, textAlign: 'center' },
  groqBox:    { backgroundColor: '#FAF5FF', borderRadius: 12, padding: 14, marginBottom: 14 },
  groqHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  groqLabel:  { fontSize: 11, fontWeight: '700', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 0.8 },
  groqText:   { fontSize: 13, color: C.text, lineHeight: 21 },
  optToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.border, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 },
  optToggleText: { fontSize: 13, fontWeight: '600', color: C.successText },
  optStep:  { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stepNum:  { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  stepNumText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  // Chat
  chatToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 0 },
  chatIconWrap:  { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F0F9FF', alignItems: 'center', justifyContent: 'center' },
  starterPill: { backgroundColor: '#F0F9FF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#BAE6FD', maxWidth: 200 },
  starterText: { fontSize: 12, color: '#0284C7', fontWeight: '500', lineHeight: 17 },
  messagesBox: { backgroundColor: C.bg, borderRadius: 12, padding: 12, marginBottom: 12, gap: 10 },
  bubble:      { borderRadius: 14, padding: 12, maxWidth: '88%' },
  bubbleUser:  { backgroundColor: C.primary, alignSelf: 'flex-end' },
  bubbleAI:    { backgroundColor: '#F0F9FF', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#BAE6FD' },
  bubbleError: { backgroundColor: C.dangerBg, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#FECACA' },
  bubbleLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  bubbleText:  { fontSize: 13, lineHeight: 20 },
  chatInputRow:{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  chatInput:   { flex: 1, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.borderMd, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.text, maxHeight: 100 },
  sendBtn:     { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  // Rule-based recs
  savingsIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.successBg, alignItems: 'center', justifyContent: 'center' },
  recHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  catBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: C.border },
  recTitle:    { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 22 },
  savingRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  recDesc:     { fontSize: 13, color: C.textSub, lineHeight: 20 },
  stepsTitle:  { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 8 },
  stepRow:     { flexDirection: 'row', gap: 8, marginBottom: 6 },
  stepDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: C.primary, marginTop: 7, flexShrink: 0 },
  stepText:    { fontSize: 13, color: C.textSub, flex: 1, lineHeight: 20 },
})
