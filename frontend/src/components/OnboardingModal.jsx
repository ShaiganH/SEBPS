import { useState, useRef, useEffect } from 'react'
import { toast } from '../lib/toast'
import api from '../api/client'
import {
  Zap, Upload, Hash, CheckCircle, XCircle,
  ArrowRight, ScanLine, RefreshCw, Camera, ChevronRight,
} from 'lucide-react'
import logo from "../../public/Logo-Hollow-BW-StrongerEdges.svg"

/* ── Keyframes ──────────────────────────────────────────────────────────────── */
const PULSE_CSS = `
@keyframes ep-bar {
  0%, 100% { transform: scaleY(0.15); opacity: 0.25; }
  50%       { transform: scaleY(1);   opacity: 0.70; }
}
@keyframes ep-fade-in {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0);   }
}
`

/* ── Rotating story text ────────────────────────────────────────────────────── */
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
  "Building your home's energy profile…",
  'Identifying seasonal patterns…',
  'Calculating your energy fingerprint…',
  'Preparing your first forecast…',
]

/* ── Energy pulse bar (light-mode colours) ──────────────────────────────────── */
function EnergyPulse() {
  const N = 24
  return (
    <div className="flex items-center gap-[2.5px] h-7" aria-hidden>
      {Array.from({ length: N }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-blue-500"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            animation: `ep-bar ${1.3 + (i % 3) * 0.25}s ease-in-out ${i * 55}ms infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ── Hooks ──────────────────────────────────────────────────────────────────── */
function useElapsed(active) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) { setS(0); return }
    const t = setInterval(() => setS(p => p + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  return s
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function OnboardingModal({ onComplete, rescan = false }) {
  const [phase,     setPhase]     = useState('story')
  const [refNo,     setRefNo]     = useState('')
  const [file,      setFile]      = useState(null)
  const [preview,   setPreview]   = useState(null)
  const [ocrJob,    setOcrJob]    = useState(null)
  const [error,     setError]     = useState('')
  const [busy,      setBusy]      = useState(false)
  const [doneStats, setDoneStats] = useState(null)

  const pollRef = useRef(null)
  const fileRef = useRef(null)

  const isOcrWait   = phase === 'ocr_wait'
  const isFetchWait = phase === 'fetch_wait'
  const elapsed     = useElapsed(isOcrWait || isFetchWait)
  const storyMsg    = isOcrWait
    ? OCR_STORY[Math.floor(elapsed / 5) % OCR_STORY.length]
    : isFetchWait
    ? FETCH_STORY[Math.floor(elapsed / 5) % FETCH_STORY.length]
    : ''

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current) }
  useEffect(() => () => stopPoll(), [])

  /* ── Manual submit ─────────────────────────────────────────────────────── */
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

  /* ── Image upload ──────────────────────────────────────────────────────── */
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

  /* ── OCR poll ──────────────────────────────────────────────────────────── */
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
      } catch { /* keep polling */ }
    }, 3000)
  }

  /* ── OCR confirm ───────────────────────────────────────────────────────── */
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

  /* ── Fetch poll ────────────────────────────────────────────────────────── */
  const startFetchPoll = (jobId) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/bills/fetch/${jobId}/`)
        if (data.status === 'success') {
          stopPoll()
          try {
            const { data: bills } = await api.get('/bills/')
            const list    = Array.isArray(bills) ? bills : (bills.results ?? [])
            const amounts = list.map(b => parseFloat(b.bill_amount))
            if (amounts.length) {
              setDoneStats({
                count:   list.length,
                maxBill: Math.max(...amounts),
                avgBill: amounts.reduce((a, b) => a + b, 0) / amounts.length,
              })
            }
          } catch { /* non-fatal */ }
          setPhase('done')
          if (rescan) toast.success('Bill history refreshed successfully')
        } else if (data.status === 'failed') {
          stopPoll()
          setError('LESCO fetch failed — the reference number may be incorrect.')
          setPhase('error')
          toast.error('LESCO fetch failed')
        }
      } catch { /* keep polling */ }
    }, 4000)
  }

  /* ── Reset ─────────────────────────────────────────────────────────────── */
  const retry = () => {
    stopPoll()
    setPhase('story'); setRefNo(''); setFile(null)
    setPreview(null); setOcrJob(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PHASE RENDERERS
     ════════════════════════════════════════════════════════════════════════ */

  const PhaseStory = () => (
    <div className="space-y-7">
      <div className="space-y-2.5">
        <p className="text-2xl font-bold text-slate-900 leading-snug tracking-tight">
          {rescan ? "Let's refresh your\nenergy story." : 'Your home has\na story to tell.'}
        </p>
        <p className="text-slate-500 text-sm leading-relaxed">
          {rescan
            ? "Upload a new bill and we'll update your history, recalibrate patterns, and rebuild your forecast."
            : "Every electricity bill reveals how your home uses energy. We'll analyse your history, identify patterns, and build your first accurate forecast."}
        </p>
      </div>

      <img className='w-full h-auto' src={logo} alt="Logo" />

      <div className="space-y-2.5">
        <button
          onClick={() => setPhase('image_input')}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-white text-black hover:bg-black hover:text-white
                    border border-slate-200 font-semibold rounded-xl transition-colors text-sm"
        >
          <span className="flex items-center gap-2.5">
            <Camera size={16} className="flex-shrink-0" />
            Scan my latest bill
          </span>
          <ArrowRight size={15} />
        </button>

        <button
          onClick={() => setPhase('manual_input')}
          className="w-full flex items-center justify-center gap-1 text-slate-500 hover:text-slate-700
                     text-sm py-1 transition-colors"
        >
          I already know my reference number
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )

  const PhaseManualInput = () => (
    <div className="space-y-5">
      <BackBtn onClick={() => setPhase('story')} />
      <div>
        <p className="font-semibold text-slate-900 mb-1">Enter your reference number</p>
        <p className="text-slate-500 text-sm">
          Found at the top of your LESCO bill — 14 characters, last one is a letter.
        </p>
      </div>
      <div>
        <div className="relative">
          <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text" value={refNo}
            onChange={e => setRefNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitManual()}
            placeholder="e.g. 08 11274 1172000U"
            autoFocus
            className="input pl-10 font-mono tracking-wider"
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 pl-1">
          Example: <span className="font-mono">08 11274 1172000U</span>
        </p>
      </div>
      {error && <ErrorBanner msg={error} />}
      <button
        onClick={submitManual} disabled={busy || !refNo.trim()}
        className="bg-white text-black border border-slate-200 hover:bg-black hover:text-white rounded-md transition hover:border-black w-full mt-2 py-2"
      >
        {busy ? <><MiniSpinner /> Submitting…</> : <>Fetch my bills </>}
      </button>
    </div>
  )

  const PhaseImageInput = () => (
    <div className="space-y-5">
      <BackBtn onClick={() => setPhase('story')} />
      <div>
        <p className="font-semibold text-slate-900 mb-1">Upload your bill</p>
        <p className="text-slate-500 text-sm">
          A clear photo or scan — we'll extract your reference number automatically.
        </p>
      </div>
      <label
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed
                    cursor-pointer transition-all overflow-hidden
                    ${file
                      ? 'border-blue-400 bg-blue-50/50'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'}`}
        style={{ minHeight: preview ? 'auto' : 150 }}
      >
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        {preview
          ? <img src={preview} alt="bill preview" className="w-full rounded-2xl object-contain max-h-48" />
          : (
            <div className="flex flex-col items-center py-10 px-4 text-center">
              <div className="w-11 h-11 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
                <Upload size={19} className="text-blue-500" />
              </div>
              <p className="text-sm font-medium text-slate-700">Tap to upload</p>
              <p className="text-xs text-slate-400 mt-1">JPEG or PNG · max 10 MB</p>
            </div>
          )}
      </label>
      {file && <p className="text-[11px] text-slate-400 text-center">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      {error && <ErrorBanner msg={error} />}
      {file && (
        <button
          onClick={submitImage} disabled={busy}
          className="bg-white text-black border border-slate-200 hover:bg-black hover:text-white rounded-md transition hover:border-black w-full mt-2 py-3"
        >
          {busy ? <><MiniSpinner /></> : <>Begin scan</>}
        </button>
      )}
    </div>
  )

  const PhaseOcrWait = () => {
    const found = [
      { label: 'Billing period',   done: elapsed > 8  },
      { label: 'Customer profile', done: elapsed > 18 },
      { label: 'Reference number', done: ocrJob?.status === 'success' },
    ]
    return (
      <div className="space-y-5">
        <div>
          <p className="font-semibold text-slate-900">Reading your bill</p>
          <p className="text-slate-500 text-sm mt-0.5 transition-all duration-700">{storyMsg}</p>
        </div>
        <EnergyPulse />
        <div className="space-y-2 pt-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Discovered so far</p>
          {found.map(({ label, done }) => (
            <div key={label} className={`flex items-center gap-2.5 text-sm transition-all duration-500 ${done ? 'text-slate-800' : 'text-slate-400'}`}>
              {done
                ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 flex-shrink-0" />}
              {label}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-medium text-slate-500">Did you know?</span>{' '}
            Homes with similar usage patterns often save 8–15% after their first month of active monitoring.
          </p>
        </div>
        <p className="text-[11px] text-slate-400 text-center">
          OCR can take 1–3 minutes for complex bill images. Keep this window open.
        </p>
      </div>
    )
  }

  const PhaseOcrConfirm = () => (
    <div className="space-y-5">
      <div>
        <p className="font-semibold text-slate-900 mb-1">
          {ocrJob?.extracted_ref_no ? 'We found your reference number' : "Couldn't read it automatically"}
        </p>
        <p className="text-slate-500 text-sm">
          {ocrJob?.extracted_ref_no
            ? 'Confirm or correct it below before we fetch your history.'
            : "Enter your reference number manually — it's printed at the top of your bill."}
        </p>
      </div>
      {ocrJob?.extracted_ref_no && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">Extracted by OCR</p>
          <p className="font-mono text-lg font-bold text-slate-900 tracking-wider">{ocrJob.extracted_ref_no}</p>
          
        </div>
      )}
      <div>
        <label className="label">{ocrJob?.extracted_ref_no ? 'Correct if needed' : 'Reference number'}</label>
        <input
          type="text" value={refNo}
          onChange={e => setRefNo(e.target.value)}
          placeholder={ocrJob?.extracted_ref_no || '08 11274 1172000U'}
          autoFocus
          className="input font-mono tracking-wider"
        />
      </div>
      {error && <ErrorBanner msg={error} />}
      <button
        onClick={confirmOcr} disabled={busy || !refNo.trim()}
        className="bg-white text-black border border-slate-200 hover:bg-black hover:text-white rounded-md transition hover:border-black w-full mt-2 py-2"
      >
        {busy ? <><MiniSpinner /></> : <>Confirm &amp; fetch my bills</>}
      </button>
    </div>
  )

  const PhaseFetchWait = () => {
    const discoveries = [
      { t: 12, text: 'Your consumption shows a clear seasonal pattern.' },
      { t: 28, text: 'Your highest bills appear during peak summer months.' },
      { t: 50, text: 'Forecast confidence is building rapidly.' },
    ].filter(d => elapsed >= d.t)

    return (
      <div className="space-y-5">
        <div>
          <p className="font-semibold text-slate-900">Building your energy profile</p>
          <p className="text-slate-500 text-sm mt-0.5 transition-all duration-700">{storyMsg}</p>
        </div>
        <EnergyPulse />
        {discoveries.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Discoveries</p>
            {discoveries.map(({ t, text }) => (
              <div
                key={t}
                className="flex items-start gap-2 text-sm text-slate-700"
                style={{ animation: 'ep-fade-in 0.4s ease-out both' }}
              >
                <span className="text-blue-500 mt-0.5 flex-shrink-0">◆</span>
                {text}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 pt-1">
          {[
            { label: 'Querying LESCO portal',      done: elapsed > 6  },
            { label: 'Downloading 12 months data', done: elapsed > 22 },
            { label: 'Saving to your account',     done: elapsed > 50 },
            { label: 'Building energy profile',    done: false        },
          ].map(({ label, done }) => (
            <div key={label} className="flex items-center gap-2.5 text-xs">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500 ${done ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                {done
                  ? <CheckCircle size={9} className="text-emerald-600" />
                  : <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
              </div>
              <span className={done ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 text-center">
          This takes about 1–2 minutes. Do not close this window.
        </p>
      </div>
    )
  }

  const PhaseDone = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle size={20} className="text-emerald-600" />
        </div>
        <div>
          <p className="font-bold text-slate-900">{rescan ? 'Bills updated.' : 'Energy profile created.'}</p>
          <p className="text-slate-500 text-xs mt-0.5">
            {rescan ? 'Your history has been refreshed.' : `We analysed ${doneStats?.count ?? 'your'} months of history.`}
          </p>
        </div>
      </div>

      {!rescan && doneStats && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Months analysed', value: `${doneStats.count}`                                    },
            { label: 'Highest bill',    value: `Rs ${Math.round(doneStats.maxBill).toLocaleString()}` },
            { label: 'Monthly average', value: `Rs ${Math.round(doneStats.avgBill).toLocaleString()}` },
            { label: 'Forecast ready',  value: 'Yes ✓'                                                },
          ].map(({ label, value }) => (
            <div key={label} className="surface p-3.5">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {!rescan && (
        <p className="text-slate-500 text-sm">
          See what your next bill is likely to be — your first forecast is waiting.
        </p>
      )}

      <button
        onClick={onComplete}
        className="bg-white text-black border border-slate-200 hover:bg-black hover:text-white rounded-md transition hover:border-black w-full mt-2 py-2"
      >
        {rescan ? 'Done' : 'Begin savings'}
      </button>
    </div>
  )

  const PhaseError = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-xl">
        <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Something went wrong</p>
          <p className="text-xs text-red-600 mt-1 leading-relaxed">{error}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={retry}
          className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-sm"
        >
          <RefreshCw size={13} /> Try again
        </button>
        <button
          onClick={() => { setError(''); setPhase('manual_input') }}
          className="flex-1 btn-primary flex items-center justify-center gap-1.5 text-sm"
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

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER — white card, matches app design system
     ════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{PULSE_CSS}</style>
      <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl border border-slate-100 overflow-hidden">

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                <Zap size={12} className="text-white" />
              </div>
              <span className="text-xs font-bold text-slate-900">SEBPS</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              {phase === 'story'                                            ? 'Start'
               : phase === 'manual_input' || phase === 'image_input'       ? 'Reference'
               : phase === 'ocr_wait'    || phase === 'ocr_confirm'        ? 'Analyse'
               : phase === 'fetch_wait'                                     ? 'Building'
               : phase === 'done'                                           ? 'Ready'
               : ''}
            </span>
          </div>

          {/* ── Content ── */}
          <div className="px-6 py-5">
            {phaseMap[phase] ?? phaseMap.story}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Small shared components ────────────────────────────────────────────────── */
function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
      ← Back
    </button>
  )
}

function MiniSpinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin flex-shrink-0" />
}

function ErrorBanner({ msg }) {
  return (
    <div className="flex items-start gap-2 p-3.5 bg-red-50 border border-red-100 rounded-xl">
      <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-red-600 leading-relaxed">{msg}</p>
    </div>
  )
}
