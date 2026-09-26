export type LocalEquipmentInventory = {
  id: number
  name: string
  category: string
  availableQuantity: number
}

export type LocalKitInventory = {
  id: number
  name: string
  itemCount: number
  available: boolean
}

export type LocalBorrowMatch = {
  equipment: { equipmentId: number; quantity: number; confidence: number }[]
  kits: { kitId: number; confidence: number }[]
}

const categoryAliases: Record<string, string[]> = {
  相机: ['相机', '机身'],
  镜头: ['镜头'],
  麦克风: ['麦克风', '话筒'],
  存储卡: ['存储卡', '内存卡'],
  提词器: ['提词器'],
  三脚架: ['三脚架', '脚架'],
  电池: ['电池'],
  滤镜: ['滤镜'],
  监看器: ['监看器', '监视器', '显示器', '监看屏'],
  读卡器: ['读卡器'],
}

const knownBrands = ['sony', 'sigma', 'dji', 'kase', '唯卓仕', '马小路']

export const normalizeBorrowText = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/毫米|mm/g, '')
  .replace(/[\s\-–—_·.,，。；;、/\\:：()（）]+/g, '')

const equipmentAliases = (item: LocalEquipmentInventory) => {
  const aliases = new Set<string>()
  const normalizedName = normalizeBorrowText(item.name)
  aliases.add(normalizedName)

  let withoutBrand = normalizedName
  for (const brand of knownBrands) withoutBrand = withoutBrand.replace(normalizeBorrowText(brand), '')
  if (withoutBrand.length >= 2) aliases.add(withoutBrand)

  // 型号片段在口语中经常省略品牌，例如 A7M5、16-28、DC-A1。
  for (const segment of item.name.split(/\s+/)) {
    const normalized = normalizeBorrowText(segment)
    if (/\d/.test(normalized) && normalized.length >= 2) aliases.add(normalized)
  }

  // 团队口语中常把 A7M5 简称为 M5；计数词“台”与 Kit 名称用于消除歧义。
  const cameraShortName = normalizedName.match(/a\d+(m\d+)/)?.[1]
  if (item.category === '相机' && cameraShortName) aliases.add(cameraShortName)

  if (item.category === '存储卡') {
    if (normalizedName.includes('sd')) aliases.add('sd卡')
    if (normalizedName.includes('cfa')) aliases.add('cfa卡')
    if (normalizedName.includes('cfb')) aliases.add('cfb卡')
  }
  if (item.category === '滤镜') {
    if (normalizedName.includes('黑柔')) aliases.add('黑柔')
    if (normalizedName.includes('nd')) aliases.add('nd滤镜')
    if (normalizedName.includes('cpl')) aliases.add('cpl滤镜')
  }
  for (const alias of categoryAliases[item.category] ?? []) aliases.add(normalizeBorrowText(alias))
  return [...aliases].filter((alias) => alias.length >= 2)
}

const chineseDigit: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

const parseQuantity = (value?: string) => {
  if (!value) return 1
  if (/^\d+$/.test(value)) return Math.max(1, Math.min(20, Number(value)))
  if (value === '十') return 10
  if (value.startsWith('十')) return Math.min(20, 10 + (chineseDigit[value[1]] ?? 0))
  if (value.endsWith('十')) return Math.min(20, (chineseDigit[value[0]] ?? 1) * 10)
  return chineseDigit[value] ?? 1
}

const quantityNear = (text: string, index: number, aliasLength: number) => {
  const counters = '(?:个|件|台|支|块|张|套|片|只|颗|枚)'
  const number = '(\\d{1,2}|十[一二三四五六七八九]?|[一二两三四五六七八九]十?|十)'
  const before = text.slice(Math.max(0, index - 8), index).match(new RegExp(`${number}${counters}?$`))
  if (before) return parseQuantity(before[1])
  const after = text.slice(index + aliasLength, index + aliasLength + 8).match(new RegExp(`^${number}${counters}?`))
  return parseQuantity(after?.[1])
}

const fuzzyAliasIndex = (text: string, alias: string, knownAliases: Map<string, number[]>) => {
  // 只纠正含字母或数字、且长度相同并仅差一个字符的型号，避免普通中文词被过度猜测。
  if (alias.length < 3 || alias.length > 12 || !/[a-z0-9]/.test(alias) || text.length < alias.length) return -1
  for (let index = 0; index <= text.length - alias.length; index += 1) {
    const candidate = text.slice(index, index + alias.length)
    if (knownAliases.has(candidate)) continue
    let differences = 0
    for (let offset = 0; offset < alias.length; offset += 1) {
      if (candidate[offset] !== alias[offset]) differences += 1
      if (differences > 1) break
    }
    if (differences === 1) return index
  }
  return -1
}

export function matchBorrowCommandLocally(text: string, equipment: LocalEquipmentInventory[], kits: LocalKitInventory[]): LocalBorrowMatch {
  const normalizedText = normalizeBorrowText(text)
  const aliasOwners = new Map<string, number[]>()
  const aliasesByEquipment = new Map<number, string[]>()
  for (const item of equipment) {
    const aliases = equipmentAliases(item)
    aliasesByEquipment.set(item.id, aliases)
    for (const alias of aliases) aliasOwners.set(alias, [...(aliasOwners.get(alias) ?? []), item.id])
  }

  const matchedKits = kits.flatMap((kit) => {
    const normalizedName = normalizeBorrowText(kit.name)
    return normalizedName.length >= 2 && normalizedText.includes(normalizedName) ? [{ kitId: kit.id, confidence: 1 }] : []
  })
  const matchedKitNames = kits.filter((kit) => matchedKits.some((match) => match.kitId === kit.id)).map((kit) => normalizeBorrowText(kit.name))

  const matchedEquipment = equipment.flatMap((item) => {
    const aliases = (aliasesByEquipment.get(item.id) ?? [])
      .filter((alias) => aliasOwners.get(alias)?.length === 1)
      .sort((left, right) => right.length - left.length)
    const alias = aliases.find((candidate) => {
      if (!normalizedText.includes(candidate)) return false
      // “m5采访套装”中的 m5 指向 Kit；“一台 M5”仍然指向相机。
      return !matchedKitNames.some((kitName) => kitName.includes(candidate) && normalizedText.includes(kitName))
    })
    if (!alias) return []
    const index = normalizedText.indexOf(alias)
    return [{ equipmentId: item.id, quantity: quantityNear(normalizedText, index, alias.length), confidence: alias === normalizeBorrowText(item.name) ? 1 : 0.94 }]
  })

  const matchedIds = new Set(matchedEquipment.map((item) => item.equipmentId))
  const uncertainEquipment = equipment.flatMap((item) => {
    if (matchedIds.has(item.id)) return []
    const aliases = (aliasesByEquipment.get(item.id) ?? [])
      .filter((alias) => aliasOwners.get(alias)?.length === 1)
      .sort((left, right) => right.length - left.length)
    for (const alias of aliases) {
      const index = fuzzyAliasIndex(normalizedText, alias, aliasOwners)
      if (index >= 0) return [{ equipmentId: item.id, quantity: quantityNear(normalizedText, index, alias.length), confidence: 0.62 }]
    }
    return []
  })

  return { equipment: [...matchedEquipment, ...uncertainEquipment], kits: matchedKits }
}
