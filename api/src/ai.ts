import { matchBorrowCommandLocally } from './localBorrowMatcher.js'

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

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const callModel = async (body: Record<string, unknown>, config = aiConfig(), attempt = 0): Promise<unknown> => {
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
    // 短暂限流或上游故障通常会很快恢复；有限重试避免用户重复点击。
    if (attempt < 2 && [429, 500, 502, 503, 504].includes(response.status)) {
      await wait(400 * (attempt + 1))
      return callModel(body, config, attempt + 1)
    }
    throw new Error(`AI_REQUEST_FAILED:${response.status}:${detail.slice(0, 300)}`)
  }
  return response.json()
}

const parseModelResponse = (data: unknown): Partial<ParsedBorrowCommand> => {
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
  return parsedValue as Partial<ParsedBorrowCommand>
}

export async function parseBorrowCommand(text: string, equipment: EquipmentInventory[], kits: KitInventory[]): Promise<ParsedBorrowCommand> {
  const localMatch = matchBorrowCommandLocally(text, equipment, kits)
  const hasLocalMatch = localMatch.equipment.length > 0 || localMatch.kits.length > 0
  const localHints = { equipment: localMatch.equipment.map(({ equipmentId, quantity }) => ({ equipmentId, quantity })), kits: localMatch.kits.map(({ kitId }) => ({ kitId })) }
  let parsed: Partial<ParsedBorrowCommand>

  try {
    const config = aiConfig()
    const system = `你是摄影器材借用指令解析器。请遵守以下规则：
1. 只从提供的库存中选择器材或 Kit，不得编造 ID，但匹配目标是高召回率：宁可多返回几个合理候选，也不要漏掉用户可能想借的器材。用户可以在确认清单中删除多余项。
2. 尽可能提取每一个可能的项目；某一项含糊或句子末尾没说完时，仍必须返回其他已匹配项目。只有在库存中完全找不到任何合理候选时，才把该片段放入 unresolvedItems。
3. 忽略“呃、嗯、然后、还有、再拿、帮我拿、拿上”等口语填充或连接词。连续出现的型号和类别也要分别识别。
4. 主动纠正语音识别错误、同音字、近音字、错别字、漏字以及错误断句。匹配时忽略大小写、空格、连字符和品牌省略，例如“1628”可匹配“16-28”，“A7M5”可匹配完整型号，“黑肉滤镜”可推测为库存中的“黑柔滤镜”。监视器、显示器视为监看器；内存卡视为存储卡。
5. 用户可能只说完整型号、型号简称、品牌、类别、品牌加类别、焦段、容量或其他局部特征。必须结合当前库存推测最可能的候选：只说品牌时返回该品牌下的合理候选；只说类别时返回该类别下的合理候选；说“全部、都拿上”时返回对应范围内的全部候选。存在多个相近候选时可以全部返回，并用较低 confidence 表示不确定，不要因为候选不唯一就直接放弃匹配。
6. 只有明确说“套装、Kit、整套”或完整 Kit 名称时才选择 Kit；列举单件器材时不要擅自替换成 Kit。Kit 始终整套借出，不展开为单件。
7. 用户说法与库存不完全一致时，应优先选择名称、类别、品牌、型号、焦段、容量或读音最接近的库存器材。只有完全没有合理候选时才使用 unresolvedItems。默认数量为 1。
8. 本地匹配提示是程序根据名称得到的高可信候选，应保留；但仍需结合用户原话判断数量，且不得因此忽略其他项目。
9. 只返回一个完整 JSON 对象，不要解释，不要使用 Markdown。格式必须是：{"equipment":[{"equipmentId":1,"quantity":1,"confidence":0.95}],"kits":[{"kitId":1,"confidence":0.95}],"unresolvedItems":["无法确定的原话"]}。没有匹配项时对应数组必须为空。

本地匹配提示：${JSON.stringify(localHints)}
单件库存：${JSON.stringify(equipment)}
Kit 库存：${JSON.stringify(kits)}`
  const commonBody = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
    temperature: 0,
    // 部分轻量模型会把内部推理也计入输出上限；复杂的多器材指令需要留出余量。
    ...(config.provider === 'deepseek' ? { max_tokens: 1200 } : { max_completion_tokens: 800 }),
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

    try {
      parsed = parseModelResponse(data)
    } catch (error) {
      if (!(error instanceof Error) || !['AI_EMPTY_RESPONSE', 'AI_INVALID_RESPONSE'].includes(error.message)) throw error
      // 模型偶尔会截断 JSON；自动再生成一次，不让用户手动重复提交。
      const retryData = await callModel({
        ...commonBody,
        messages: [...commonBody.messages, { role: 'user', content: '请重新生成，并且只输出一个完整、有效的 JSON 对象。即使部分内容不确定，也必须保留所有已经确定的项目。' }],
        response_format: { type: 'json_object' },
      }, config)
      parsed = parseModelResponse(retryData)
    }
  } catch (error) {
    if (!hasLocalMatch) throw error
    // 模型服务失败时仍保留本地已经确定的项目，避免整条口述结果丢失。
    return {
      equipment: localMatch.equipment,
      kits: localMatch.kits,
      unresolvedItems: ['部分口述内容未能由 AI 确认，请核对当前清单'],
    }
  }
  const equipmentIds = new Set(equipment.map((item) => item.id))
  const kitIds = new Set(kits.map((kit) => kit.id))
  const merged = new Map(localMatch.equipment.map((item) => [item.equipmentId, item]))
  for (const item of Array.isArray(parsed.equipment) ? parsed.equipment : []) {
    const equipmentId = Number(item.equipmentId)
    const quantity = Number(item.quantity)
    const confidence = Number(item.confidence)
    if (!equipmentIds.has(equipmentId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) continue
    const existing = merged.get(equipmentId)
    merged.set(equipmentId, {
      equipmentId,
      // 本地与 AI 同时命中同一项目时取较大数量，避免重复相加。
      quantity: Math.max(existing?.quantity ?? 0, quantity),
      confidence: Math.max(existing?.confidence ?? 0, Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5),
    })
  }
  const uniqueKits = new Map(localMatch.kits.map((kit) => [kit.kitId, kit]))
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
