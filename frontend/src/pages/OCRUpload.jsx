import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import {
  Upload, ScanLine, CheckCircle, XCircle, Loader,
  ArrowRight, RefreshCw, Lightbulb, FileText,
  TrendingUp, Cpu, Info, Zap,
} from 'lucide-react'

const STEPS = ['Upload', 'Processing', 'Confirm', 'Done']

function useElapsed(running) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!running) { setSecs(0); return }
    const t = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  return secs
}

/* ── Right-panel variants ─────────────────────────────────────────────── */

function PanelHowItWorks() {
  const steps = [
    {
      icon: Upload,
      title: 'Upload',
      desc: 'Take a clear photo of your LESCO bill or upload an existing image (JPEG / PNG).',
    },
    {
      icon: Cpu,
      title: 'Extract',
      desc: 'EasyOCR scans the image and locates your 14-character consumer reference number.',
    },
    {
      icon: CheckCircle,
      title: 'Confirm',
      desc: 'Review the extracted number — correct it if needed before fetching history.',
    },
    {
      icon: TrendingUp,
      title: 'Analyse',
      desc: 'Bills are saved automatically and a new prediction is generated for you.',
    },
  ]
  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-5">How It Works</p>
        <div className="space-y-0">
          {steps.map(({ icon: Icon, title, desc }, i) => (
            <div key={i} className="flex gap-3.5 pb-5 last:pb-0 relative">
              {i < steps.length - 1 && (
                <div className="absolute left-3.5 top-8 bottom-0 w-px bg-slate-100" />
              )}
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 relative z-10">
                <Icon size={13} className="text-blue-600" />
              </div>
              <div className="pt-0.5">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Tips for Best Results</p>
        <ul className="space-y-2.5">
          {[
            'Ensure the bill is well-lit with no shadows or glare',
            'Keep the reference number region fully in frame',
            'Use a flat surface — avoid angled or curled edges',
            'Minimum 600 × 400 px resolution recommended',
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 flex-shrink-0 mt-1" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Reference Number</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <p className="font-mono text-sm font-bold text-slate-800 tracking-wider">08 11274 1172000U</p>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            14-character unique consumer ID printed on your LESCO bill. The last character is always a letter.
          </p>
        </div>
      </div>
    </div>
  )
}

function PanelProcessing({ elapsed }) {
  const fields = [
    { label: 'Reference Number',  example: '08 11274 1172000U' },
    { label: 'Consumer Name',     example: 'MUHAMMAD AHMAD'     },
    { label: 'Bill Amount (Rs)',  example: '4,250.00'           },
    { label: 'Units Consumed',    example: '312 kWh'            },
  ]
  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4">Scanning For</p>
        <div className="space-y-1">
          {fields.map(({ label, example }, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-xs font-medium text-slate-700">{label}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{example}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info size={13} className="text-slate-400" />
          <p className="text-xs font-semibold text-slate-500">Processing Time</p>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {elapsed < 20
            ? 'EasyOCR is initialising the recognition model. This takes a few seconds on first run.'
            : elapsed < 60
            ? 'Actively scanning the image. Complex bills with many fields take longer to parse.'
            : elapsed < 180
            ? 'CPU-based OCR on a detailed bill image can take 1–3 minutes. Almost there.'
            : 'Taking longer than usual. If the image is very large or complex, this is normal. Feel free to wait or cancel and retry with a clearer photo.'}
        </p>
        <div className="mt-3 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min((elapsed / 120) * 100, 92)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 font-mono">{elapsed}s elapsed</p>
      </div>
    </div>
  )
}

function PanelConfirm({ job }) {
  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4">Extracted Data</p>
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">Reference Number</p>
            <p className="font-mono text-base font-bold text-slate-900 tracking-wider">
              {job?.extracted_ref_no || '—'}
            </p>
            {job?.confidence && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${(job.confidence * 100).toFixed(0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-emerald-600 font-medium">
                  {(job.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <div className="flex items-start gap-2.5">
          <Lightbulb size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">Not quite right?</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              If OCR missed a character or read it incorrectly, type the correct reference number in the input field on the left before confirming.
            </p>
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">After Confirmation</p>
        {[
          { icon: FileText,   text: 'LESCO bill history is fetched for this consumer ID'    },
          { icon: Zap,        text: 'Bills are saved automatically to your account'          },
          { icon: TrendingUp, text: 'A new prediction is generated based on the fresh data'  },
        ].map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-start gap-2.5 mb-3 last:mb-0">
            <div className="w-6 h-6 bg-blue-50 rounded-md flex items-center justify-center flex-shrink-0">
              <Icon size={11} className="text-blue-600" />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed pt-0.5">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelDone({ result }) {
  return (
    <div className="space-y-4">
      <div className="surface overflow-hidden">
        <div className="bg-emerald-50 px-5 py-5 border-b border-emerald-100">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
            <CheckCircle size={20} className="text-emerald-600" />
          </div>
          <p className="font-bold text-slate-900">Fetch Initiated</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{result?.message}</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Reference Number</span>
            <span className="font-mono font-semibold text-slate-800">{result?.confirmed_ref_no}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Fetch Job</span>
            <span className="font-semibold text-slate-800">#{result?.fetch_job_id}</span>
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">What Happens Next</p>
        {[
          { icon: Cpu,        label: 'Processing',   text: 'LESCO portal is being queried for your bill history. This usually takes 1–2 minutes.' },
          { icon: FileText,   label: 'Bills Saved',  text: 'Once complete, bills will appear on the Bills page automatically.'                    },
          { icon: TrendingUp, label: 'Prediction',   text: 'A consumption prediction for the current month will be generated.'                   },
        ].map(({ icon: Icon, label, text }, i) => (
          <div key={i} className="flex gap-3 mb-4 last:mb-0">
            <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon size={13} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Link to="/bills" className="btn-primary flex-1 text-center text-xs py-2.5">
          View Bills
        </Link>
        <Link to="/predictions" className="btn-secondary flex-1 text-center text-xs py-2.5">
          Predictions
        </Link>
      </div>
    </div>
  )
}

/* ── Main component ───────────────────────────────────────────────────── */

export default function OCRUpload() {
  const [step,    setStep]    = useState(0)
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState(null)
  const [job,     setJob]     = useState(null)
  const [refNo,   setRefNo]   = useState('')
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const pollRef    = useRef(null)
  const errCount   = useRef(0)
  const fileRef    = useRef(null)
  const isPolling  = step === 1
  const elapsed    = useElapsed(isPolling)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const onFile = e => {
    const f = e.target.files[0]; if (!f) return
    setFile(f); setPreview(URL.createObjectURL(f))
    setStep(0); setJob(null); setError(''); setResult(null); setRefNo('')
  }

  const upload = async () => {
    if (!file) return
    setBusy(true); setError('')
    const fd = new FormData(); fd.append('image', file)
    try {
      const { data } = await api.post('/ocr/upload/', fd)
      setJob(data); setStep(1); errCount.current = 0
      startPolling(data.id)
    } catch (err) { setError(err.response?.data?.detail || 'Upload failed') }
    finally { setBusy(false) }
  }

  const startPolling = id => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/ocr/status/${id}/`)
        setJob(data); errCount.current = 0
        if (data.status === 'success' || data.status === 'failed') {
          clearInterval(pollRef.current)
          setRefNo(data.extracted_ref_no || '')
          setStep(data.status === 'success' ? 2 : -1)
          if (data.status === 'failed') setError('OCR could not extract a reference number.')
        }
      } catch {
        errCount.current += 1
        if (errCount.current >= 8) {
          clearInterval(pollRef.current)
          setError('Connection lost. Click Refresh to retry.')
        }
      }
    }, 3000)
  }

  const manualRefresh = () => { if (!job) return; setError(''); errCount.current = 0; startPolling(job.id) }

  const confirm = async () => {
    setBusy(true); setError('')
    try {
      const body = refNo.trim() ? { ref_no: refNo.trim() } : {}
      const { data } = await api.post(`/ocr/${job.id}/confirm/`, body)
      setResult(data); setStep(3)
    } catch (err) { setError(err.response?.data?.detail || 'Confirm failed') }
    finally { setBusy(false) }
  }

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setStep(0); setFile(null); setPreview(null); setJob(null)
    setRefNo(''); setResult(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const fmtTime = s => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`

  /* right panel */
  const RightPanel = () => {
    if (step === 3 && result)    return <PanelDone result={result} />
    if (step === 2 && job)       return <PanelConfirm job={job} />
    if (step === 1)              return <PanelProcessing elapsed={elapsed} />
    return <PanelHowItWorks />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bill Scan (OCR)</h1>
        <p className="text-slate-500 text-sm mt-1">Extract your LESCO reference number from a photo</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center max-w-lg">
        {STEPS.map((label, i) => (
          <div key={i} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                step > i
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : step === i
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-slate-200 text-slate-400 bg-white'
              }`}>
                {step > i ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                step === i ? 'text-blue-600' : step > i ? 'text-slate-500' : 'text-slate-400'
              }`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mb-5 transition-colors ${step > i ? 'bg-blue-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ── Left: process flow ────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Error banner */}
          {error && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm">
              <span className="flex items-center gap-2 text-red-600">
                <XCircle size={15} className="flex-shrink-0" />{error}
              </span>
              {job && step !== 2 && (
                <button onClick={manualRefresh}
                  className="flex items-center gap-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0">
                  <RefreshCw size={11} /> Refresh
                </button>
              )}
            </div>
          )}

          {/* Upload card */}
          <div className="surface p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <ScanLine size={15} className="text-blue-600" />
                </div>
                <p className="font-semibold text-slate-900 text-sm">Upload Bill Image</p>
              </div>
              {file && (
                <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                  Clear
                </button>
              )}
            </div>

            <label className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
              file ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/20'
            }`}
              style={{ minHeight: preview ? 'auto' : 200 }}
            >
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
              {preview ? (
                <img src={preview} alt="bill preview" className="w-full rounded-2xl object-contain max-h-72" />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                    <Upload size={22} className="text-blue-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Click to upload bill image</p>
                  <p className="text-xs text-slate-400 mt-1.5">JPEG or PNG · max 10 MB</p>
                </div>
              )}
            </label>

            {file && step === 0 && (
              <button onClick={upload} disabled={busy}
                className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
                {busy
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Uploading…</>
                  : <><Upload size={14} /> Start OCR Processing</>
                }
              </button>
            )}
          </div>

          {/* Step 1: Processing */}
          {step === 1 && (
            <div className="surface p-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Loader size={17} className="text-blue-600 animate-spin" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 text-sm">Processing image…</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {elapsed < 20
                      ? 'Initialising OCR model'
                      : elapsed < 60
                      ? 'Scanning for reference number'
                      : 'Analysing complex bill layout'}
                  </p>
                </div>
                <span className="text-sm font-mono font-bold text-blue-600 flex-shrink-0 tabular-nums">
                  {fmtTime(elapsed)}
                </span>
              </div>
              {job && (
                <div className="mt-4 flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                    job.status === 'running'
                      ? 'bg-amber-50 text-amber-600 border-amber-100'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>{job.status}</span>
                  <button onClick={manualRefresh}
                    className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors">
                    <RefreshCw size={11} /> Refresh status
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === 2 && job && (
            <div className="surface p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <CheckCircle size={15} className="text-emerald-600" />
                </div>
                <p className="font-semibold text-slate-900 text-sm">Confirm Reference Number</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Extracted by OCR</p>
                <p className="text-2xl font-mono font-bold text-emerald-600 tracking-wider">
                  {job.extracted_ref_no || 'Not found'}
                </p>
                {job.confidence && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full"
                        style={{ width: `${(job.confidence * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {(job.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">
                    Correct if needed
                    <span className="text-slate-400 font-normal ml-1">(leave blank to use above)</span>
                  </label>
                  <input
                    value={refNo}
                    onChange={e => setRefNo(e.target.value)}
                    placeholder={job.extracted_ref_no || '08 11274 1172000U'}
                    className="input font-mono tracking-wider"
                  />
                </div>
                <button onClick={confirm} disabled={busy}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {busy
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                    : <><ArrowRight size={14} /> Confirm &amp; Fetch LESCO History</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && result && (
            <div className="surface overflow-hidden">
              <div className="bg-emerald-50 px-6 py-5 border-b border-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">LESCO Fetch Started</p>
                    <p className="text-xs text-slate-500 mt-0.5">{result.message}</p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Confirmed Ref No</span>
                  <span className="font-mono font-semibold text-slate-800 tracking-wider">{result.confirmed_ref_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fetch Job ID</span>
                  <span className="font-semibold text-slate-800">#{result.fetch_job_id}</span>
                </div>
              </div>
              <div className="px-6 pb-5">
                <button onClick={reset} className="btn-secondary w-full">
                  Scan Another Bill
                </button>
              </div>
            </div>
          )}

          {/* Step -1: OCR Failed */}
          {step === -1 && (
            <div className="surface p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <XCircle size={15} className="text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-red-600 text-sm">OCR Could Not Extract</p>
                  <p className="text-xs text-slate-400 mt-0.5">Enter the reference number manually to continue</p>
                </div>
              </div>
              <div className="space-y-3">
                <input
                  value={refNo}
                  onChange={e => setRefNo(e.target.value)}
                  placeholder="08 11274 1172000U"
                  className="input font-mono tracking-wider"
                />
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} disabled={!refNo.trim()} className="btn-primary flex-1">
                    Continue with Manual Entry
                  </button>
                  <button onClick={reset} className="btn-secondary px-4">Reset</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: contextual info panel ──────────────────────────────── */}
        <div className="lg:col-span-2">
          <RightPanel />
        </div>
      </div>
    </div>
  )
}
