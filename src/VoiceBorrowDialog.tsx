import { useState, type FormEvent } from 'react'
import { borrowBatch, interpretBorrowCommand } from './api'
import type { BatchBorrowResult, BorrowCommandResult, Member } from './types'

type Props = {
  currentUser: Member
  initialCommand: string
  initialResult: BorrowCommandResult | null
  initialError?: string
  onClose: () => void
  onBorrowed: (result: BatchBorrowResult) => Promise<void>
}

export default function VoiceBorrowDialog({ currentUser, initialCommand, initialResult, initialError = '', onClose, onBorrowed }: Props) {
  const [command, setCommand] = useState(initialCommand)
  const [result, setResult] = useState<BorrowCommandResult | null>(initialResult)
  const [interpreting, setInterpreting] = useState(false)
  const [borrowing, setBorrowing] = useState(false)
  const [error, setError] = useState(initialError)

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

  return <div className="dialog-backdrop voice-dialog-backdrop" onMouseDown={onClose}>
    <section className="voice-borrow-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-borrow-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="form-title"><div><p className="voice-eyebrow">AI ASSISTED</p><h2 id="voice-borrow-title">借用清单</h2></div><button type="button" onClick={onClose} aria-label="关闭">×</button></div>
      <p className="voice-intro">已根据你的语音生成清单。可以修改原话重新识别，也可以直接调整下面的器材。</p>
      <form className="voice-command" onSubmit={submit}>
        <textarea value={command} maxLength={300} rows={3} placeholder="例如：我要一台 A7 IV、一个 24-70 和两块电池" onChange={(event) => { setCommand(event.target.value); setResult(null); if (error) setError('') }} />
        <div className="voice-command-actions"><button type="submit" className="interpret-button" disabled={interpreting || borrowing || !command.trim()}>{interpreting ? '正在理解…' : '重新识别'}</button></div>
      </form>
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
