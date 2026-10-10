import type { AssessmentQuestion, Dashboard, LearningModule, PracticalTaskData, ProgressReport, Source, TeamMember, User } from '../types'

// A relative path works behind a same-origin reverse proxy in production. Set
// VITE_API_URL only when the API is hosted on a separate origin.
const API_URL = import.meta.env.VITE_API_URL ?? '/api'

function describeApiDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map(item => {
      if (!item || typeof item !== 'object') return ''
      const issue = item as { loc?: unknown[]; msg?: unknown }
      const location = issue.loc?.filter(part => part !== 'body' && part !== 'query' && part !== 'path').join('.')
      return [location, typeof issue.msg === 'string' ? issue.msg : ''].filter(Boolean).join(': ')
    }).filter(Boolean)
    return messages.length ? messages.join(' · ') : undefined
  }
  if (detail && typeof detail === 'object') {
    const value = detail as { message?: unknown; msg?: unknown }
    if (typeof value.message === 'string') return value.message
    if (typeof value.msg === 'string') return value.msg
  }
  return undefined
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Can’t reach ONBOARDX AI. Check your connection or contact your administrator.')
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json() as { detail?: unknown }
      message = describeApiDetail(body.detail) ?? message
    } catch {
      message = `Request failed (${response.status})`
    }
    throw new Error(`${response.status}: ${message}`)
  }
  return response.json() as Promise<T>
}

