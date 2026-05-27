import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ScanLine, Image as ImageIcon, CheckCircle2, XCircle, Edit3 } from 'lucide-react-native'
import api from '../api/client'
import { C, S } from '../theme'
import { Card, PrimaryBtn, SecondaryBtn, StatusMsg } from '../components'

// ── step machine ─────────────────────────────────────────────────────────────
// idle → uploading → polling → reviewing → confirming → done | failed
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2500
const MAX_POLLS        = 80   // 80 × 2.5 s = 200 s timeout

export default function OcrScreen() {
  const [image,   setImage]   = useState(null)
  const [step,    setStep]    = useState('idle')   // see step machine above
  const [job,     setJob]     = useState(null)     // OCRJob from API
  const [refNo,   setRefNo]   = useState('')       // editable by user
  const [msg,     setMsg]     = useState('')
  const [ok,      setOk]      = useState(false)
  const pollCount = useRef(0)
  const pollTimer = useRef(null)

  // ── image selection ───────────────────────────────────────────────────────

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to scan bills.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    })
    if (!res.canceled && res.assets?.[0]) {
      setImage(res.assets[0])
      reset()
    }
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow camera access to scan bills.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true })
    if (!res.canceled && res.assets?.[0]) {
      setImage(res.assets[0])
      reset()
    }
  }

  const reset = () => {
    clearTimeout(pollTimer.current)
    pollCount.current = 0
    setStep('idle')
    setJob(null)
    setRefNo('')
    setMsg('')
    setOk(false)
  }

  // ── step 1: upload ────────────────────────────────────────────────────────

  const startScan = async () => {
    if (!image) { setMsg('Select or take a photo first'); setOk(false); return }
    setStep('uploading')
    setMsg('')
    try {
      const formData = new FormData()
      formData.append('image', {
        uri:  image.uri,
        type: image.mimeType ?? 'image/jpeg',
        name: image.fileName ?? 'bill.jpg',
      })
      const { data } = await api.post('/ocr/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJob(data)
      setStep('polling')
      pollCount.current = 0
      schedulePoll(data.id)
    } catch (e) {
      setMsg(e.response?.data?.detail ?? 'Upload failed — check your connection')
      setOk(false)
      setStep('idle')
    }
  }

  // ── step 2: poll until done ───────────────────────────────────────────────

  const schedulePoll = (jobId) => {
    pollTimer.current = setTimeout(() => pollStatus(jobId), POLL_INTERVAL_MS)
  }

  const pollStatus = async (jobId) => {
    pollCount.current += 1
    if (pollCount.current > MAX_POLLS) {
      setMsg('OCR is taking too long. Try a clearer photo of the paper bill.')
      setOk(false)
      setStep('failed')
      return
    }
    try {
      const { data } = await api.get(`/ocr/status/${jobId}/`)
      setJob(data)
      if (data.status === 'success') {
        setRefNo(data.extracted_ref_no ?? '')
        setStep('reviewing')
      } else if (data.status === 'failed') {
        // Show the actionable message stored in raw_result.message (set by OCR module)
        const hint = data.raw_result?.message ?? data.error_message ?? 'OCR extraction failed.'
        setMsg(hint)
        setOk(false)
        setRefNo('')      // user can still enter manually
        setStep('failed')
      } else {
        // still running
        schedulePoll(jobId)
      }
    } catch (e) {
      setMsg(e.response?.data?.detail ?? 'Could not reach server. Retrying…')
      setOk(false)
      schedulePoll(jobId)   // keep retrying on network blip
    }
  }

  // ── step 3: confirm (or manual entry) ────────────────────────────────────

  const confirmRef = async () => {
    const ref = refNo.trim()
    if (!ref) { setMsg('Enter a valid reference number'); setOk(false); return }
    setStep('confirming')
    setMsg('')
    try {
      const body = {}
      if (ref) body.ref_no = ref
      const { data } = await api.post(`/ocr/${job.id}/confirm/`, body)
      setMsg(data.message ?? 'Reference confirmed! Fetching bill history…')
      setOk(true)
      setStep('done')
    } catch (e) {
      setMsg(e.response?.data?.detail ?? 'Confirmation failed.')
      setOk(false)
      setStep(job?.status === 'success' ? 'reviewing' : 'failed')
    }
  }

  // ── render helpers ────────────────────────────────────────────────────────

  const busy       = step === 'uploading' || step === 'polling' || step === 'confirming'
  const canConfirm = step === 'reviewing' || step === 'failed'

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={{ paddingVertical: 4 }}>
        <Text style={styles.h1}>OCR Scan</Text>
        <Text style={styles.h1Sub}>Scan a LESCO paper bill to extract the reference number</Text>
      </View>

      {/* Instructions card */}
      <Card style={{ flexDirection: 'row', gap: 12, borderLeftWidth: 4, borderLeftColor: C.primary }}>
        <ScanLine size={18} color={C.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>How it works</Text>
          <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 18 }}>
            Photograph your <Text style={{ fontWeight: '700' }}>printed paper bill</Text> — not a phone screen or digital
            display.{'\n'}The AI reads the REF NO, then fetches your full LESCO billing history automatically.
          </Text>
        </View>
      </Card>

      {/* Image preview */}
      {image ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
          <View style={styles.previewFooter}>
            <Text style={{ fontSize: 12, color: C.textSub }}>
              {image.fileName ?? 'Selected image'} · {image.width}×{image.height}
            </Text>
            <TouchableOpacity onPress={() => { setImage(null); reset() }}>
              <Text style={{ fontSize: 12, color: C.danger, fontWeight: '600' }}>Remove</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : (
        <Card style={styles.dropzone}>
          <ImageIcon size={36} color={C.textMuted} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.textSub, marginTop: 10 }}>No image selected</Text>
          <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>PNG, JPG up to 10 MB</Text>
        </Card>
      )}

      {/* Gallery / Camera buttons */}
      <View style={styles.pickerRow}>
        <TouchableOpacity
          onPress={pickImage}
          disabled={busy}
          style={[S.btnSecondary, styles.halfBtn, busy && styles.disabled]}
          activeOpacity={0.7}
        >
          <ImageIcon size={15} color={C.text} />
          <Text style={{ color: C.text, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={takePhoto}
          disabled={busy}
          style={[S.btnSecondary, styles.halfBtn, busy && styles.disabled]}
          activeOpacity={0.7}
        >
          <ScanLine size={15} color={C.text} />
          <Text style={{ color: C.text, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>Camera</Text>
        </TouchableOpacity>
      </View>

      {/* Polling progress */}
      {step === 'polling' && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="small" color={C.primary} />
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>Extracting reference number…</Text>
            <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
              This takes 30–120 s depending on image quality.
            </Text>
          </View>
        </Card>
      )}

      {/* Review / manual-entry card */}
      {(step === 'reviewing' || step === 'failed') && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {step === 'reviewing'
              ? <CheckCircle2 size={16} color={C.success} />
              : <Edit3 size={16} color={C.warning ?? C.textSub} />
            }
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
              {step === 'reviewing' ? 'Reference number extracted' : 'Enter manually'}
            </Text>
          </View>

          {step === 'reviewing' && job && (
            <Text style={{ fontSize: 12, color: C.textSub }}>
              Confidence: {job.confidence != null ? `${(job.confidence * 100).toFixed(0)}%` : 'n/a'}
              {' '}· method: {job.method ?? 'n/a'}
            </Text>
          )}

          <Text style={{ fontSize: 12, color: C.textSub }}>
            {step === 'reviewing'
              ? 'Review the extracted value — correct it if needed, then tap Confirm.'
              : 'OCR could not read the image. Type the reference number from your bill.'}
          </Text>

          <TextInput
            value={refNo}
            onChangeText={setRefNo}
            placeholder="e.g. 08 11274 1172000U"
            placeholderTextColor={C.textMuted}
            autoCapitalize="characters"
            style={styles.refInput}
          />

          <PrimaryBtn
            label={step === 'confirming' ? 'Confirming…' : 'Confirm & Fetch Bills'}
            onPress={confirmRef}
            loading={step === 'confirming'}
            disabled={step === 'confirming' || !refNo.trim()}
          />
        </Card>
      )}

      {/* Done state */}
      {step === 'done' && (
        <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <CheckCircle2 size={18} color={C.success} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>All done!</Text>
            <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 18 }}>
              LESCO is fetching your bill history in the background.{'\n'}
              Check the Bills tab in a few minutes.
            </Text>
            <TouchableOpacity onPress={() => { setImage(null); reset() }} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.primary }}>Scan another bill →</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {/* Error / status message */}
      <StatusMsg ok={ok} msg={msg} />

      {/* Main action button (idle + uploading only) */}
      {(step === 'idle' || step === 'uploading') && (
        <PrimaryBtn
          label={step === 'uploading' ? 'Uploading…' : 'Extract Reference Number'}
          onPress={startScan}
          loading={step === 'uploading'}
          disabled={!image || step === 'uploading'}
          style={{ flexDirection: 'row', gap: 8 }}
        />
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:           { flex: 1, backgroundColor: C.bg },
  content:      { padding: 16, gap: 12 },
  h1:           { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:        { fontSize: 13, color: C.textSub, marginTop: 2 },
  dropzone:     { alignItems: 'center', paddingVertical: 48, borderStyle: 'dashed', borderWidth: 2, borderColor: C.borderMd },
  preview:      { width: '100%', height: 240 },
  previewFooter:{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  pickerRow:    { flexDirection: 'row', gap: 12 },
  halfBtn:      { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  disabled:     { opacity: 0.45 },
  refInput:     {
    borderWidth: 1, borderColor: C.borderMd, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontWeight: '600', color: C.text,
    backgroundColor: C.bg,
    letterSpacing: 1,
  },
})
