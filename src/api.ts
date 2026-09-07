import { borrow, createEquipment, createTask as createMockTask, deleteEquipment as deleteMockEquipment, joinTask as joinMockTask, listBorrowHistory, listEquipment, listMembers, listMyBorrowings, listTasks as listMockTasks, registerMember, returnBorrow, updateTask as updateMockTask } from './mockApi'
import type { BorrowRecord, Equipment, Member, TaskInput, TeamTask } from './types'
// 部署后设 VITE_USE_MOCK_API=false，即改为请求 Azure Functions 的 /api 路由。
const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false'
async function request<T>(path: string, options?: RequestInit): Promise<T> { const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? '请求失败') } return response.json() as Promise<T> }
export const getMembers = (): Promise<Member[]> => useMockApi ? listMembers() : request('/members')
export const createMember = (name: string): Promise<Member> => useMockApi ? registerMember(name) : request('/members', { method: 'POST', body: JSON.stringify({ name }) })
export const getEquipment = (): Promise<Equipment[]> => useMockApi ? listEquipment() : request('/equipment')
export const addEquipment = (input: Pick<Equipment, 'name' | 'category' | 'description' | 'imageUrl'>): Promise<Equipment> => useMockApi ? createEquipment(input) : request('/equipment', { method: 'POST', body: JSON.stringify(input) })
export const deleteEquipment = (id: number): Promise<void> => useMockApi ? deleteMockEquipment(id) : request(`/equipment/${id}`, { method: 'DELETE' })
export const getBorrowHistory = (): Promise<BorrowRecord[]> => useMockApi ? listBorrowHistory() : request('/borrow-records')
export const getMyBorrowings = (memberId: number): Promise<Equipment[]> => useMockApi ? listMyBorrowings(memberId) : request(`/borrow-records?memberId=${memberId}&active=true`)
export const borrowEquipment = (equipmentId: number, memberId: number) => useMockApi ? borrow(equipmentId, memberId) : request('/borrow', { method: 'POST', body: JSON.stringify({ equipmentId, memberId }) })
export const returnEquipment = (borrowRecordId: number, memberId: number) => useMockApi ? returnBorrow(borrowRecordId, memberId) : request('/return', { method: 'POST', body: JSON.stringify({ borrowRecordId, memberId }) })
export const getTasks = (): Promise<TeamTask[]> => useMockApi ? listMockTasks() : request('/tasks')
export const createTask = (input: TaskInput, memberId: number): Promise<TeamTask> => useMockApi ? createMockTask(input, memberId) : request('/tasks', { method: 'POST', body: JSON.stringify({ ...input, memberId }) })
export const updateTask = (id: number, input: TaskInput): Promise<TeamTask> => useMockApi ? updateMockTask(id, input) : request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
export const joinTask = (id: number, memberId: number): Promise<void> => useMockApi ? joinMockTask(id, memberId) : request(`/tasks/${id}/participants`, { method: 'POST', body: JSON.stringify({ memberId }) })