export function login(email: string, password: string) {
  return request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function adminLogin(email: string, password: string) {
  return request<{ access_token: string; user: User }>('/auth/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}


export function me(token: string) { return request<User>('/me', {}, token) }
export function updateProfile(token: string, full_name: string, email: string) {
  return request<User>('/me/profile', { method: 'PUT', body: JSON.stringify({ full_name, email }) }, token)
}
export function getDashboard(token: string) { return request<Dashboard>('/dashboard', {}, token) }
export function getLearningPath(token: string) { return request<LearningModule[]>('/learning/path', {}, token) }
export function completeModule(token: string, id: number) { return request(`/learning/${id}/complete`, { method: 'POST' }, token) }
export function getCatalog(token: string) { return request<{ roles: { id: number; name: string; description: string }[]; skills: { id: number; name: string }[] }>('/catalog', {}, token) }
export function getQuestions(token: string, skillId: number) { return request<AssessmentQuestion[]>(`/assessments/${skillId}/questions`, {}, token) }
export function submitAssessment(token: string, skillId: number, answers: Record<number, number>) {
  return request<{ score_percent: number; action: string; explanation: string }>(`/assessments/${skillId}/attempt`, { method: 'POST', body: JSON.stringify({ answers }) }, token)
}
export type AdminAssessmentQuestion = {
  id: number; skill_id: number; skill: string; topic: string; difficulty: string
  prompt: string; options: string[]; correct_index: number; explanation: string
}
export function getAdminQuestions(token: string) { return request<AdminAssessmentQuestion[]>('/admin/assessment-questions', {}, token) }
export function createAssessmentQuestion(token: string, question: Omit<AdminAssessmentQuestion, 'id' | 'skill'>) {
  return request<{ id: number; skill_id: number; topic: string }>('/admin/assessment-questions', { method: 'POST', body: JSON.stringify(question) }, token)
}
export type AdminModule = {
  id: number; title: string; description: string; content: string; skill_id: number
  skill: string; estimated_minutes: number; prerequisites: number[]
}
export function getAdminModules(token: string) { return request<AdminModule[]>('/admin/modules', {}, token) }
export function createLearningModule(token: string, module: Omit<AdminModule, 'id' | 'skill'>) {
  return request<{ id: number; title: string; skill_id: number }>('/admin/modules', { method: 'POST', body: JSON.stringify(module) }, token)
}
export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export function ask(token: string, question: string, conversation: ChatTurn[] = []) {
  return request<{ answer: string; sources: Source[] }>('/rag/ask', { method: 'POST', body: JSON.stringify({ question, conversation }) }, token)
}
export type PolicyDocument = { id: number; filename: string; chunk_count: number; sections: { title: string; content: string }[] }
export function getPolicies(token: string) { return request<PolicyDocument[]>('/policies', {}, token) }
export function uploadDocument(token: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<{ id: number; filename: string; status: string; chunks: number }>('/documents/upload', { method: 'POST', body: form }, token)
}
export type AdminDocument = { id: number; filename: string; status: string; chunk_count: number; uploaded_by: string; created_at: string }
export function getAdminDocuments(token: string) { return request<AdminDocument[]>('/admin/documents', {}, token) }
export type AssistantHistoryEntry = { id: number; question: string; answer: string; sources: Source[]; created_at: string }
export function getAdminAssistantHistory(token: string) { return request<AssistantHistoryEntry[]>('/admin/assistant-history', {}, token) }

export function getPracticalTasks(token: string) { return request<PracticalTaskData[]>('/practical-tasks', {}, token) }
export type AdminPracticalTask = {
  id: number; title: string; description: string; instructions: string; skill_id: number
  skill: string; checks: { label: string; path: string; operator: string; value?: unknown }[]
}
export function getAdminPracticalTasks(token: string) { return request<AdminPracticalTask[]>('/admin/practical-tasks', {}, token) }
export function createPracticalTask(token: string, task: Omit<AdminPracticalTask, 'id' | 'skill'>) {
  return request<{ id: number; title: string }>('/admin/practical-tasks', { method: 'POST', body: JSON.stringify(task) }, token)
}
export function getTeam(token: string) { return request<TeamMember[]>('/manager/employees', {}, token) }
export function getEmployeeReport(token: string, employeeId: number) { return request<ProgressReport>(`/manager/employees/${employeeId}/progress`, {}, token) }
export type AdminUser = { id: number; full_name: string; email: string; access_role: User['access_role']; job_role_id: number | null }
export function getAdminUsers(token: string) { return request<AdminUser[]>('/admin/users', {}, token) }
export function createEmployee(token: string, payload: { full_name: string; email: string; password: string; job_role_id: number }) {
  return request<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }, token)
}
export type AdminResetCredential = { id: number; full_name: string; email: string; job_role_id: number | null; temporary_password: string }
export function getEmployeeCredentials(token: string) {
  return request<{ employees: AdminResetCredential[] }>('/admin/users/credentials', {}, token)
}
export function resetEmployeePasswords(token: string) {
  return request<{ employees: AdminResetCredential[] }>(
    '/admin/users/reset-passwords', { method: 'POST' }, token,
  )
}
export function assignJobRole(token: string, userId: number, roleId: number) {
  return request<{ user_id: number; job_role_id: number }>(`/admin/users/${userId}/job-role/${roleId}`, { method: 'PUT' }, token)
}
export type WorkAssignment = {
  id: number; employee_id: number; employee_name: string | null
  assignment_type: 'module' | 'assessment' | 'practical'; target_id: number
  title: string; skill: string; due_at: string | null; note: string; status: 'assigned' | 'completed'; created_at: string
}
export function createWorkAssignments(token: string, payload: { employee_ids: number[]; assignment_type: WorkAssignment['assignment_type']; target_id: number; due_at: string | null; note: string }) {
  return request<{ assignments: WorkAssignment[]; assigned_count: number }>('/admin/assignments', { method: 'POST', body: JSON.stringify(payload) }, token)
}
export function getAdminAssignments(token: string) { return request<WorkAssignment[]>('/admin/assignments', {}, token) }
export function getMyAssignments(token: string) { return request<WorkAssignment[]>('/my/assignments', {}, token) }
export type AdminJobRole = {
  id: number; name: string; description: string
  skills: { id: number; name: string; required_level: number; priority: number }[]
}
export function getAdminJobRoles(token: string) { return request<AdminJobRole[]>('/admin/job-roles', {}, token) }
export function createJobRole(token: string, name: string, description: string) {
  return request<{ id: number; name: string; description: string }>('/admin/job-roles', { method: 'POST', body: JSON.stringify({ name, description }) }, token)
}
export function setJobRoleRequirement(token: string, roleId: number, skillId: number, required_level: number, priority: number) {
  return request(`/admin/job-roles/${roleId}/skills/${skillId}`, { method: 'PUT', body: JSON.stringify({ required_level, priority }) }, token)
}
export function createSkill(token: string, name: string) {
  return request<{ id: number; name: string }>('/admin/skills', { method: 'POST', body: JSON.stringify({ name }) }, token)
}
