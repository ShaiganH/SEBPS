import { useState, useRef, useEffect } from 'react'
import api from '../api/client'
import {
  Zap, Upload, Hash, CheckCircle, XCircle,
  ArrowRight, ScanLine, RefreshCw, Camera, ChevronRight,
} from 'lucide-react'

/* ─── Keyframes injected once ──────────────────────────────────────────────── */
const PULSE_CSS = `
@keyframes ep-bar {
  0%, 100% { transform: scaleY(0.12); opacity: 0.28; }
  50%       { transform: scaleY(1);   opacity: 0.90; }
}
@keyframes ep-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0);   }
}
`

/* ─── Rotating story text ───────────────────────────────────────────────────── */
const OCR_STORY = [
  'Reading the structure of your bill…',
  'Locating your consumer reference number…',
  'Verifying the billing period…',
  'Cross-referencing against LESCO formats…',
  'Almost there — confirming the reference…',
]

const FETCH_STORY = [
  'Connecting to the LESCO portal…',
  'Downloading your bill history…',
  'Building your home\'s energy profile…',
  'Identifying seasonal patterns…',
  'Calculating your energy fingerprint…',
  'Preparing your first forecast…',
]

/* ─── Energy pulse bar ──────────────────────────────────────────────────────── */
function EnergyPulse() {
  const N = 28
  return (
    <div className="flex items-center gap-[2.5px] h-8" aria-hidden>
      {Array.from({ length: N }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-blue-400/80"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            transform: 'scaleY(0.12)',
            animation: `ep-bar ${1.4 + (i % 3) * 0.25}s ease-in-out ${i * 55}ms infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function useElapsed(active) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) { setS(0); return }
    const t = setInterval(() => setS(p => p + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  return s
}

/* ─── Main modal ────────────────────────────────────────────────────────────── */
export default function OnboardingModal({ onComplete, rescan = false }) {
  /*
   * phase:
   *   story → image_input | manual_input
   *   image_input → ocr_wait → ocr_confirm → fetch_wait → done
   *   manual_input → fetch_wait → done
   *   any → error
   */
  const [phase,   setPhase]   = useState('story')
  const [refNo,   setRefNo]   = useState('')
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState(null)
  const [ocrJob,  setOcrJob]  = useState(null)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [doneStats, setDoneStats] = useState(null)   // { count, maxBill, avgBill }

  const pollRef = useRef(null)
  const fileRef = useRef(null)

  const isOcrWait   = phase === 'ocr_wait'
  const isFetchWait = phase === 'fetch_wait'
  const elapsed     = useElapsed(isOcrWait || isFetchWait)

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current) }
  useEffect(() => () => stopPoll(), [])

  /* ── Rotating story message ────────────────────────────────────────── */
  const storyMsg = isOcrWait
    ? OCR_STORY[Math.floor(elapsed / 5) % OCR_STORY.length]
    : isFetchWait
    ? FETCH_STORY[Math.floor(elapsed / 5) % FETCH_STORY.length]
    : ''

  /* ── Manual submit ─────────────────────────────────────────────────── */
  const submitManual = async () => {
    if (!refNo.trim()) return
    setBusy(true); setError('')
    try {
      const { data } = await api.post('/bills/fetch/', { ref_no: refNo.trim() })
      setPhase('fetch_wait')
      startFetchPoll(data.id)
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not start fetch — check the reference number.')
    } finally { setBusy(false) }
  }

  /* ── Image upload ──────────────────────────────────────────────────── */
  const onFile = e => {
    const f = e.target.files[0]; if (!f) return
    setFile(f); setPreview(URL.createObjectURL(f)); setError('')
  }

  const submitImage = async () => {
    if (!file) return
    setBusy(true); setError('')
    const fd = new FormData(); fd.append('image', file)
    try {
      const { data } = await api.post('/ocr/upload/', fd)
      setOcrJob(data); setPhase('ocr_wait')
      startOcrPoll(data.id)
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed — please try again.')
    } finally { setBusy(false) }
  }

  /* ── OCR poll ──────────────────────────────────────────────────────── */
  const startOcrPoll = (id) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/ocr/status/${id}/`)
        setOcrJob(data)
        if (data.status === 'success') {
          stopPoll(); setRefNo(data.extracted_ref_no || ''); setPhase('ocr_confirm')
        } else if (data.status === 'failed') {
          stopPoll(); setRefNo(''); setPhase('ocr_confirm')
        }
      } catch { /* keep polling on network hiccup */ }
    }, 3000)
  }

  /* ── OCR confirm ───────────────────────────────────────────────────── */
  const confirmOcr = async () => {
    if (!refNo.trim()) return
    setBusy(true); setError('')
    try {
      const { data } = await api.post(`/ocr/${ocrJob.id}/confirm/`, { ref_no: refNo.trim() })
      setPhase('fetch_wait')
      startFetchPoll(data.fetch_job_id)
    } catch (e) {
      setError(e.response?.data?.detail || 'Confirm failed.')
    } finally { setBusy(false) }
  }

  /* ── Fetch poll ────────────────────────────────────────────────────── */
  const startFetchPoll = (jobId) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/bills/fetch/${jobId}/`)
        if (data.status === 'success') {
          stopPoll()
          // Pull stats for the done screen
          try {
            const { data: bills } = await api.get('/bills/')
            const list = Array.isArray(bills) ? bills : (bills.results ?? [])
            if (list.length) {
              const amounts = list.map(b => parseFloat(b.bill_amount))
              setDoneStats({
                count:   list.length,
                maxBill: Math.max(...amounts),
                avgBill: amounts.reduce((a, b) => a + b, 0) / amounts.length,
              })
            }
          } catch { /* non-fatal */ }
          setPhase('done')
        } else if (data.status === 'failed') {
          stopPoll()
          setError('LESCO fetch failed — the reference number may be incorrect.')
          setPhase('error')
        }
      } catch { /* keep polling */ }
    }, 4000)
  }

  /* ── Reset ─────────────────────────────────────────────────────────── */
  const retry = () => {
    stopPoll()
    setPhase('story'); setRefNo(''); setFile(null)
    setPreview(null); setOcrJob(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  /* ════════════════════════════════════════════════════════════════════
     PHASE RENDERERS
     ══════════════════════════════════════════════════════════════════ */

  /* ── Story (landing) ───────────────────────────────────────────────── */
  const PhaseStory = () => (
    <div className="space-y-8">
      {/* Hero text */}
      <div className="space-y-3">
        <h2 className="text-[1.65rem] font-bold text-white leading-snug tracking-tight">
          {rescan
            ? "Let’s refresh\nyour energy story."
            : 'Your home has\na story to tell.'}
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          {rescan
            ? 'Upload a new bill and we\'ll update your history, recalibrate patterns, and rebuild your forecast.'
            : 'Every electricity bill reveals how your home uses energy. We\'ll analyze your history, identify patterns, and build your first accurate forecast.'}
        </p>
      </div>

      {/* Energy pulse — gives the screen something alive */}
      <div className="py-1">
        <EnergyPulse />
      </div>

      {/* Primary CTA */}
      <div className="space-y-3">
        <button
          onClick={() => setPhase('image_input')}
          className="w-full flex items-center justify-between px-5 py-4 bg-white text-slate-900 font-semibold rounded-2xl hover:bg-slate-100 transition-colors text-sm"
        >
          <span className="flex items-center gap-3">
            <Camera size={17} className="text-blue-600 flex-shrink-0" />
            Scan my latest bill
          </span>
          <ArrowRight size={16} className="text-slate-400" />
        </button>

        {/* Secondary — text link style */}
        <button
          onClick={() => setPhase('manual_input')}
          className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-white text-sm transition-colors py-1"
        >
          I already know my reference number
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )

  /* ── Manual input ──────────────────────────────────────────────────── */
  const PhaseManualInput = () => (
    <div className="space-y-5">
      <button onClick={() => setPhase('story')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
        ← Back
      </button>

      <div>
        <h3 className="text-lg font-bold text-white mb-1">Enter your reference number</h3>
        <p className="text-slate-500 text-sm">
          Found at the top of your LESCO bill — 14 characters, last one is a letter.
        </p>
      </div>

      <div>
        <div className="relative">
          <Hash size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={refNo}
            onChange={e => setRefNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitManual()}
            placeholder="e.g.  08 11274 1172000U"
            autoFocus
            className="w-full bg-white/8 border border-white/12 rounded-xl px-4 py-3 pl-10
                       text-white text-sm font-mono tracking-wider placeholder-slate-600
                       focus:outline-none focus:border-white/25 focus:ring-0 transition-colors"
          />
        </div>
        <p className="text-[11px] text-slate-600 mt-1.5 pl-1">
          Example: <span className="font-mono text-slate-500">08 11274 1172000U</span>
        </p>
      </div>

      {error && <DarkErrorBanner msg={error} />}

      <button
        onClick={submitManual}
        disabled={busy || !refNo.trim()}
        className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-semibold
                   rounded-xl px-4 py-3 text-sm transition-colors
                   hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <><MiniSpinner /> Submitting…</> : <>Fetch my bills <ArrowRight size={15} /></>}
      </button>
    </div>
  )

  /* ── Image input ───────────────────────────────────────────────────── */
  const PhaseImageInput = () => (
    <div className="space-y-5">
      <button onClick={() => setPhase('story')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
        ← Back
      </button>

      <div>
        <h3 className="text-lg font-bold text-white mb-1">Upload your bill</h3>
        <p className="text-slate-500 text-sm">
          A clear photo or scan — we'll extract your reference number automatically.
        </p>
      </div>

      <label
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer
                    transition-all overflow-hidden
                    ${file
                      ? 'border-blue-500/40 bg-blue-500/5'
                      : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                    }`}
        style={{ minHeight: preview ? 'auto' : 160 }}
      >
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        {preview
          ? <img src={preview} alt="bill preview" className="w-full rounded-2xl object-contain max-h-52" />
          : (
            <div className="flex flex-col items-center py-10 px-4 text-center">
              <div className="w-12 h-12 bg-white/6 rounded-2xl flex items-center justify-center mb-3">
                <Upload size={20} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-300">Tap to upload</p>
              <p className="text-xs text-slate-600 mt-1">JPEG or PNG · max 10 MB</p>
            </div>
          )
        }
      </label>

      {file && (
        <p className="text-[11px] text-slate-600 text-center">
          {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
        </p>
      )}

      {error && <DarkErrorBanner msg={error} />}

      {file && (
        <button
          onClick={submitImage}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-semibold
                     rounded-xl px-4 py-3 text-sm transition-colors
                     hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <><MiniSpinner dark /> Uploading…</> : <><ScanLine size={15} /> Scan this bill</>}
        </button>
      )}
    </div>
  )

  /* ── OCR wait ──────────────────────────────────────────────────────── */
  const PhaseOcrWait = () => {
    // Simulated discovered fields that "appear" over time
    const found = [
      { label: 'Billing period',   done: elapsed > 8  },
      { label: 'Customer profile', done: elapsed > 18 },
      { label: 'Reference number', done: ocrJob?.status === 'success' },
    ]
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white">Reading your bill</h3>
          <p className="text-slate-500 text-sm mt-0.5 transition-all duration-700">{storyMsg}</p>
        </div>

        <EnergyPulse />

        {/* Discovered fields */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Discovered so far</p>
          {found.map(({ label, done }) => (
            <div key={label}
              className={`flex items-center gap-2.5 text-sm transition-all duration-500 ${done ? 'text-slate-300' : 'text-slate-600'}`}
            >
              {done
                ? <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center flex-shrink-0">
                    <div className="w-1 h-1 rounded-full bg-slate-600" />
                  </div>
                )
              }
              {label}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-white/8" />

        {/* Tip */}
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="text-slate-500 font-medium">Did you know?</span>{' '}
          Homes with usage patterns similar to yours often save 8–15% after their first month of active monitoring.
        </p>

        <p className="text-[11px] text-slate-700 text-center">
          OCR can take 1–3 minutes for complex bill images. Keep this window open.
        </p>
      </div>
    )
  }

  /* ── OCR confirm ───────────────────────────────────────────────────── */
  const PhaseOcrConfirm = () => (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">
          {ocrJob?.extracted_ref_no ? 'We found your reference number' : 'Couldn\'t read it automatically'}
        </h3>
        <p className="text-slate-500 text-sm">
          {ocrJob?.extracted_ref_no
            ? 'Confirm or correct the number below before we fetch your history.'
            : 'Enter your reference number manually — it\'s printed at the top of your LESCO bill.'}
        </p>
      </div>

      {ocrJob?.extracted_ref_no && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Extracted by OCR</p>
          <p className="font-mono text-xl font-bold text-white tracking-wider">{ocrJob.extracted_ref_no}</p>
          {ocrJob.confidence && (
            <p className="text-xs text-emerald-500 mt-1.5">
              {(ocrJob.confidence * 100).toFixed(0)}% confidence
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          {ocrJob?.extracted_ref_no ? 'Correct if needed' : 'Reference number'}
        </label>
        <input
          type="text"
          value={refNo}
          onChange={e => setRefNo(e.target.value)}
          placeholder={ocrJob?.extracted_ref_no || '08 11274 1172000U'}
          autoFocus
          className="w-full bg-white/8 border border-white/12 rounded-xl px-4 py-3
                     text-white text-sm font-mono tracking-wider placeholder-slate-600
                     focus:outline-none focus:border-white/25 transition-colors"
        />
      </div>

      {error && <DarkErrorBanner msg={error} />}

      <button
        onClick={confirmOcr}
        disabled={busy || !refNo.trim()}
        className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-semibold
                   rounded-xl px-4 py-3 text-sm transition-colors
                   hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <><MiniSpinner dark /> Confirming…</> : <>Confirm &amp; fetch bills <ArrowRight size={15} /></>}
      </button>
    </div>
  )

  /* ── Fetch wait ────────────────────────────────────────────────────── */
  const PhaseFetchWait = () => {
    const discoveries = [
      { t: 12, text: 'Your consumption shows a clear seasonal pattern.' },
      { t: 28, text: 'Your highest bills appear during peak summer months.' },
      { t: 50, text: 'Forecast confidence is building rapidly.' },
    ].filter(d => elapsed >= d.t)

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white">Building your energy profile</h3>
          <p className="text-slate-500 text-sm mt-0.5 transition-all duration-700">{storyMsg}</p>
        </div>

        <EnergyPulse />

        {/* Progressive discoveries */}
        {discoveries.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Discovered</p>
            {discoveries.map(({ t, text }) => (
              <div
                key={t}
                className="flex items-start gap-2.5 text-sm text-slate-300"
                style={{ animation: 'ep-fade-in 0.5s ease-out both' }}
              >
                <span className="text-blue-400 flex-shrink-0 mt-0.5">◆</span>
                {text}
              </div>
            ))}
          </div>
        )}

        {/* Steps */}
        <div className="space-y-2">
          {[
            { label: 'Querying LESCO portal',      done: elapsed > 6  },
            { label: 'Downloading 12 months data', done: elapsed > 22 },
            { label: 'Saving to your account',     done: elapsed > 50 },
            { label: 'Building energy profile',    done: false        },
          ].map(({ label, done }) => (
            <div key={label} className="flex items-center gap-2.5 text-xs">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500 ${
                done ? 'bg-emerald-500/20' : 'bg-white/6'
              }`}>
                {done
                  ? <CheckCircle size={9} className="text-emerald-400" />
                  : <div className="w-1 h-1 rounded-full bg-slate-700" />
                }
              </div>
              <span className={done ? 'text-slate-400' : 'text-slate-700'}>{label}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-700 text-center">
          This takes about 1–2 minutes. Do not close this window.
        </p>
      </div>
    )
  }

  /* ── Done ──────────────────────────────────────────────────────────── */
  const PhaseDone = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-500/15 rounded-xl flex items-center justify-center">
          <CheckCircle size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="font-bold text-white text-base">
            {rescan ? 'Bills updated.' : 'Energy profile created.'}
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            {rescan ? 'Your history has been refreshed.' : `We analysed ${doneStats?.count ?? 'your'} months of history.`}
          </p>
        </div>
      </div>

      {/* Stats — only meaningful after initial onboarding */}
      {!rescan && doneStats && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Months analysed', value: `${doneStats.count}` },
            { label: 'Highest bill',    value: `Rs ${Math.round(doneStats.maxBill).toLocaleString()}` },
            { label: 'Monthly average', value: `Rs ${Math.round(doneStats.avgBill).toLocaleString()}` },
            { label: 'Forecast ready',  value: 'Yes' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3.5">
              <p className="text-[10px] text-slate-600 uppercase tracking-wide">{label}</p>
              <p className="font-bold text-white text-base mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-white/8" />

      {!rescan && (
        <p className="text-slate-500 text-sm">
          See what your next bill is likely to be — your first forecast is waiting.
        </p>
      )}

      <button
        onClick={onComplete}
        className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-semibold
                   rounded-xl px-4 py-3.5 text-sm transition-colors hover:bg-slate-100"
      >
        {rescan ? 'Done' : 'See my dashboard'}
        <ArrowRight size={15} />
      </button>
    </div>
  )

  /* ── Error ─────────────────────────────────────────────────────────── */
  const PhaseError = () => (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
        <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-300">Something went wrong</p>
          <p className="text-xs text-red-400/80 mt-1 leading-relaxed">{error}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={retry}
          className="flex-1 flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12
                     border border-white/10 text-slate-300 font-medium rounded-xl px-4 py-3 text-sm transition-colors"
        >
          <RefreshCw size={13} /> Try again
        </button>
        <button
          onClick={() => { setError(''); setPhase('manual_input') }}
          className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-900
                     font-semibold rounded-xl px-4 py-3 text-sm transition-colors hover:bg-slate-100"
        >
          <Hash size={13} /> Enter manually
        </button>
      </div>
    </div>
  )

  const phaseMap = {
    story:        <PhaseStory />,
    manual_input: <PhaseManualInput />,
    image_input:  <PhaseImageInput />,
    ocr_wait:     <PhaseOcrWait />,
    ocr_confirm:  <PhaseOcrConfirm />,
    fetch_wait:   <PhaseFetchWait />,
    done:         <PhaseDone />,
    error:        <PhaseError />,
  }

  /* ══════════════════════════════════════════════════════════════════════
     ROOT — dark, immersive shell, no header/body split
     ════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{PULSE_CSS}</style>

      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: '#0C1222' }}
        >
          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-6 pt-6 pb-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Zap size={12} className="text-blue-400" />
              </div>
              <span className="text-[11px] font-semibold text-slate-600 tracking-wide uppercase">SEBPS</span>
            </div>
            {/* Phase label — minimal breadcrumb */}
            <span className="text-[10px] text-slate-700 font-medium tracking-wide">
              {phase === 'story'        ? 'Discover'
               : phase === 'manual_input' || phase === 'image_input' ? 'Reference'
               : phase === 'ocr_wait' || phase === 'ocr_confirm'     ? 'Analyse'
               : phase === 'fetch_wait' ? 'Building'
               : phase === 'done'       ? 'Ready'
               : ''}
            </span>
          </div>

          {/* ── Content ── */}
          <div className="px-6 py-6">
            {phaseMap[phase] ?? phaseMap.story}
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Small shared components ───────────────────────────────────────────────── */
function MiniSpinner({ dark }) {
  return (
    <div className={`w-3.5 h-3.5 border-2 rounded-full animate-spin flex-shrink-0 ${
      dark
        ? 'border-slate-400/40 border-t-slate-700'
        : 'border-white/30 border-t-white'
    }`} />
  )
}

function DarkErrorBanner({ msg }) {
  return (
    <div className="flex items-start gap-2 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
      <XCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-red-400/90 leading-relaxed">{msg}</p>
    </div>
  )
}
