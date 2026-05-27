import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ScanLine, Image as ImageIcon, CheckCircle2, Upload } from 'lucide-react-native'
import api from '../api/client'
import { C, S } from '../theme'
import { Card, PrimaryBtn, SecondaryBtn, StatusMsg } from '../components'

export default function OcrScreen() {
  const [image,   setImage]   = useState(null)
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState('')
  const [ok,      setOk]      = useState(false)

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo access to scan bills.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    })
    if (!res.canceled && res.assets?.[0]) {
      setImage(res.assets[0])
      setResult(null)
      setMsg('')
    }
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow camera access to scan bills.'); return }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: true,
    })
    if (!res.canceled && res.assets?.[0]) {
      setImage(res.assets[0])
      setResult(null)
      setMsg('')
    }
  }

  const scanBill = async () => {
    if (!image) { setMsg('Select or take a photo first'); setOk(false); return }
    setLoading(true); setMsg('')
    try {
      const formData = new FormData()
      formData.append('image', {
        uri:  image.uri,
        type: image.mimeType ?? 'image/jpeg',
        name: image.fileName ?? 'bill.jpg',
      })
      const { data } = await api.post('/ocr/scan/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      setMsg('Bill scanned and saved successfully!')
      setOk(true)
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Scan failed — try a clearer image')
      setOk(false)
    } finally { setLoading(false) }
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={{ paddingVertical: 4 }}>
        <Text style={styles.h1}>OCR Scan</Text>
        <Text style={styles.h1Sub}>Scan a LESCO bill image to extract data automatically</Text>
      </View>

      {/* Instructions */}
      <Card style={{ flexDirection: 'row', gap: 12, borderLeftWidth: 4, borderLeftColor: C.primary }}>
        <ScanLine size={18} color={C.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>How it works</Text>
          <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 18 }}>
            Take a clear photo of your LESCO paper bill. The AI extracts units consumed, bill amount, month, and reference number — then saves the record automatically.
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
            <TouchableOpacity onPress={() => { setImage(null); setResult(null); setMsg('') }}>
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

      {/* Pick / take buttons */}
      <View style={styles.pickerRow}>
        <TouchableOpacity onPress={pickImage} style={[S.btnSecondary, styles.halfBtn]} activeOpacity={0.7}>
          <ImageIcon size={15} color={C.text} />
          <Text style={{ color: C.text, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={takePhoto} style={[S.btnSecondary, styles.halfBtn]} activeOpacity={0.7}>
          <ScanLine size={15} color={C.text} />
          <Text style={{ color: C.text, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>Camera</Text>
        </TouchableOpacity>
      </View>

      <StatusMsg ok={ok} msg={msg} />

      <PrimaryBtn
        label={loading ? 'Scanning…' : 'Scan Bill'}
        onPress={scanBill}
        loading={loading}
        disabled={!image}
        style={{ flexDirection: 'row', gap: 8 }}
      />

      {/* OCR result */}
      {result && (
        <Card>
          <View style={styles.resultHeader}>
            <CheckCircle2 size={18} color={C.success} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginLeft: 8 }}>Extracted Data</Text>
          </View>
          {[
            ['Month',       result.month_label],
            ['Units',       result.units ? `${result.units} kWh` : null],
            ['Bill Amount', result.bill_amount ? `Rs ${Number(result.bill_amount).toLocaleString()}` : null],
            ['Reference',   result.ref_no],
            ['Confidence',  result.confidence ? `${(result.confidence * 100).toFixed(0)}%` : null],
          ].filter(([, v]) => v).map(([label, value]) => (
            <View key={label} style={styles.resultRow}>
              <Text style={{ fontSize: 12, color: C.textSub, width: 100 }}>{label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, flex: 1 }}>{value}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: C.bg },
  content:  { padding: 16, gap: 12 },
  h1:       { fontSize: 24, fontWeight: '800', color: C.text },
  h1Sub:    { fontSize: 13, color: C.textSub, marginTop: 2 },
  dropzone: { alignItems: 'center', paddingVertical: 48, borderStyle: 'dashed', borderWidth: 2, borderColor: C.borderMd },
  preview:  { width: '100%', height: 240 },
  previewFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  pickerRow:{ flexDirection: 'row', gap: 12 },
  halfBtn:  { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  resultRow:{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
})
