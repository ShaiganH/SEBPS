import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import {
  Lightbulb, Star, Zap, ChevronDown, ChevronUp,
  AlertTriangle, Send, Bot, User, RotateCcw, Cpu,
} from 'lucide-react'

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
)

const SIT = {
  well_within: { border: 'border-emerald-200', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Well Within Budget', dot: 'bg-emerald-500' },
  midway:      { border: 'border-blue-200',    badge: 'bg-blue-50 text-blue-700 border-blue-200',          label: 'On Track',          dot: 'bg-blue-500'    },
  approaching: { border: 'border-amber-200',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Approaching Limit', dot: 'bg-amber-500'   },
  exceeded:    { border: 'border-red-200',      badge: 'bg-red-50 text-red-700 border-red-200',             label: 'Budget Exceeded',   dot: 'bg-red-500'     },
}

function MdText({ text }) {
  if (!text) return null
  return (
    <div className="space-y-1 text-sm text-slate-700 leading-relaxed">
      {text.split('\n').map((line, i) => {
        const isBullet = /^\s*[\*\-]\s/.test(line)
        const content  = line.replace(/^\s*[\*\-]\s/, '')
        const parts    = content.split(/(\*\*[^*]+\*\*)/)
        const rendered = parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} className="text-slate-900 font-semibold">{p.slice(2, -2)}</strong>
            : p
        )
        if (!line.trim()) return <div key={i} className="h-1.5" />
        return isBullet
          ? <div key={i} className="flex gap-2 items-start">
              <span className="text-blue-500 flex-shrink-0 mt-0.5 text-sm">•</span>
              <span>{rendered}</span>
            </div>
          : <div key={i}>{rendered}</div>
      })}
    </div>
  )
}

function AssistantBubble({ children }) {
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot size={13} className="text-violet-600" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] shadow-sm">
        {children}
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="flex gap-2.5 flex-row-reverse">
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        <User size={13} className="text-white" />
      </div>
      <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[90%]">
        <p className="text-sm text-white">{text}</p>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <AssistantBubble>
      <div className="flex gap-1 items-center h-4 px-1">
        {[0, 1, 2].map(d => (
          <div key={d} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"
            style={{ animationDelay: `${d * 0.15}s` }} />
        ))}
      </div>
    </AssistantBubble>
  )
}

const STARTERS = {
  well_within: ['How can I save even more?', 'Am I near a tariff slab boundary?', 'Which appliance costs the most?'],
  midway:      ['Which appliances need monitoring?', 'What will my bill be if I run AC 4 more hours?', 'Am I near a slab boundary?'],
  approaching: ['What is the single biggest cut I can make?', 'How many hours can I run AC and stay in budget?', 'Give me a plan for remaining days.'],
  exceeded:    ['What is the fastest way to cut my bill?', 'Which appliance should I turn off completely?', 'How much does each geyser hour cost?'],
}

