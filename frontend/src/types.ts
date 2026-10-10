export type User = {
  id: number
  full_name: string
  email: string
  access_role: 'employee' | 'manager' | 'admin'
}

export type SkillGap = {
  skill: string
  current_level: number | null
  required_level: number
  priority: number
  gap: number | null
  category: 'strong' | 'moderate' | 'weak' | 'missing'
  priority_score: number
  explanation: string
}

export type Dashboard = {
  user: { full_name: string; role: string | null }
  orientation: string
  progress_percent: number
  completed_modules: number
  assigned_modules: number
  skill_gaps: SkillGap[]
  latest_assessment: number | null
  next_action: string
  next_action_view: 'assessments' | 'practical' | 'path'
  readiness: {
    score_percent: number | null
    status: 'unassigned' | 'developing' | 'ready'
    method: string
    skills: {
      skill: string
      current_level: number | null
      required_level: number
      gap: number | null
      category: SkillGap['category']
      priority: number
      score_percent: number
      contribution_percent: number
      proficiency_percent: number | null
      assessment_percent: number | null
      practical_percent: number | null
      evidence_count: number
      explanation: string
    }[]
  }
}

export type LearningModule = {
  id: number
  title: string
  description: string
  content: string
  skill: string
  estimated_minutes: number
  position: number
  status: 'assigned' | 'completed'
  is_available: boolean
  recommendation_reason: string
  prerequisites: number[]
}

export type AssessmentQuestion = {
  id: number
  topic: string
  difficulty: string
  prompt: string
  options: string[]
}

export type Source = { document: string; section: string; excerpt: string; similarity: number; url?: string; source_type?: 'web' }

export type PracticalTaskData = {
  id: number
  title: string
  description: string
  instructions: string
  skill_id: number
  checks: { label: string }[]
}

export type ProgressReport = {
  employee: { id: number; name: string }
  overall_progress_percent: number
  skills: SkillGap[]
  assessments: { skill_id: number; score_percent: number; action: string }[]
  practical_tasks: { task_id: number; score_percent: number; passed: boolean }[]
  completed_modules: number
  assigned_modules: number
  next_action: string
}

export type TeamMember = {
  id: number
  full_name: string
  email: string
  job_role: string | null
  progress_percent: number
  latest_assessment: number | null
}
