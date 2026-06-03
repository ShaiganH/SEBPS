/**
 * Lightweight toast system — no external dependencies.
 * Usage (anywhere in the app):
 *   import { toast } from '../lib/toast'
 *   toast.success('Saved!')
 *   toast.error('Something went wrong')
 *   toast.warning('Budget exceeded', { duration: 8000 })
 *
 * Mount <ToastContainer /> once in App.jsx.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

/* ── Internal event bus ───────────────────────────────────────────────────── */
const listeners = new Set()

function emit(type, message, duration = 4500) {
  const id = `${Date.now()}-${Math.random()}`
  listeners.forEach(fn => fn({ id, type, message, duration }))
}

/* ── Public API (import { toast } from '@/lib/toast') ─────────────────────── */
export const toast = {
  success: (msg, opts) => emit('success', msg, opts?.duration),
  error:   (msg, opts) => emit('error',   msg, opts?.duration ?? 6000),
  warning: (msg, opts) => emit('warning', msg, opts?.duration ?? 7000),
  info:    (msg, opts) => emit('info',    msg, opts?.duration),
}

/* ── Config ───────────────────────────────────────────────────────────────── */
const META = {
  success: {
    icon:    CheckCircle,
    iconCls: 'text-emerald-500',
    bar:     'bg-emerald-500',
  },
  error: {
    icon:    XCircle,
    iconCls: 'text-red-500',
    bar:     'bg-red-500',
  },
  warning: {
    icon:    AlertTriangle,
    iconCls: 'text-amber-500',
    bar:     'bg-amber-400',
  },
  info: {
    icon:    Info,
    iconCls: 'text-blue-500',
    bar:     'bg-blue-500',
  },
}

/* ── Single toast item ────────────────────────────────────────────────────── */
function ToastItem({ id, type, message, duration, onRemove }) {
  const [visible, setVisible] = useState(false)    // drives enter animation
  const [leaving, setLeaving] = useState(false)    // drives exit animation

  const dismiss = useCallback(() => {
    setLeaving(true)
    setTimeout(() => onRemove(id), 280)
  }, [id, onRemove])

  // Enter
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(dismiss, duration)
    return () => clearTimeout(t)
  }, [dismiss, duration])

  const { icon: Icon, iconCls, bar } = META[type] ?? META.info

  return (
    <div
      className={`
        relative flex items-start gap-3 w-full
        bg-white border border-slate-200 rounded-2xl shadow-lg
        px-4 py-3.5 overflow-hidden
        transition-all duration-300 ease-out
        ${visible && !leaving
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 -translate-y-2 scale-95'
        }
      `}
    >
      {/* Coloured top stripe */}
      <div className={`absolute top-0 left-0 right-0 h-[2.5px] ${bar}`} />

      <Icon size={16} className={`flex-shrink-0 mt-0.5 ${iconCls}`} />

      <p className="flex-1 text-[13px] text-slate-800 leading-snug font-medium pr-1">
        {message}
      </p>

      <button
        onClick={dismiss}
        className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors -mr-1 -mt-0.5 p-0.5 rounded"
      >
        <X size={13} />
      </button>
    </div>
  )
}

/* ── Container — mount once in App.jsx ───────────────────────────────────── */
export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handler = (t) => setToasts(prev => [...prev.slice(-4), t])  // max 5 visible
    listeners.add(handler)
    return () => listeners.delete(handler)
  }, [])

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed top-4 inset-x-0 z-[200] flex flex-col gap-2 items-center pointer-events-none px-4">
      <div className="w-full max-w-sm flex flex-col gap-2 pointer-events-auto">
        {toasts.map(t => (
          <ToastItem key={t.id} {...t} onRemove={remove} />
        ))}
      </div>
    </div>
  )
}
