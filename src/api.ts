import { borrow, createEquipment, listEquipment, listMembers, listMyBorrowings, registerMember, returnBorrow } from './mockApi'
import type { Equipment, Member } from './types'
// 部署后设 VITE_USE_MOCK_API=false，即改为请求 Azure Functions 的 /api 路由。
const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false'
async function request<T>(path: string, options?: RequestInit): Promise<T> { const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? '请求失败') } return response.json() as Promise<T> }
export const getMembers = (): Promise<Member[]> => useMockApi ? listMembers() : request('/members')
export const createMember = (name: string): Promise<Member> => useMockApi ? registerMember(name) : request('/members', { method: 'POST', body: JSON.stringify({ name }) })
export const getEquipment = (): Promise<Equipment[]> => useMockApi ? listEquipment() : request('/equipment')
export const addEquipment = (input: Pick<Equipment, 'name' | 'category' | 'description' | 'imageUrl'>): Promise<Equipment> => useMockApi ? createEquipment(input) : request('/equipment', { method: 'POST', body: JSON.stringify(input) })
export const getMyBorrowings = (memberId: number): Promise<Equipment[]> => useMockApi ? listMyBorrowings(memberId) : request(`/borrow-records?memberId=${memberId}&active=true`)
export const borrowEquipment = (equipmentId: number, memberId: number) => useMockApi ? borrow(equipmentId, memberId) : request('/borrow', { method: 'POST', body: JSON.stringify({ equipmentId, memberId }) })
export const returnEquipment = (borrowRecordId: number, memberId: number) => useMockApi ? returnBorrow(borrowRecordId, memberId) : request('/return', { method: 'POST', body: JSON.stringify({ borrowRecordId, memberId }) })
