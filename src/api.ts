import { archiveTask as archiveMockTask, borrow, borrowKit as borrowMockKit, createEquipment, createKit as createMockKit, createTask as createMockTask, deleteEquipment as deleteMockEquipment, deleteKit as deleteMockKit, deleteTask as deleteMockTask, joinTask as joinMockTask, leaveTask as leaveMockTask, listBorrowHistory, listEquipment, listKits as listMockKits, listMemberBorrowHistory, listMembers, listMyBorrowings, listTasks as listMockTasks, registerMember, returnBorrow, returnKit as returnMockKit, updateEquipment as updateMockEquipment, updateKit as updateMockKit, updateTask as updateMockTask } from './mockApi'
import type { BorrowRecord, Equipment, EquipmentInput, Kit, KitInput, Member, TaskInput, TeamTask } from './types'
// 部署后设 VITE_USE_MOCK_API=false，即改为请求 Azure Functions 的 /api 路由。
const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false'
async function request<T>(path: string, options?: RequestInit): Promise<T> { const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? '请求失败') } return response.json() as Promise<T> }
export const getMembers = (): Promise<Member[]> => useMockApi ? listMembers() : request('/members')
export const createMember = (name: string): Promise<Member> => useMockApi ? registerMember(name) : request('/members', { method: 'POST', body: JSON.stringify({ name }) })
export const getEquipment = (): Promise<Equipment[]> => useMockApi ? listEquipment() : request('/equipment')
export const addEquipment = (input: EquipmentInput): Promise<Equipment> => useMockApi ? createEquipment(input) : request('/equipment', { method: 'POST', body: JSON.stringify(input) })
export const updateEquipment = (id: number, input: EquipmentInput): Promise<Equipment> => useMockApi ? updateMockEquipment(id, input) : request(`/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
export const getKits = (): Promise<Kit[]> => useMockApi ? listMockKits() : request('/kits')
export const createKit = (input: KitInput): Promise<Kit> => useMockApi ? createMockKit(input) : request('/kits', { method: 'POST', body: JSON.stringify(input) })
export const updateKit = (id: number, input: KitInput): Promise<Kit> => useMockApi ? updateMockKit(id, input) : request(`/kits/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteKit = (id: number): Promise<void> => useMockApi ? deleteMockKit(id) : request(`/kits/${id}`, { method: 'DELETE' })
export const borrowKit = (kitId: number, memberId: number): Promise<void> => useMockApi ? borrowMockKit(kitId, memberId) : request(`/kits/${kitId}/borrow`, { method: 'POST', body: JSON.stringify({ memberId }) })
export const returnKit = (kitBorrowRecordId: number, memberId: number): Promise<void> => useMockApi ? returnMockKit(kitBorrowRecordId, memberId) : request('/kits/return', { method: 'POST', body: JSON.stringify({ kitBorrowRecordId, memberId }) })
export const deleteEquipment = (id: number): Promise<void> => useMockApi ? deleteMockEquipment(id) : request(`/equipment/${id}`, { method: 'DELETE' })
export const getBorrowHistory = (): Promise<BorrowRecord[]> => useMockApi ? listBorrowHistory() : request('/borrow-records')
export const getMemberBorrowHistory = (memberId: number): Promise<BorrowRecord[]> => useMockApi ? listMemberBorrowHistory(memberId) : request(`/borrow-records?memberId=${memberId}`)
export const getMyBorrowings = (memberId: number): Promise<Equipment[]> => useMockApi ? listMyBorrowings(memberId) : request(`/borrow-records?memberId=${memberId}&active=true`)
export const borrowEquipment = (equipmentId: number, memberId: number) => useMockApi ? borrow(equipmentId, memberId) : request('/borrow', { method: 'POST', body: JSON.stringify({ equipmentId, memberId }) })
export const returnEquipment = (borrowRecordId: number, memberId: number) => useMockApi ? returnBorrow(borrowRecordId, memberId) : request('/return', { method: 'POST', body: JSON.stringify({ borrowRecordId, memberId }) })
export const getTasks = (archived = false): Promise<TeamTask[]> => useMockApi ? listMockTasks(archived) : request(`/tasks?archived=${archived}`)
export const createTask = (input: TaskInput, memberId: number): Promise<TeamTask> => useMockApi ? createMockTask(input, memberId) : request('/tasks', { method: 'POST', body: JSON.stringify({ ...input, memberId }) })
export const updateTask = (id: number, input: TaskInput): Promise<TeamTask> => useMockApi ? updateMockTask(id, input) : request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
export const joinTask = (id: number, memberId: number): Promise<void> => useMockApi ? joinMockTask(id, memberId) : request(`/tasks/${id}/participants`, { method: 'POST', body: JSON.stringify({ memberId }) })
export const leaveTask = (id: number, memberId: number): Promise<void> => useMockApi ? leaveMockTask(id, memberId) : request(`/tasks/${id}/participants/${memberId}`, { method: 'DELETE' })
export const archiveTask = (id: number): Promise<void> => useMockApi ? archiveMockTask(id) : request(`/tasks/${id}/archive`, { method: 'POST' })
export const deleteTask = (id: number): Promise<void> => useMockApi ? deleteMockTask(id) : request(`/tasks/${id}`, { method: 'DELETE' })
