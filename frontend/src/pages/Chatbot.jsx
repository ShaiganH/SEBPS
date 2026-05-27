import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import { MessageSquare, Send, Plus, Trash2, Sparkles, Bot, User } from 'lucide-react'

export default function Chatbot() {
  const [sessions,        setSessions]        = useState([])
  const [activeSession,   setActiveSession]   = useState(null)
  const [messages,        setMessages]        = useState([])
  const [input,           setInput]           = useState('')
  const [starters,        setStarters]        = useState([])
  const [sending,         setSending]         = useState(false)
  const [loading,         setLoading]         = useState(true)
  const [loadingSession,  setLoadingSession]  = useState(false)
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  const loadSessions = () =>
    api.get('/chatbot/sessions/').then(r => setSessions(r.data?.results ?? r.data ?? []))

  useEffect(() => {
    Promise.all([
      loadSessions(),
      api.get('/chatbot/starters/').then(r => setStarters(r.data ?? [])),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const openSession = async id => {
    setLoadingSession(true)
    try {
      const { data } = await api.get(`/chatbot/sessions/${id}/`)
      setActiveSession(id); setMessages(data.messages ?? [])
    } catch { setMessages([]) }
    finally { setLoadingSession(false) }
  }

  const newSession = () => { setActiveSession(null); setMessages([]) }

  const deleteSession = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Archive this session?')) return
    await api.delete(`/chatbot/sessions/${id}/`)
    loadSessions()
    if (activeSession === id) newSession()
  }

  const sendMessage = async (text = input.trim()) => {
    if (!text || sending) return
    setInput(''); setSending(true)
    setMessages(prev => [...prev, { role: 'user', content: text }])
    try {
      const payload = { message: text, stream: false }
      if (activeSession) payload.session_id = activeSession
      const { data } = await api.post('/chatbot/message/', payload)
      setMessages(prev => [...prev, { role: 'assistant', content: data.response ?? data.message ?? '' }])
      if (data.session_id && !activeSession) { setActiveSession(data.session_id); loadSessions() }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠ Error: ' + (err.response?.data?.detail || 'Failed to get response') }])
    } finally { setSending(false) }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* ── Session sidebar ──────────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 flex flex-col gap-2">
        <button onClick={newSession} className="btn-primary flex items-center gap-2 w-full justify-center py-2.5">
          <Plus size={14} /> New Chat
        </button>
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-slate-400 text-center mt-6">No conversations yet</p>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer text-xs transition-all ${
                activeSession === s.id
                  ? 'bg-blue-50 border border-blue-200 text-blue-700 font-medium'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="truncate flex-1">{s.title || `Session #${s.id}`}</span>
              <button
                onClick={e => deleteSession(e, s.id)}
                className="ml-1.5 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col surface overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100">
          <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
            <MessageSquare size={14} className="text-violet-600" />
          </div>
          <span className="text-sm font-semibold text-slate-900">
            {activeSession ? `Conversation #${activeSession}` : 'New Conversation'}
          </span>
          {sending && (
            <span className="ml-auto text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              Thinking…
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loadingSession && (
            <div className="flex justify-center pt-8">
              <div className="w-6 h-6 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}

          {messages.length === 0 && !loadingSession && (
            <div className="flex flex-col items-center justify-center h-full gap-5">
              <div className="w-16 h-16 bg-violet-50 border border-violet-100 rounded-2xl flex items-center justify-center">
                <Sparkles size={28} className="text-violet-500" />
              </div>
              <div className="text-center">
                <p className="text-slate-700 font-medium text-sm">SEBPS AI Assistant</p>
                <p className="text-slate-400 text-xs mt-1">Ask anything about your electricity usage, bills, or appliances.</p>
              </div>
              {starters.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {starters.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s.text ?? s)}
                      className="text-left px-3.5 py-3 bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 rounded-xl text-xs text-slate-600 hover:text-blue-700 transition-all"
                    >
                      {s.text ?? s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                m.role === 'user' ? 'bg-blue-600' : 'bg-violet-100 border border-violet-200'
              }`}>
                {m.role === 'user'
                  ? <User size={13} className="text-white" />
                  : <Bot size={13} className="text-violet-600" />
                }
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}

          {sending && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center flex-shrink-0">
                <Bot size={13} className="text-violet-600" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center shadow-sm">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              className="flex-1 input resize-none leading-relaxed"
              style={{ maxHeight: 120, overflowY: 'auto' }}
            />
            <button
              onClick={() => sendMessage()} disabled={!input.trim() || sending}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-white transition-colors flex items-center justify-center flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
