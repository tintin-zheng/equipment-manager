export type EquipmentStatus = 'available' | 'borrowed'
export type Member = { id: number; name: string }
export type BorrowRecord = { id: number; equipmentId: number; equipmentName?: string; equipmentCategory?: string; memberId: number; memberName: string; borrowTime: string; returnTime: string | null }
export type Equipment = { id: number; name: string; category: string; status: EquipmentStatus; imageUrl?: string | null; description?: string | null; activeBorrow?: BorrowRecord | null }
