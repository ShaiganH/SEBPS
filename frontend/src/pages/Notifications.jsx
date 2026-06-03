import { useState, useEffect } from 'react'
import { toast } from '../lib/toast'
import api from '../api/client'
import { BellOff, Check, CheckCheck, Trash2 } from 'lucide-react'

const TYPE_META = {
  budget_alert:     { dot: 'bg-red-500',     label: 'Budget Alert',    text: 'text-red-600',    bg: 'bg-red-50 border-red-100'       },
  fetch_complete:   { dot: 'bg-blue-500',    label: 'Fetch Complete',  text: 'text-blue-600',   bg: 'bg-blue-50 border-blue-100'     },
  ocr_complete:     { dot: 'bg-violet-500',  label: 'OCR Complete',    text: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
  prediction_ready: { dot: 'bg-emerald-500', label: 'Prediction',      text: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-100'},
  cycle_summary:    { dot: 'bg-amber-500',   label: 'Cycle Summary',   text: 'text-amber-600',  bg: 'bg-amber-50 border-amber-100'   },
  system:           { dot: 'bg-slate-400',   label: 'System',          text: 'text-slate-600',  bg: 'bg-slate-50 border-slate-100'   },
}
const DEFAULT_META = TYPE_META.system

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('all')
  const [deleting, setDeleting]           = useState(null)
  const [markingAll, setMarkingAll]       = useState(false)

  const load = () =>
    api.get('/notifications/' + (filter === 'unread' ? '?unread=true' : ''))
      .then(r => setNotifications(r.data?.results ?? r.data ?? []))
      .finally(() => setLoading(false))

  useEffect(() => { setLoading(true); load() }, [filter])

  const markRead = async id => {
    await api.put(`/notifications/${id}/read/`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    toast.success('Marked as read')
  }

  const markAll = async () => {
    setMarkingAll(true)
    try {
      await api.post('/notifications/read-all/')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      toast.success('All notifications marked as read')
    } catch {
      toast.error('Could not mark all as read')
    } finally { setMarkingAll(false) }
  }

  const deleteNotif = async id => {
    setDeleting(id)
    try {
      await api.delete(`/notifications/${id}/`)
      setNotifications(prev => prev.filter(n => n.id !== id))
      toast.success('Notification deleted')
    } catch {
      toast.error('Could not delete notification')
    } finally { setDeleting(null) }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-1">Stay on top of your energy usage</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter pills */}
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-0.5">
            {[['all', 'All'], ['unread', 'Unread']].map(([val, lbl]) => (
              <button
                key={val} onClick={() => setFilter(val)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === val ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAll} disabled={markingAll}
              className="btn-secondary flex items-center gap-1.5 px-3.5 py-2 text-xs"
            >
              <CheckCheck size={13} />
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="surface p-6">
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-1">
              <BellOff size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-700 font-medium">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-slate-400 text-sm">You're all caught up!</p>
          </div>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="divide-y divide-slate-50">
            {notifications.map(n => {
              const meta = TYPE_META[n.notification_type] ?? DEFAULT_META
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 px-6 py-4 transition-colors ${
                    n.is_read ? 'opacity-60' : 'hover:bg-slate-50/50'
                  }`}
                >
                  {/* Status dot */}
                  <div className="flex-shrink-0 pt-1">
                    <span className={`block w-2 h-2 rounded-full ${n.is_read ? 'bg-slate-300' : meta.dot}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${n.is_read ? 'text-slate-500' : 'text-slate-900'}`}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                            {n.message}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                        {new Date(n.created_at).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        n.is_read ? 'bg-slate-50 border-slate-100 text-slate-400' : `${meta.bg} ${meta.text}`
                      }`}>
                        {meta.label}
                      </span>
                      {!n.is_read && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          <Check size={11} /> Mark read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deleteNotif(n.id)} disabled={deleting === n.id}
                    className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