export default function Recommendations() {
  const [recs,         setRecs]         = useState([])
  const [smart,        setSmart]        = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [genning,      setGenning]      = useState(false)
  const [smartLoading, setSmartLoading] = useState(false)
  const [expanded,     setExpanded]     = useState(null)
  const [applyForm,    setApplyForm]    = useState({})
  const [applying,     setApplying]     = useState(null)
  const [applyResults, setApplyResults] = useState({})
  const [msg,          setMsg]          = useState('')
  const [chatMessages,  setChatMessages]  = useState([])
  const [chatInput,     setChatInput]     = useState('')
  const [chatLoading,   setChatLoading]   = useState(false)
  const [sessionId,     setSessionId]     = useState(null)
  const chatBottomRef = useRef(null)

  const load = () =>
    api.get('/recommendations/')
      .then(r => setRecs(r.data?.results ?? r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const generate = async () => {
    setGenning(true); setMsg('')
    try { await api.post('/recommendations/generate/', {}); load() }
    catch (err) { setMsg(err.response?.data?.detail || 'Generation failed') }
    finally { setGenning(false) }
  }

  const getSmart = async () => {
    setSmartLoading(true); setSmart(null)
    setChatMessages([]); setSessionId(null); setChatInput('')
    try {
      const { data } = await api.post('/recommendations/smart/', {})
      setSmart(data)
    }
    catch (err) { setMsg(err.response?.data?.detail || 'Smart analysis failed') }
    finally { setSmartLoading(false) }
  }

  const sendChat = async (text) => {
    const content = (text ?? chatInput).trim()
    if (!content || chatLoading) return
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content }])
    setChatLoading(true)
    try {
      const { data } = await api.post('/chatbot/message/', {
        message: content,
        ...(sessionId ? { session_id: sessionId } : {}),
      })
      setSessionId(data.session_id)
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '⚠ Could not reach AI. Please try again.' }])
    } finally { setChatLoading(false) }
  }

  const applyReductions = async recId => {
    setApplying(recId)
    const reductions = Object.entries(applyForm[recId] || {})
      .filter(([, h]) => +h > 0)
      .map(([name, hours_reduced]) => ({ name, hours_reduced: +hours_reduced }))
    if (!reductions.length) { setApplying(null); return }
    try {
      const { data } = await api.post(`/recommendations/${recId}/apply/`, { reductions })
      setApplyResults(prev => ({ ...prev, [recId]: data.apply_result }))
      load()
    }
    catch (err) { setMsg(err.response?.data?.detail || 'Apply failed') }
    finally { setApplying(null) }
  }

  if (loading) return <Spinner />

  const sit     = smart ? SIT[smart.situation] ?? SIT.well_within : null
  const bs      = smart?.budget_status
  const pctUsed = bs?.pct_used ?? 0
  const pctColor = pctUsed >= 100 ? 'bg-red-500' : pctUsed >= 75 ? 'bg-amber-400' : 'bg-emerald-500'
  const starters = STARTERS[smart?.situation ?? 'well_within']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recommendations &amp; AI</h1>
          <p className="text-slate-500 text-sm mt-1">Personalised advice to reduce your electricity bill</p>
        </div>
        <div className="flex gap-2">
          <button onClick={generate} disabled={genning}
            className="btn-secondary flex items-center gap-1.5 text-xs px-3.5 py-2">
            <Lightbulb size={13} className="text-slate-500" />
            {genning ? 'Generating…' : 'Rule-Based'}
          </button>
          <button onClick={getSmart} disabled={smartLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white transition-colors">
            <Star size={13} />
            {smartLoading ? 'Analysing…' : 'Smart + AI'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{msg}</div>
      )}

      {/* Loading */}
      {smartLoading && (
        <div className="surface p-6 flex items-center gap-3">
          <div className="w-6 h-6 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-slate-600">Analysing your usage pattern and generating personalised advice…</p>
        </div>
      )}

      {/* ── Smart card ────────────────────────────────────────────────────── */}
      {smart && sit && (
        <div className={`surface border ${sit.border} overflow-hidden`}>
          <div className="p-6">
            {/* Status */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${sit.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sit.dot}`} />
                  {sit.label}
                </span>
                <p className="text-xs text-slate-400 mt-1.5">
                  {smart.remaining_days} day{smart.remaining_days !== 1 ? 's' : ''} remaining in billing cycle
                </p>
              </div>
              {bs?.has_iot && (
                <div className="text-right">
                  <p className="text-xs text-slate-400 flex items-center justify-end gap-1 mb-0.5">
                    <Cpu size={11} /> IoT actual
                  </p>
                  <p className="text-xl font-bold text-slate-900">Rs {Number(bs.iot_cost_pkr).toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{bs.iot_units_kwh} kWh · {bs.pct_used}% of budget</p>
                </div>
              )}
            </div>

            {/* Budget bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Spent so far</span>
                <span>Budget: Rs {Number(bs?.budget_pkr).toLocaleString()}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pctColor}`}
                  style={{ width: `${Math.min(pctUsed, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-1.5 text-slate-400">
                <span>Rs {Number(bs?.iot_cost_pkr ?? 0).toLocaleString()} ({pctUsed}%)</span>
                {(bs?.remaining_budget_pkr ?? 0) > 0 && (
                  <span>Rs {Number(bs.remaining_budget_pkr).toLocaleString()} remaining</span>
                )}
              </div>
            </div>

            {bs?.projection_exceeds_budget && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 mb-4">
                <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Projected month-end: Rs {Number(bs.predicted_bill_pkr).toLocaleString()}</span>
                  {' '}— Rs {Number(bs.over_budget_by_pkr).toLocaleString()} over budget at current rate.
                </p>
              </div>
            )}

            {/* Top consumers */}
            {smart.rule_based?.appliance_breakdown?.filter(a => a.monthly_units > 0).length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                  <Zap size={11} /> Top Consumers — {smart.remaining_days}d remaining
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {smart.rule_based.appliance_breakdown.filter(a => a.monthly_units > 0).slice(0, 4).map(a => (
                    <div key={a.name} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm">
                      <span className="font-medium text-slate-800 truncate mr-2">{a.name}</span>
                      <div className="flex gap-3 text-xs flex-shrink-0">
                        <span className="text-blue-600 font-medium">{a.monthly_units} kWh</span>
                        {a.bill_drop_per_1hr > 0 && (
                          <span className="text-amber-600">−Rs {Number(a.bill_drop_per_1hr).toLocaleString()}/hr</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat */}
            <div className="border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">AI Advisor</p>
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1 mb-4">
                {smart.groq_advice && (
                  <AssistantBubble>
                    <MdText text={smart.groq_advice} />
                  </AssistantBubble>
                )}
                {chatMessages.map((m, i) =>
                  m.role === 'user'
                    ? <UserBubble key={i} text={m.content} />
                    : <AssistantBubble key={i}><MdText text={m.content} /></AssistantBubble>
                )}
                {chatLoading && <TypingDots />}
                <div ref={chatBottomRef} />
              </div>

              {chatMessages.length === 0 && !chatLoading && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {starters.map((s, i) => (
                    <button key={i} onClick={() => sendChat(s)}
                      className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 px-3 py-1.5 rounded-full transition-colors text-left">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text" value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder="Ask a follow-up question…"
                  disabled={chatLoading}
                  className="input flex-1"
                />
                <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                  className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors flex-shrink-0">
                  <Send size={15} />
                </button>
              </div>
              {chatMessages.length > 0 && (
                <button onClick={() => { setChatMessages([]); setSessionId(null); setChatInput('') }}
                  className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                  <RotateCcw size={10} /> Clear follow-ups
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Standalone chat — before any Smart result */}
      {!smart && !smartLoading && (
        <div className="surface p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
              <Star size={15} className="text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Ask the AI</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Click <span className="text-violet-600 font-medium">Smart + AI</span> for a full analysis, or ask a quick question
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {STARTERS.well_within.map((s, i) => (
              <button key={i} onClick={() => sendChat(s)}
                className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors">
                {s}
              </button>
            ))}
          </div>

          {chatMessages.length > 0 && (
            <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
              {chatMessages.map((m, i) =>
                m.role === 'user'
                  ? <UserBubble key={i} text={m.content} />
                  : <AssistantBubble key={i}><MdText text={m.content} /></AssistantBubble>
              )}
              {chatLoading && <TypingDots />}
              <div ref={chatBottomRef} />
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text" value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
              placeholder="Ask anything about your electricity usage…"
              disabled={chatLoading}
              className="input flex-1"
            />
            <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
              className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors flex-shrink-0">
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Saved history */}
      {recs.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="font-semibold text-slate-900 text-sm">Saved Recommendations</p>
          </div>
          <div className="divide-y divide-slate-50">
            {recs.map(rec => (
              <div key={rec.id}>
                <button
                  onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rec.within_budget ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className={`text-xs font-medium ${rec.within_budget ? 'text-emerald-600' : 'text-red-600'}`}>
                      {rec.within_budget ? 'Within Budget' : 'Over Budget'}
                    </span>
                    <span className="text-sm text-slate-700">
                      {rec.predicted_units} units · Rs {Number(rec.predicted_bill_pkr).toLocaleString()}
                    </span>
                    {rec.pkr_gap > 0 && (
                      <span className="text-xs text-red-500">Gap: Rs {Number(rec.pkr_gap).toLocaleString()}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{new Date(rec.created_at).toLocaleDateString()}</span>
                    {expanded === rec.id ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </button>

                {expanded === rec.id && (
                  <div className="px-6 pb-5 bg-slate-50/50">
                    {rec.analysis?.appliance_breakdown?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Appliance Breakdown</p>
                        <div className="space-y-1.5">
                          {rec.analysis.appliance_breakdown.slice(0, 5).map(a => (
                            <div key={a.name} className="flex items-center justify-between text-xs bg-white border border-slate-100 rounded-xl px-3.5 py-2.5">
                              <span className="font-medium text-slate-800">{a.name}</span>
                              <div className="flex gap-4 text-slate-500">
                                <span>{a.monthly_units} kWh</span>
                                <span className="text-amber-600">Rs {Number(a.bill_drop_per_1hr).toLocaleString()}/hr cut</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {rec.analysis?.appliance_breakdown?.length > 0 && !rec.applied && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Apply Hour Reductions</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                          {rec.analysis.appliance_breakdown.filter(a => a.bill_drop_per_1hr > 0).slice(0, 6).map(a => (
                            <div key={a.name}>
                              <label className="label truncate">{a.name}</label>
                              <p className="text-[10px] text-amber-600 mb-1">saves Rs {Number(a.bill_drop_per_1hr).toLocaleString()}/hr</p>
                              <input type="number" min="0" max="24" step="0.5" placeholder="hrs to cut"
                                value={applyForm[rec.id]?.[a.name] || ''}
                                onChange={e => setApplyForm(p => ({ ...p, [rec.id]: { ...(p[rec.id] || {}), [a.name]: e.target.value } }))}
                                className="input text-xs py-2"
                              />
                            </div>
                          ))}
                        </div>
                        <button onClick={() => applyReductions(rec.id)} disabled={applying === rec.id}
                          className="btn-primary text-xs px-4 py-2">
                          {applying === rec.id ? 'Computing…' : 'Calculate Savings'}
                        </button>
                      </div>
                    )}

                    {(() => {
                      const r = applyResults[rec.id] ?? (rec.applied && rec.reductions?.length ? { steps: rec.reductions } : null)
                      if (!r) return null
                      const steps      = r.steps ?? []
                      const newBill    = r.final_bill ?? steps.at(-1)?.new_bill ?? steps.at(-1)?.new_bill_pkr
                      const totalSaved = r.total_pkr_saved ?? (newBill != null ? rec.predicted_bill_pkr - newBill : null)
                      return (
                        <div className="surface overflow-hidden border-emerald-100">
                          <div className="flex items-center justify-between px-5 py-4 bg-emerald-50">
                            <div>
                              <p className="text-xs text-slate-500">New projected bill</p>
                              <p className="text-xl font-bold text-emerald-700">Rs {newBill != null ? Number(newBill).toLocaleString() : '—'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">You save</p>
                              <p className="text-xl font-bold text-amber-600">Rs {totalSaved != null ? Number(totalSaved).toLocaleString() : '—'}</p>
                            </div>
                          </div>
                          {steps.length > 0 && (
                            <div className="divide-y divide-slate-50">
                              {steps.map((s, i) => (
                                <div key={i} className="flex items-center justify-between px-5 py-3 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-800">{s.appliance ?? s.appliance_name}</span>
                                    <span className="text-slate-400">−{s.hours_reduced}hr/day</span>
                                    {s.slab_crossed && (
                                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px]">slab drop</span>
                                    )}
                                  </div>
                                  <div className="flex gap-4">
                                    <span className="text-slate-400">−{s.units_saved} kWh</span>
                                    <span className="text-emerald-600 font-semibold">
                                      Rs {Number(s.money_saved_step ?? s.pkr_saved ?? 0).toLocaleString()} saved
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {recs.length === 0 && !smart && !smartLoading && (
        <div className="surface p-6">
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mb-2">
              <Star size={22} className="text-violet-400" />
            </div>
            <p className="text-slate-700 font-medium text-sm">No recommendations yet</p>
            <p className="text-slate-400 text-xs text-center">
              Click <span className="font-semibold text-violet-600">Smart + AI</span> for a full situational analysis with integrated chat.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
