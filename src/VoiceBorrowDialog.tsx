import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AudioConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk'
import { borrowBatch, getSpeechToken, interpretBorrowCommand } from './api'
import type { BatchBorrowResult, BorrowCommandResult, Member } from './types'

type Props = {
  currentUser: Member
  onClose: () => void
  onBorrowed: (result: BatchBorrowResult) => Promise<void>
}

function MicrophoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5.5 11.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 18.5V22M8.5 22h7" /></svg>
}

export default function VoiceBorrowDialog({ currentUser, onClose, onBorrowed }: Props) {
  const [command, setCommand] = useState('')
  const [result, setResult] = useState<BorrowCommandResult | null>(null)
  const [interpreting, setInterpreting] = useState(false)
  const [borrowing, setBorrowing] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recognizerRef = useRef<SpeechRecognizer | null>(null)
  const audioConfigRef = useRef<AudioConfig | null>(null)
  const finalTranscriptRef = useRef('')
  const partialTranscriptRef = useRef('')

  const closeSpeechResources = () => {
    const recognizer = recognizerRef.current
    const audioConfig = audioConfigRef.current
    recognizerRef.current = null
    audioConfigRef.current = null
    recognizer?.close()
    audioConfig?.close()
    setListening(false)
  }

  const stopListening = (generateList = false) => {
    const recognizer = recognizerRef.current
    if (!recognizer) { closeSpeechResources(); return }
    recognizer.stopContinuousRecognitionAsync(async () => {
      const transcript = (finalTranscriptRef.current || partialTranscriptRef.current).trim()
      closeSpeechResources()
      if (!generateList) return
      if (!transcript) { setError('没有听清，请靠近麦克风重新说一次'); return }
      setCommand(transcript)
      await interpret(transcript)
    }, () => {
      closeSpeechResources()
      setError('停止语音识别失败，可以先使用文字输入')
    })
  }
  useEffect(() => () => {
    const recognizer = recognizerRef.current
    const audioConfig = audioConfigRef.current
    recognizerRef.current = null
    audioConfigRef.current = null
    recognizer?.stopContinuousRecognitionAsync(() => recognizer.close(), () => recognizer.close())
    audioConfig?.close()
  }, [])

  async function interpret(text = command) {
    const clean = text.trim()
    if (!clean) { setError('请说出或输入需要借用的器材'); return }
    setInterpreting(true)
    setError('')
    try {
      const parsed = await interpretBorrowCommand(clean)
      setResult(parsed)
      if (!parsed.equipment.length && !parsed.kits.length) setError('没有匹配到明确的器材，请换一种说法或补充完整型号')
    } catch (reason) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : '暂时无法理解这条指令')
    } finally { setInterpreting(false) }
  }

  async function submit(event: FormEvent) { event.preventDefault(); await interpret() }

  async function listen() {
    if (listening) { stopListening(true); return }
    setError('')
    setResult(null)
    setCommand('')
    finalTranscriptRef.current = ''
    partialTranscriptRef.current = ''
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持麦克风，请改用文字输入')
      const [{ token, region }, SpeechSDK] = await Promise.all([getSpeechToken(), import('microsoft-cognitiveservices-speech-sdk')])
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)
      speechConfig.speechRecognitionLanguage = 'zh-CN'
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig)
      recognizerRef.current = recognizer
      audioConfigRef.current = audioConfig
      recognizer.recognizing = (_sender, event) => {
        partialTranscriptRef.current = event.result.text.trim()
        setCommand([finalTranscriptRef.current, partialTranscriptRef.current].filter(Boolean).join(' '))
      }
      recognizer.recognized = (_sender, event) => {
        if (event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech || !event.result.text.trim()) return
        const segment = event.result.text.trim().replace(/[。.]$/, '')
        finalTranscriptRef.current = [finalTranscriptRef.current, segment].filter(Boolean).join(' ')
        partialTranscriptRef.current = ''
        setCommand(finalTranscriptRef.current)
      }
      recognizer.canceled = (_sender, event) => {
        closeSpeechResources()
        setError(event.errorDetails?.includes('Permission') ? '请允许浏览器使用麦克风' : '语音识别失败，可以先使用文字输入')
      }
      recognizer.startContinuousRecognitionAsync(() => {
        setListening(true)
      }, (reason) => {
        closeSpeechResources()
        setError(typeof reason === 'string' && reason.includes('Permission') ? '请允许浏览器使用麦克风' : '语音识别失败，可以先使用文字输入')
      })
    } catch (reason) {
      closeSpeechResources()
      setError(reason instanceof Error ? reason.message : '无法启动语音识别')
    }
  }

  const updateQuantity = (equipmentId: number, next: number) => setResult((current) => current ? { ...current, equipment: current.equipment.map((item) => item.equipmentId === equipmentId ? { ...item, quantity: Math.max(1, Math.min(20, next)) } : item) } : current)
  const removeEquipment = (equipmentId: number) => setResult((current) => current ? { ...current, equipment: current.equipment.filter((item) => item.equipmentId !== equipmentId) } : current)
  const removeKit = (kitId: number) => setResult((current) => current ? { ...current, kits: current.kits.filter((kit) => kit.kitId !== kitId) } : current)
  const hasSelection = Boolean(result && (result.equipment.length || result.kits.length))
  const hasUnavailable = Boolean(result && (result.equipment.some((item) => item.quantity > item.availableQuantity) || result.kits.some((kit) => !kit.available)))

  async function confirmBorrow() {
    if (!result || !hasSelection || hasUnavailable) return
    setBorrowing(true)
    setError('')
    try {
      const borrowed = await borrowBatch({ memberId: currentUser.id, items: result.equipment.map((item) => ({ equipmentId: item.equipmentId, quantity: item.quantity })), kitIds: result.kits.map((kit) => kit.kitId) })
      await onBorrowed(borrowed)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量借出失败，请刷新库存后重试')
    } finally { setBorrowing(false) }
  }

  return <div className="dialog-backdrop voice-dialog-backdrop" onMouseDown={() => { stopListening(); onClose() }}>
    <section className="voice-borrow-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-borrow-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="form-title"><div><p className="voice-eyebrow">AI ASSISTED</p><h2 id="voice-borrow-title">快速借用</h2></div><button type="button" onClick={() => { stopListening(); onClose() }} aria-label="关闭">×</button></div>
      <p className="voice-intro">说出或输入需要的器材和数量，确认清单后才会写入借还记录。</p>
      <form className="voice-command" onSubmit={submit}>
        <textarea value={command} maxLength={300} rows={3} placeholder="例如：我要一台 A7 IV、一个 24-70 和两块电池" onChange={(event) => { setCommand(event.target.value); setResult(null); if (error) setError('') }} />
        <div className="voice-command-actions">
          <button type="button" className={`listen-button${listening ? ' listening' : ''}`} onClick={listen} disabled={interpreting || borrowing}><MicrophoneIcon /><span>{listening ? '停止并生成' : '语音输入'}</span></button>
          <button type="submit" className="interpret-button" disabled={interpreting || borrowing || !command.trim()}>{interpreting ? '正在理解…' : result ? '重新识别' : '生成清单'}</button>
        </div>
      </form>
      {listening && <div className="listening-state" role="status"><span /><span /><span /><b>正在持续聆听，再次点击按钮结束</b></div>}
      {result && <div className="borrow-command-result" aria-live="polite">
        <div className="result-heading"><h3>借用清单</h3><span>{result.kits.length} 个 Kit · {result.equipment.reduce((sum, item) => sum + item.quantity, 0)} 件单件器材</span></div>
        <div className="result-items">
          {result.kits.map((kit) => <div className={`result-item kit-result${kit.available ? '' : ' unavailable'}`} key={`kit-${kit.kitId}`}><div><small>KIT · {kit.itemCount} 类器材</small><strong>{kit.name}</strong>{!kit.available && <em>Kit 已借出或内部库存不足</em>}</div><button type="button" onClick={() => removeKit(kit.kitId)} aria-label={`移除 ${kit.name}`}>×</button></div>)}
          {result.equipment.map((item) => <div className={`result-item${item.quantity <= item.availableQuantity ? '' : ' unavailable'}`} key={item.equipmentId}><div><small>{item.category} · 可借 {item.availableQuantity} 件</small><strong>{item.name}</strong>{item.quantity > item.availableQuantity && <em>需要 {item.quantity} 件，当前库存不足</em>}</div><div className="quantity-stepper"><button type="button" onClick={() => updateQuantity(item.equipmentId, item.quantity - 1)} disabled={item.quantity <= 1}>−</button><span>{item.quantity}</span><button type="button" onClick={() => updateQuantity(item.equipmentId, item.quantity + 1)} disabled={item.quantity >= 20}>＋</button></div><button className="remove-result" type="button" onClick={() => removeEquipment(item.equipmentId)} aria-label={`移除 ${item.name}`}>×</button></div>)}
        </div>
        {result.unresolvedItems.length > 0 && <div className="unresolved-items"><strong>以下内容还不能确定</strong><p>{result.unresolvedItems.join('、')}</p><span>请在上方补充完整型号后重新识别。</span></div>}
      </div>}
      {error && <p className="form-error voice-error" role="alert">{error}</p>}
      <div className="voice-footer"><span>将以「{currentUser.name}」的身份借出</span><button type="button" onClick={confirmBorrow} disabled={!hasSelection || hasUnavailable || borrowing || interpreting}>{borrowing ? '正在借出…' : hasUnavailable ? '请调整库存不足项' : '确认借出'}</button></div>
    </section>
  </div>
}
