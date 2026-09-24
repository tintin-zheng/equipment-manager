type EquipmentInventory = {
  id: number
  name: string
  category: string
  availableQuantity: number
}

type KitInventory = {
  id: number
  name: string
  itemCount: number
  available: boolean
}

export type ParsedBorrowCommand = {
  equipment: { equipmentId: number; quantity: number; confidence: number }[]
  kits: { kitId: number; confidence: number }[]
  unresolvedItems: string[]
}

const borrowCommandSchema = {
  name: 'borrow_command',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      equipment: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            equipmentId: { type: 'integer' },
            quantity: { type: 'integer', minimum: 1, maximum: 20 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['equipmentId', 'quantity', 'confidence'],
        },
      },
      kits: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kitId: { type: 'integer' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['kitId', 'confidence'],
        },
      },
      unresolvedItems: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', maxLength: 100 },
      },
    },
    required: ['equipment', 'kits', 'unresolvedItems'],
  },
}

type AiConfig = {
  provider: 'deepseek' | 'azure'
  model: string
  url: string
  headers: Record<string, string>
}

const aiConfig = (): AiConfig => {
  // DeepSeek 使用 OpenAI 兼容接口。Key 仅存在 Functions 的服务端配置中，
  // 浏览器只会调用本站的 /api/borrow-command，永远不会拿到真实 Key。
  const deepSeekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepSeekKey) {
    const endpoint = (process.env.DEEPSEEK_API_ENDPOINT?.trim() || 'https://api.deepseek.com').replace(/\/$/, '')
    const url = /\/chat\/completions(?:\?|$)/.test(endpoint) ? endpoint : `${endpoint}/chat/completions`
    return {
      provider: 'deepseek',
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      url,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepSeekKey}` },
    }
  }

  // 保留 Azure OpenAI 兼容配置，方便其他部署者继续使用 Azure 模型。
  const endpoint = (process.env.AZURE_AI_ENDPOINT ?? process.env.AZURE_OPENAI_ENDPOINT)?.trim().replace(/\/$/, '')
  const apiKey = (process.env.AZURE_AI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY)?.trim()
  const deployment = (process.env.AZURE_AI_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT)?.trim()
  if (!endpoint || !apiKey || !deployment) throw new Error('AI_NOT_CONFIGURED')
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || '2024-10-21'
  const url = endpoint.includes('/chat/completions')
    ? endpoint
    : `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`
  return {
    provider: 'azure',
    model: deployment,
    url,
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
  }
}

const responseText = (data: unknown) => {
  const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => typeof part === 'object' && part && 'text' in part ? String(part.text) : '').join('')
  throw new Error('AI_EMPTY_RESPONSE')
}

const callModel = async (body: Record<string, unknown>, config = aiConfig()): Promise<unknown> => {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify({ model: config.model, ...body }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const detail = await response.text()
    // Azure 上不同模型代际接受的输出长度参数不同，按错误提示自动兼容一次。
    if (response.status === 400 && 'max_completion_tokens' in body && /max_completion_tokens|unsupported parameter|unknown parameter/i.test(detail)) {
      const { max_completion_tokens: tokenLimit, ...compatibleBody } = body
      return callModel({ ...compatibleBody, max_tokens: tokenLimit }, config)
    }
    throw new Error(`AI_REQUEST_FAILED:${response.status}:${detail.slice(0, 300)}`)
  }
  return response.json()
}

export async function parseBorrowCommand(text: string, equipment: EquipmentInventory[], kits: KitInventory[]): Promise<ParsedBorrowCommand> {
  const config = aiConfig()
  const system = `你是摄影器材借用指令解析器。只从提供的库存中选择器材或 Kit，不得编造 ID。理解中文口语、品牌简称、型号写法、阿拉伯数字和中文数量。用户只说类别时：若该类别只有一个合理候选可选择，否则放入 unresolvedItems。默认数量为 1。Kit 始终整套借出，不要把 Kit 展开为单件。只返回 JSON 对象，不要使用 Markdown。格式必须是：{"equipment":[{"equipmentId":1,"quantity":1,"confidence":0.95}],"kits":[{"kitId":1,"confidence":0.95}],"unresolvedItems":["无法确定的原话"]}。没有匹配项时对应数组必须为空。\n\n单件库存：${JSON.stringify(equipment)}\nKit 库存：${JSON.stringify(kits)}`
  const commonBody = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
    temperature: 0,
    ...(config.provider === 'deepseek' ? { max_tokens: 500 } : { max_completion_tokens: 500 }),
  }

  // DeepSeek 支持 JSON mode；Azure 优先使用约束更严格的 JSON Schema。
  // 如果具体模型不支持某种 response_format，则逐级降级，但仍会在下方校验所有 ID 和数量。
  const formats: ({ type: string; json_schema?: typeof borrowCommandSchema } | undefined)[] = config.provider === 'deepseek'
    ? [{ type: 'json_object' }, undefined]
    : [{ type: 'json_schema', json_schema: borrowCommandSchema }, { type: 'json_object' }, undefined]
  let data: unknown
  let lastError: unknown
  for (const responseFormat of formats) {
    try {
      data = await callModel(responseFormat ? { ...commonBody, response_format: responseFormat } : commonBody, config)
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      if (!(error instanceof Error) || !error.message.startsWith('AI_REQUEST_FAILED:400:')) throw error
    }
  }
  if (lastError || !data) throw lastError ?? new Error('AI_EMPTY_RESPONSE')

  const raw = responseText(data).trim()
  let parsedValue: unknown
  try {
    parsedValue = JSON.parse(raw)
  } catch {
    // 无 response_format 的兼容模式可能包裹 Markdown 代码块，只提取最外层 JSON 对象。
    const jsonObject = raw.match(/\{[\s\S]*\}/)?.[0]
    if (!jsonObject) throw new Error('AI_INVALID_RESPONSE')
    try {
      parsedValue = JSON.parse(jsonObject)
    } catch {
      throw new Error('AI_INVALID_RESPONSE')
    }
  }
  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) throw new Error('AI_INVALID_RESPONSE')
  const parsed = parsedValue as Partial<ParsedBorrowCommand>
  const equipmentIds = new Set(equipment.map((item) => item.id))
  const kitIds = new Set(kits.map((kit) => kit.id))
  const merged = new Map<number, { equipmentId: number; quantity: number; confidence: number }>()
  for (const item of Array.isArray(parsed.equipment) ? parsed.equipment : []) {
    const equipmentId = Number(item.equipmentId)
    const quantity = Number(item.quantity)
    const confidence = Number(item.confidence)
    if (!equipmentIds.has(equipmentId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) continue
    const existing = merged.get(equipmentId)
    merged.set(equipmentId, {
      equipmentId,
      quantity: Math.min(20, (existing?.quantity ?? 0) + quantity),
      confidence: Math.max(existing?.confidence ?? 0, Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5),
    })
  }
  const uniqueKits = new Map<number, { kitId: number; confidence: number }>()
  for (const kit of Array.isArray(parsed.kits) ? parsed.kits : []) {
    const kitId = Number(kit.kitId)
    const confidence = Number(kit.confidence)
    if (!kitIds.has(kitId)) continue
    uniqueKits.set(kitId, { kitId, confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5 })
  }
  return {
    equipment: [...merged.values()],
    kits: [...uniqueKits.values()],
    unresolvedItems: (Array.isArray(parsed.unresolvedItems) ? parsed.unresolvedItems : []).filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 20),
  }
}

let cachedSpeechToken: { token: string; region: string; expiresAt: number } | undefined

export async function getSpeechToken() {
  if (cachedSpeechToken && cachedSpeechToken.expiresAt > Date.now()) return { token: cachedSpeechToken.token, region: cachedSpeechToken.region }
  const key = process.env.AZURE_SPEECH_KEY?.trim()
  const region = process.env.AZURE_SPEECH_REGION?.trim().toLowerCase()
  if (!key || !region) throw new Error('SPEECH_NOT_CONFIGURED')
  if (!/^[a-z0-9-]+$/.test(region)) throw new Error('SPEECH_REGION_INVALID')
  const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Length': '0' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`SPEECH_TOKEN_FAILED:${response.status}`)
  const token = await response.text()
  cachedSpeechToken = { token, region, expiresAt: Date.now() + 8 * 60_000 }
  return { token, region }
}
