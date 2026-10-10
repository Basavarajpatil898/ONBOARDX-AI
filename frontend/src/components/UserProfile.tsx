import { Check, Download, Edit3, LockKeyhole, ShieldCheck, Target, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import * as api from '../lib/api'
import type { Dashboard, User } from '../types'

type Preferences = { onboardingEmails: boolean; taskAlerts: boolean; managerReports: boolean; weeklyDigest: boolean }

export default function UserProfile({ user, dashboard, token, onUpdated }: { user: User; dashboard: Dashboard; token: string; onUpdated: (user: User) => void }) {
  const isAdmin = user.access_role === 'admin'
  const [form, setForm] = useState({
    full_name: user.full_name,
    email: user.email,
  })
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const defaults = { onboardingEmails: true, taskAlerts: true, managerReports: false, weeklyDigest: true }
    try {
      const stored = localStorage.getItem(`onboardx-preferences-${user.id}`)
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults
    } catch {
      return defaults
    }
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const initials = user.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'U'

  const strongCount = dashboard.skill_gaps.filter(item => item.category === 'strong').length
  const focusCount = dashboard.skill_gaps.filter(item => item.category !== 'strong').length
  const nextPriority = dashboard.skill_gaps.find(item => item.category !== 'strong')?.skill ?? 'Role onboarding'

  useEffect(() => {
    localStorage.setItem(`onboardx-preferences-${user.id}`, JSON.stringify(preferences))
  }, [user.id, preferences])

  function updateForm(key: 'full_name' | 'email', value: string) {
    setSaved(false)
    setSaveError('')
    setForm(current => ({ ...current, [key]: value }))
  }

  function togglePreference(key: keyof typeof preferences) {
    setPreferences(current => ({ ...current, [key]: !current[key] }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    try {
      const updated = await api.updateProfile(token, form.full_name.trim(), form.email.trim())
      setForm({ full_name: updated.full_name, email: updated.email })
      onUpdated(updated)
      setSaved(true)
    } catch (error) {
      setSaveError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function exportSummary() {
    const summary = isAdmin ? {
      exported_at: new Date().toISOString(),
      profile: { full_name: user.full_name, email: user.email, access_role: user.access_role },
    } : {
      exported_at: new Date().toISOString(),
      profile: { full_name: user.full_name, email: user.email, access_role: user.access_role, job_role: dashboard.user.role },
      progress: { percent: dashboard.progress_percent, completed_modules: dashboard.completed_modules, assigned_modules: dashboard.assigned_modules },
      readiness: dashboard.readiness,
      latest_assessment_percent: dashboard.latest_assessment,
      next_action: dashboard.next_action,
    }
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `onboardx-${isAdmin ? 'admin-profile' : 'summary'}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="user-module">
      <section className="panel user-hero">
        <div className="user-avatar-lg">{initials}</div>
        <div className="user-identity">
          <div className="eyebrow"><span className="eyebrow-dot" /> USER PROFILE</div>
          <h1>{form.full_name || user.full_name}</h1>
          <p>{dashboard.user.role || user.access_role}</p>
        </div>
        <div className="user-actions">
          <button className="button button-outline small-button" onClick={() => document.getElementById('profile-name')?.focus()}><Edit3 size={14} /> Edit profile</button>
          <button className="button button-quiet small-button" onClick={exportSummary}><Download size={14} /> {isAdmin ? 'Export account' : 'Export summary'}</button>
        </div>
        <div className="user-status-pill">
          <ShieldCheck size={14} />
          <span>Secure access</span>
        </div>
      </section>

      <div className="user-grid">
        <section className="panel user-card">
          <div className="section-heading compact-heading">
            <div>
              <div className="eyebrow">ACCOUNT</div>
              <h2>Profile details</h2>
            </div>
          </div>

          <div className="profile-form">
            <label>
              Full name
              <input id="profile-name" autoComplete="name" value={form.full_name} onChange={event => updateForm('full_name', event.target.value)} />
            </label>
            <label>
              Email address
              <input type="email" autoComplete="email" value={form.email} onChange={event => updateForm('email', event.target.value)} />
            </label>
            <label>
              Primary role
              <input value={dashboard.user.role ?? user.access_role} readOnly aria-describedby="role-help" />
              <small id="role-help">Your access role is managed by an administrator.</small>
            </label>
            <button className="button button-primary" onClick={handleSave} disabled={saving || !form.full_name.trim() || !form.email.trim()}>{saving ? 'Saving…' : saved ? <><Check size={15} /> Profile saved</> : 'Save changes'}</button>
            {saveError && <div className="alert alert-error" role="alert">{saveError}</div>}
          </div>
        </section>

        {isAdmin ? <AdminWorkspaceSummary token={token} /> : <section className="panel user-card">
          <div className="section-heading compact-heading">
            <div>
              <div className="eyebrow">READINESS</div>
              <h2>Current status</h2>
            </div>
          </div>

          <div className="readiness-grid">
            <div className="metric-block">
              <span>Progress</span>
              <strong>{dashboard.progress_percent}%</strong>
            </div>
            <div className="metric-block">
              <span>Strong skills</span>
              <strong>{strongCount}</strong>
            </div>
            <div className="metric-block">
              <span>Focus areas</span>
              <strong>{focusCount}</strong>
            </div>
            <div className="metric-block">
              <span>Assessment</span>
              <strong>{dashboard.latest_assessment === null ? '—' : `${Math.round(dashboard.latest_assessment)}%`}</strong>
            </div>
          </div>
        </section>}
      </div>

      <div className="user-bottom-grid">
        <section className="panel user-card">
          <div className="section-heading compact-heading">
            <div>
              <div className="eyebrow">PREFERENCES</div>
              <h2>Notification settings</h2>
              <p className="preference-note">Preferences are saved automatically in this browser.</p>
            </div>
          </div>

          <div className="toggle-list">
            {[
              ['onboardingEmails', 'Onboarding emails'],
              ['taskAlerts', 'Task reminders'],
              ['managerReports', 'Manager progress updates'],
              ['weeklyDigest', 'Weekly digest'],
            ].map(([key, label]) => (
              <button key={key} className="toggle-row" onClick={() => togglePreference(key as keyof typeof preferences)}>
                <span>{label}</span>
                <span className={`toggle-switch ${preferences[key as keyof typeof preferences] ? 'on' : ''}`}>
                  <i />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel user-card">
          <div className="section-heading compact-heading">
            <div>
              <div className="eyebrow">ACCESS</div>
              <h2>Workspace security</h2>
            </div>
          </div>

          <div className="access-list">
            <div className="access-item">
              <div className="detail-icon"><LockKeyhole size={15} /></div>
              <div>
                <strong>{isAdmin ? 'Administrator access' : 'Private workspace'}</strong>
                <small>{isAdmin ? 'Manage employee access, role plans, and organization learning content.' : 'Your onboarding data is restricted to your role and secure access.'}</small>
              </div>
            </div>
            <div className="access-item">
              <div className="detail-icon"><TrendingUp size={15} /></div>
              <div>
                <strong>{isAdmin ? 'Admin follow-up' : 'Next milestone'}</strong>
                <small>{isAdmin ? 'Review employees without an assigned role.' : nextPriority}</small>
              </div>
            </div>
          </div>
        </section>
      </div>

      {!isAdmin && <section className="panel user-card full-width-card">
        <div className="section-heading compact-heading">
          <div>
            <div className="eyebrow">SKILL FOCUS</div>
            <h2>Role readiness snapshot</h2>
          </div>
        </div>

        <div className="focus-list">
          {dashboard.skill_gaps.length === 0 ? (
            <div className="empty-state small-empty">
              <span><Target size={16} /></span>
              <strong>No skill gaps assigned yet</strong>
              <p>Your role requirements will appear here once the administrator completes setup.</p>
            </div>
          ) : (
            dashboard.skill_gaps.map(item => (
              <div key={item.skill} className="focus-item">
                <div>
                  <strong>{item.skill}</strong>
                  <small>{item.category === 'strong' ? 'Meeting role expectations' : item.category === 'weak' ? 'Needs development' : 'Missing requirement'}</small>
                </div>
                <span className={`skill-status ${item.category}`}>{item.category}</span>
              </div>
            ))
          )}
        </div>
      </section>}
    </div>
  )
}

function AdminWorkspaceSummary({ token }: { token: string }) {
  const [metrics, setMetrics] = useState<{ employees: number; unassigned: number; roles: number; learning: number; questions: number; tasks: number; documents: number } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    Promise.all([
      api.getAdminUsers(token), api.getAdminJobRoles(token), api.getAdminModules(token),
      api.getAdminQuestions(token), api.getAdminPracticalTasks(token), api.getPolicies(token),
    ]).then(([users, roles, modules, questions, tasks, documents]) => {
      const employees = users.filter(item => item.access_role === 'employee')
      setMetrics({
        employees: employees.length,
        unassigned: employees.filter(item => item.job_role_id === null).length,
        roles: roles.length,
        learning: modules.length,
        questions: questions.length,
        tasks: tasks.length,
        documents: documents.length,
      })
    }).catch(() => setFailed(true))
  }, [token])

  return <section className="panel user-card">
    <div className="section-heading compact-heading"><div><div className="eyebrow">ADMIN WORKSPACE</div><h2>Organization snapshot</h2></div></div>
    {metrics ? <div className="readiness-grid admin-profile-grid">
      <div className="metric-block"><span>Employees</span><strong>{metrics.employees}</strong></div>
      <div className="metric-block"><span>Need a role</span><strong>{metrics.unassigned}</strong></div>
      <div className="metric-block"><span>Role profiles</span><strong>{metrics.roles}</strong></div>
      <div className="metric-block"><span>Learning modules</span><strong>{metrics.learning}</strong></div>
      <div className="metric-block"><span>Assessment questions</span><strong>{metrics.questions}</strong></div>
      <div className="metric-block"><span>Practical tasks</span><strong>{metrics.tasks}</strong></div>
      <div className="metric-block"><span>Policy documents</span><strong>{metrics.documents}</strong></div>
    </div> : failed ? <p className="preference-note">Organization metrics are temporarily unavailable.</p> : <div className="loading-state"><span>Loading organization metrics…</span></div>}
  </section>
}
