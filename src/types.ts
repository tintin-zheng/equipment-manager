export type EquipmentStatus = 'available' | 'borrowed'
export type Member = { id: number; name: string }
export type BorrowRecord = { id: number; equipmentId: number; equipmentName?: string; equipmentCategory?: string; memberId: number; memberName: string; borrowTime: string; returnTime: string | null }
export type Equipment = { id: number; name: string; category: string; status: EquipmentStatus; imageUrl?: string | null; description?: string | null; activeBorrow?: BorrowRecord | null }
export type TaskParticipant = { memberId: number; memberName: string; joinedAt: string }
export type TaskEquipment = { equipmentId: number; equipmentName: string; equipmentCategory: string; memberId: number; memberName: string }
export type TeamTask = { id: number; title: string; taskTime: string | null; location: string | null; note: string | null; createdByName: string | null; createdAt: string; archivedAt: string | null; participants: TaskParticipant[]; equipment: TaskEquipment[] }
export type TaskInput = Pick<TeamTask, 'title' | 'taskTime' | 'location' | 'note'>
