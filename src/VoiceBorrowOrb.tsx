import { useEffect, useRef, useState } from 'react'
import type { AudioConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk'
import { getSpeechToken } from './api'

type Props = {
  processing: boolean
  onTranscript: (text: string) => Promise<void>
  onError: (message: string) => void
}

type VoicePhase = 'idle' | 'starting' | 'listening' | 'stopping'

function MicrophoneIcon() {
  return <svg className="voice-orb-microphone" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5.5 11.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 18.5V22M8.5 22h7" /></svg>
}

function VoiceWave() {
  return <span className="voice-orb-wave" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</span>
}

export default function VoiceBorrowOrb({ processing, onTranscript, onError }: Props) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const recognizerRef = useRef<SpeechRecognizer | null>(null)
  const audioConfigRef = useRef<AudioConfig | null>(null)
  const finalTranscriptRef = useRef('')
  const partialTranscriptRef = useRef('')
  const listeningRequestedRef = useRef(false)
  const mountedRef = useRef(true)

  const closeSpeechResources = () => {
    const recognizer = recognizerRef.current
    const audioConfig = audioConfigRef.current
    recognizerRef.current = null
    audioConfigRef.current = null
    recognizer?.close()
    audioConfig?.close()
  }

  useEffect(() => () => {
    mountedRef.current = false
    listeningRequestedRef.current = false
    const recognizer = recognizerRef.current
    const audioConfig = audioConfigRef.current
    recognizerRef.current = null
    audioConfigRef.current = null
    recognizer?.stopContinuousRecognitionAsync(() => recognizer.close(), () => recognizer.close())
    audioConfig?.close()
  }, [])

  async function startListening() {
    if (phase !== 'idle' || processing) return
    setPhase('starting')
    listeningRequestedRef.current = true
    finalTranscriptRef.current = ''
    partialTranscriptRef.current = ''
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持麦克风')
      const [{ token, region }, SpeechSDK] = await Promise.all([getSpeechToken(), import('microsoft-cognitiveservices-speech-sdk')])
      if (!mountedRef.current || !listeningRequestedRef.current) return
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)
      speechConfig.speechRecognitionLanguage = 'zh-CN'
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig)
      recognizerRef.current = recognizer
      audioConfigRef.current = audioConfig
      recognizer.recognizing = (_sender, event) => { partialTranscriptRef.current = event.result.text.trim() }
      recognizer.recognized = (_sender, event) => {
        if (event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech || !event.result.text.trim()) return
        const segment = event.result.text.trim().replace(/[。.]$/, '')
        finalTranscriptRef.current = [finalTranscriptRef.current, segment].filter(Boolean).join(' ')
        partialTranscriptRef.current = ''
      }
      recognizer.canceled = (_sender, event) => {
        if (!listeningRequestedRef.current) return
        listeningRequestedRef.current = false
        closeSpeechResources()
        if (mountedRef.current) setPhase('idle')
        onError(event.errorDetails?.includes('Permission') ? '请允许浏览器使用麦克风' : '语音识别中断，请重新点击语音球')
      }
      recognizer.startContinuousRecognitionAsync(() => {
        if (mountedRef.current && listeningRequestedRef.current) setPhase('listening')
      }, (reason) => {
        listeningRequestedRef.current = false
        closeSpeechResources()
        if (mountedRef.current) setPhase('idle')
        onError(typeof reason === 'string' && reason.includes('Permission') ? '请允许浏览器使用麦克风' : '语音识别暂时无法启动')
      })
    } catch (reason) {
      listeningRequestedRef.current = false
      closeSpeechResources()
      if (mountedRef.current) setPhase('idle')
      onError(reason instanceof Error ? reason.message : '无法启动语音识别')
    }
  }

  function stopListening() {
    if (phase !== 'listening') return
    const recognizer = recognizerRef.current
    listeningRequestedRef.current = false
    setPhase('stopping')
    if (!recognizer) {
      closeSpeechResources()
      setPhase('idle')
      onError('语音连接已经中断，请重新说一次')
      return
    }
    recognizer.stopContinuousRecognitionAsync(async () => {
      const transcript = (finalTranscriptRef.current || partialTranscriptRef.current).trim()
      closeSpeechResources()
      if (!transcript) {
        if (mountedRef.current) setPhase('idle')
        onError('没有听清，请靠近麦克风重新说一次')
        return
      }
      await onTranscript(transcript)
      if (mountedRef.current) setPhase('idle')
    }, () => {
      closeSpeechResources()
      if (mountedRef.current) setPhase('idle')
      onError('停止语音识别失败，请重新试一次')
    })
  }

  const activePhase = processing ? 'processing' : phase
  const listening = phase === 'listening'
  const disabled = processing || phase === 'starting' || phase === 'stopping'
  const label = processing ? '正在生成借用清单' : phase === 'starting' ? '正在开启语音识别' : phase === 'stopping' ? '正在识别语音' : listening ? '停止语音并生成清单' : '开始语音快速借用'

  return <button type="button" className={`voice-orb ${activePhase}`} onClick={listening ? stopListening : startListening} disabled={disabled} aria-label={label} aria-pressed={listening}>
    <span className="voice-orb-glow" aria-hidden="true" />
    <span className="voice-orb-core">{phase === 'idle' && !processing ? <MicrophoneIcon /> : <VoiceWave />}</span>
    <span className="voice-orb-status" role="status">{label}</span>
  </button>
}
