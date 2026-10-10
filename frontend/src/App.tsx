import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Bot, BriefcaseBusiness, Check,
  CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Download, FileText, LayoutDashboard, Search,
  KeyRound, LoaderCircle, LogOut, MessageSquareText, Plus, Send, ShieldCheck, Sparkles,
  Target, Upload, UserRound, X,
} from 'lucide-react'
import * as api from './lib/api'
import UserProfile from './components/UserProfile'
import type { AssessmentQuestion, Dashboard, LearningModule, PracticalTaskData, ProgressReport, Source, TeamMember, User } from './types'
import './App.css'

type View = 'overview' | 'path' | 'work' | 'assessments' | 'practical' | 'assistant' | 'skills' | 'user' | 'team' | 'documents' | 'roles' | 'policies' | 'studio'
type StudioSection = 'roles' | 'learning' | 'assessments' | 'practical' | 'knowledge'
const SkillChart = lazy(() => import('./components/SkillChart'))

const navigation: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'path', label: 'Learning path', icon: BookOpen },
  { id: 'work', label: 'Assigned work', icon: ClipboardCheck },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'practical', label: 'Practical tasks', icon: BriefcaseBusiness },
  { id: 'assistant', label: 'Knowledge assistant', icon: MessageSquareText },
  { id: 'policies', label: 'Company policies', icon: ShieldCheck },
  { id: 'skills', label: 'My skills', icon: Target },
  { id: 'user', label: 'User module', icon: UserRound },
]

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('onboardx-token'))
  const [user, setUser] = useState<User | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [view, setView] = useState<View>('overview')
  const [busy, setBusy] = useState(Boolean(sessionStorage.getItem('onboardx-token')))
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [studioSection, setStudioSection] = useState<StudioSection>('roles')
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    Promise.all([api.me(token), api.getDashboard(token)])
      .then(([currentUser, snapshot]) => {
        if (!active) return
        setUser(currentUser)
        setDashboard(snapshot)
        setError('')
      })
      .catch((reason: Error) => {
        if (!active) return
        setError(reason.message)
        if (reason.message.includes('401')) signOut()
      })
      .finally(() => active && setBusy(false))
    return () => { active = false }
  }, [token, refresh])

  function signOut() {
    sessionStorage.removeItem('onboardx-token')
    setToken(null)
    setUser(null)
    setDashboard(null)
    setView('overview')
  }

  function onAuthenticated(accessToken: string) {
    sessionStorage.setItem('onboardx-token', accessToken)
    setError('')
    setBusy(true)
    setToken(accessToken)
  }

  if (!token || !user) return <AuthScreen onAuthenticated={onAuthenticated} busy={busy} globalError={error} />

  const items: { id: View; label: string; icon: typeof LayoutDashboard }[] = user.access_role === 'admin'
    ? [
        navigation[0],
        { id: 'team' as const, label: 'People & roles', icon: UserRound },
        { id: 'studio' as const, label: 'Content studio', icon: BriefcaseBusiness },
        { ...navigation.find(item => item.id === 'assistant')!, label: 'Employee updates chatbot' },
        { ...navigation.find(item => item.id === 'user')!, label: 'My profile' },
      ]
    : [
        ...navigation,
        ...(user.access_role === 'manager' ? [{ id: 'team' as const, label: 'Team progress', icon: UserRound }] : []),
      ]
  const availableViews = new Set(items.map(item => item.id))
  const visibleView = availableViews.has(view) ? view : 'overview'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => setView('overview')}>
          <span className="brand-mark"><Sparkles size={17} strokeWidth={2.4} /></span>
          <span>onboard<span className="brand-light">x</span><small>PEOPLE DEVELOPMENT</small></span>
        </a>
        <div className="nav-label">{user.access_role === 'admin' ? 'ADMINISTRATION' : 'WORKSPACE'}</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setError('') }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {view === id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={16} /><span>{user.access_role === 'admin' ? <>Admin workspace<br /><small>Manage roles and guidance.</small></> : <>Private workspace<br /><small>Your progress is yours.</small></>}</span></div>
          <div className="profile-row">
            <div className="avatar">{initials(user.full_name)}</div>
            <div className="profile-copy"><strong>{user.full_name}</strong><span>{dashboard?.user.role ?? user.access_role}</span></div>
            <button className="icon-button signout-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Sparkles size={16} /></span>onboard<span className="brand-light">x</span></div>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{items.find(item => item.id === view)?.label}</strong></div>
          <div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><button className="icon-button help-button" title="Help" aria-label="Help" aria-expanded={helpOpen} onClick={() => setHelpOpen(value => !value)}><CircleHelp size={18} /></button></div>
        </header>

        {helpOpen && user && <section className="help-panel" aria-label="Workspace help"><div><strong>How can we help?</strong><p>{user.access_role === 'admin' ? 'Set up roles and learning content, add employees, or ask the assistant about team progress.' : 'Follow your learning path, check your skills, or ask the assistant about company guidance.'}</p></div><div className="help-actions">{(user.access_role === 'admin' ? [{ label: 'People & roles', target: 'team' as View }, { label: 'Content studio', target: 'studio' as View }, { label: 'Ask assistant', target: 'assistant' as View }] : [{ label: 'Learning path', target: 'path' as View }, { label: 'Company policies', target: 'policies' as View }, { label: 'Ask assistant', target: 'assistant' as View }]).map(item => <button key={item.target} className="text-button" onClick={() => { setView(item.target); setHelpOpen(false); setError('') }}>{item.label}<ArrowRight size={14} /></button>)}</div><button className="icon-button help-close" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={16} /></button></section>}

        {error && <div className="alert alert-error" role="alert"><X size={17} /><span>{error}</span><button aria-label="Dismiss" onClick={() => setError('')}><X size={15} /></button></div>}
        {busy ? <LoadingState /> : (
          <div className={`page-content page-${view}`}>
            {visibleView === 'overview' && dashboard && (user.access_role === 'admin'
              ? <AdminOverview token={token} openStudio={section => { setStudioSection(section); setView('studio') }} openTeam={() => setView('team')} openAssistant={() => setView('assistant')} onError={setError} />
              : <Overview dashboard={dashboard} token={token} openView={setView} onError={setError} />)}
            {visibleView === 'studio' && user.access_role === 'admin' && <AdminStudio token={token} section={studioSection} onSection={setStudioSection} onError={setError} />}
            {visibleView === 'path' && <LearningPath token={token} onError={setError} onComplete={() => setRefresh(value => value + 1)} />}
            {visibleView === 'work' && <MyAssignments token={token} openView={setView} onError={setError} />}
            {visibleView === 'assessments' && <Assessments token={token} onError={setError} onResult={() => setRefresh(value => value + 1)} />}
            {visibleView === 'practical' && <PracticalTasks token={token} onError={setError} />}
            {visibleView === 'assistant' && <Assistant token={token} isAdmin={user.access_role === 'admin'} onError={setError} />}
            {visibleView === 'policies' && <Policies token={token} isAdmin={user.access_role === 'admin'} onManage={() => setView('studio')} onError={setError} />}
            {visibleView === 'skills' && dashboard && <Skills dashboard={dashboard} />}
            {visibleView === 'user' && dashboard && <UserProfile user={user} dashboard={dashboard} token={token} onUpdated={updated => { setUser(updated); setDashboard(current => current ? { ...current, user: { ...current.user, full_name: updated.full_name } } : current) }} />}
            {visibleView === 'team' && (user.access_role === 'manager' || user.access_role === 'admin') && <Team token={token} isAdmin={user.access_role === 'admin'} onError={setError} />}
            {visibleView === 'roles' && user.access_role === 'admin' && <JobRoles token={token} onError={setError} />}
            {visibleView === 'documents' && user.access_role === 'admin' && <Documents token={token} onError={setError} />}
          </div>
        )}
      </main>
    </div>
  )
}

function AuthScreen({ onAuthenticated, busy, globalError }: { onAuthenticated: (token: string) => void; busy: boolean; globalError: string }) {
  const [portal, setPortal] = useState<'employee' | 'admin'>('employee')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = portal === 'admin'
        ? await api.adminLogin(email.trim(), password)
        : await api.login(email.trim(), password)
      onAuthenticated(result.access_token)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not authenticate.'
      setError(message.includes('401')
        ? 'Email or password is incorrect. Employees must use an account created by an administrator; administrators must use the credentials provisioned for this workspace.'
        : message.includes('403: This account')
          ? 'This account is not an administrator. Switch to Employee sign in.'
          : message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand auth-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>onboard<span className="brand-light">x</span></span></div>
        <div className="story-copy"><div className="eyebrow light-eyebrow">A BETTER FIRST DAY STARTS HERE</div><h1>Build confidence.<br />One skill at a time.</h1><p>A personal onboarding workspace that meets you where you are, and helps you get where you need to be.</p></div>
        <div className="story-footer"><div className="story-line" /><span>Learn with purpose. Grow with clarity.</span></div>
      </section>
      <section className="auth-panel">
        <div className={`auth-card ${portal === 'admin' ? 'admin-auth-card' : ''}`}>
          <div className="auth-mode-switch" role="group" aria-label="Choose sign-in portal">
            <button type="button" className={portal === 'employee' ? 'selected' : ''} onClick={() => { setPortal('employee'); setError('') }}>Employee</button>
            <button type="button" className={portal === 'admin' ? 'selected' : ''} onClick={() => { setPortal('admin'); setError('') }}>Administrator</button>
          </div>
          <div className="eyebrow">{portal === 'admin' ? 'ADMINISTRATOR ACCESS' : 'YOUR WORKSPACE'}</div>
          <h2>{portal === 'admin' ? 'Admin sign in' : 'Employee sign in'}</h2>
          <p className="auth-subtitle">{portal === 'admin' ? 'Sign in to manage employee accounts, role assignments, learning plans, and organization knowledge.' : 'Sign in to continue your onboarding journey. Ask your administrator to create an account if you don’t have one yet.'}</p>
          {(error || globalError) && <div className="alert alert-error auth-error" role="alert">{error || globalError}</div>}
          <form className="auth-form" onSubmit={submit}>
            <label>Work email<input autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" type="email" value={email} onChange={event => setEmail(event.target.value)} onPaste={event => { event.preventDefault(); setEmail(event.clipboardData.getData('text').trim()) }} placeholder="you@company.com" required /></label>
            <label>Password<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
            <button className="button button-primary auth-submit" disabled={loading || busy}>{loading || busy ? <LoaderCircle className="spin" size={17} /> : null}Sign in<ArrowRight size={17} /></button>
          </form>
          <div className="auth-security"><ShieldCheck size={15} /> {portal === 'admin' ? 'Administrator access is provisioned by your organization.' : 'Employee accounts are created by an administrator.'}</div>
        </div>
      </section>
    </div>
  )
}

function Overview({ dashboard, token, openView, onError }: { dashboard: Dashboard; token: string; openView: (view: View) => void; onError: (message: string) => void }) {
  const chartData = dashboard.skill_gaps.slice(0, 6).map(gap => ({ name: gap.skill, current: gap.current_level ?? 0, target: gap.required_level }))
  const remaining = dashboard.skill_gaps.filter(gap => gap.category !== 'strong').length
  const [modules, setModules] = useState<LearningModule[]>([])
  useEffect(() => { api.getLearningPath(token).then(setModules).catch(error => onError(error.message)) }, [token, onError])
  return (
    <>
      <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR ONBOARDING, IN FOCUS</div><h1>Good to see you, {dashboard.user.full_name.split(' ')[0]}<span className="greeting-period">.</span></h1><p className="welcome-copy">{dashboard.orientation}</p></div><button className="button button-outline" onClick={() => openView('assistant')}><Bot size={17} /> Ask your assistant</button></div>
      <section className="summary-grid" aria-label="Onboarding summary">
        <article className="summary-card progress-summary"><div className="summary-top"><span>ONBOARDING PROGRESS</span><Activity size={16} /></div><div className="summary-main"><strong>{dashboard.progress_percent}<small>%</small></strong><span>{dashboard.completed_modules} of {dashboard.assigned_modules} modules complete</span></div><div className="progress-track"><span style={{ width: `${dashboard.progress_percent}%` }} /></div><div className="summary-foot"><span>{dashboard.assigned_modules ? 'Keep your momentum going' : 'Your learning path is being prepared'}</span><ArrowUpRight size={15} /></div></article>
        <article className="summary-card gap-summary"><div className="summary-top"><span>ROLE READINESS</span><Target size={16} /></div><div className="summary-main"><strong>{dashboard.readiness.score_percent === null ? '—' : `${Math.round(dashboard.readiness.score_percent)}%`}</strong><span>{dashboard.readiness.status === 'unassigned' ? 'Role requirements needed' : dashboard.readiness.status === 'ready' ? 'All role skills evidenced' : `${remaining} skills to develop`}</span></div><div className="summary-foot"><span>{dashboard.skill_gaps.filter(gap => gap.category === 'strong').length} of {dashboard.skill_gaps.length} skills on target</span><button onClick={() => openView('skills')}>Why this score <ArrowRight size={14} /></button></div></article>
        <article className="summary-card assessment-summary"><div className="summary-top"><span>LATEST ASSESSMENT</span><ClipboardCheck size={16} /></div><div className="summary-main"><strong>{dashboard.latest_assessment === null ? '—' : `${Math.round(dashboard.latest_assessment)}%`}</strong><span>{dashboard.latest_assessment === null ? 'No attempts recorded yet' : 'Most recent result'}</span></div><div className="summary-foot"><span>Check your understanding as you learn</span><button onClick={() => openView('assessments')}>Assess <ArrowRight size={14} /></button></div></article>
      </section>
      <section className="focus-strip"><div className="focus-icon"><ArrowDownRight size={19} /></div><div className="focus-copy"><span>NEXT BEST STEP</span><strong>{dashboard.next_action}</strong></div><button className="button button-dark" onClick={() => openView(dashboard.next_action_view)}>Continue <ArrowRight size={16} /></button></section>
      <div className="overview-columns">
        <section className="panel chart-panel"><div className="section-heading"><div><div className="eyebrow">SKILL MATRIX</div><h2>Current level vs. role target</h2></div><button className="text-button" onClick={() => openView('skills')}>Full breakdown <ArrowRight size={15} /></button></div>
          {chartData.length ? <><div className="chart-legend"><span><i className="legend-current" /> Current level</span><span><i className="legend-target" /> Role target</span></div><Suspense fallback={<div className="chart-wrap" />}><SkillChart data={chartData} /></Suspense><div className="chart-scale"><span>LEVEL 0</span><span>PROFICIENCY SCALE · 0 TO 5</span><span>LEVEL 5</span></div></> : <EmptyState title="No role profile yet" text="Your administrator will assign the skills required for your role." />}
        </section>
        <section className="panel path-preview"><div className="section-heading"><div><div className="eyebrow">YOUR PLAN</div><h2>Learning journey</h2></div><button className="icon-button" title="Open learning path" aria-label="Open learning path" onClick={() => openView('path')}><ArrowRight size={17} /></button></div><div className="path-preview-list">{modules.length ? modules.slice(0, 4).map((module, index) => <div className={`path-node ${module.status === 'completed' ? 'done' : module.is_available ? 'current' : 'locked'}`} key={module.id}><span>{module.status === 'completed' ? <Check size={14} /> : module.is_available ? '●' : '○'}</span><div><strong>{module.title}</strong><small>{module.status === 'completed' ? 'Completed' : module.is_available ? `${module.skill} · ready to start` : 'Prerequisite required'}</small></div>{index < Math.min(modules.length, 4) - 1 && <i className="journey-connector" />}</div>) : <EmptyState title="No modules assigned" text="Your learning journey appears when your role has learning modules." />}</div><button className="button button-quiet full-button" onClick={() => openView('path')}>View your learning path <ArrowRight size={16} /></button></section>
      </div>
      <div className="page-footnote"><ShieldCheck size={14} /> Your learning recommendations are based on role requirements and your actual assessment results.</div>
    </>
  )
}

function AdminOverview({ token, openStudio, openTeam, openAssistant, onError }: { token: string; openStudio: (section: StudioSection) => void; openTeam: () => void; openAssistant: () => void; onError: (message: string) => void }) {
  const [counts, setCounts] = useState<{ roles: number; modules: number; questions: number; tasks: number; documents: number; people: number; assigned: number } | null>(null)
  useEffect(() => {
    Promise.all([
      api.getAdminJobRoles(token), api.getAdminModules(token), api.getAdminQuestions(token),
      api.getAdminPracticalTasks(token), api.getPolicies(token), api.getTeam(token),
    ]).then(([roles, modules, questions, tasks, documents, people]) => setCounts({
      roles: roles.length, modules: modules.length, questions: questions.length,
      tasks: tasks.length, documents: documents.length, people: people.length,
      assigned: people.filter(person => person.job_role !== null).length,
    })).catch(error => onError((error as Error).message))
  }, [token, onError])

  const resources: { section: StudioSection | 'team'; label: string; detail: string; count: number | undefined; icon: typeof BriefcaseBusiness }[] = [
    { section: 'team', label: 'Employees', detail: `${counts?.assigned ?? '—'} with a role assigned`, count: counts?.people, icon: UserRound },
    { section: 'roles', label: 'Job roles', detail: 'Skill targets and role profiles', count: counts?.roles, icon: BriefcaseBusiness },
    { section: 'learning', label: 'Learning modules', detail: 'Content for employee learning paths', count: counts?.modules, icon: BookOpen },
    { section: 'assessments', label: 'Assessment questions', detail: 'Scored knowledge checks by skill', count: counts?.questions, icon: ClipboardCheck },
    { section: 'practical', label: 'Practical tasks', detail: 'Structured activities with clear checks', count: counts?.tasks, icon: Target },
    { section: 'knowledge', label: 'Documents & policies', detail: 'Trusted references for employee answers', count: counts?.documents, icon: FileText },
  ]

  return <PageHeading eyebrow="ADMINISTRATION" title="Admin overview" subtitle="Manage people, role plans, learning content, assessments, and company guidance.">
    <section className="admin-overview-hero panel"><div><span className="eyebrow"><span className="eyebrow-dot" /> PEOPLE AND CONTENT OPERATIONS</span><h2>Keep onboarding organized</h2><p>Assign employees to role plans, publish learning activities, and maintain trusted company references.</p></div><div className="admin-hero-actions"><button className="button button-outline" onClick={openTeam}><UserRound size={16} /> Manage employees</button><button className="button button-primary" onClick={openAssistant}><MessageSquareText size={16} /> Chat about employee updates <ArrowRight size={16} /></button></div></section>
    <div className="admin-resource-grid">{resources.map(({ section, label, detail, count, icon: Icon }) => <button key={section} className="admin-resource-card panel" onClick={() => section === 'team' ? openTeam() : openStudio(section)}><span className="admin-resource-icon"><Icon size={18} /></span><span className="admin-resource-copy"><strong>{label}</strong><small>{detail}</small></span><span className="admin-resource-count">{count ?? '—'}</span><ChevronRight size={16} className="admin-resource-arrow" /></button>)}</div>
    <section className="admin-overview-foot panel"><div><div className="eyebrow">CONTENT GOVERNANCE</div><h2>Keep company guidance current</h2><p>Review published references and upload approved documents employees can use in policies and knowledge answers.</p></div><button className="button button-outline" onClick={() => openStudio('knowledge')}>Manage references <ArrowRight size={15} /></button></section>
  </PageHeading>
}

const studioTabs: { id: StudioSection; label: string; icon: typeof BriefcaseBusiness }[] = [
  { id: 'roles', label: 'Roles', icon: BriefcaseBusiness },
  { id: 'learning', label: 'Learning paths', icon: BookOpen },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'practical', label: 'Practical tasks', icon: Target },
  { id: 'knowledge', label: 'Docs & policies', icon: FileText },
]

function AdminStudio({ token, section, onSection, onError }: { token: string; section: StudioSection; onSection: (section: StudioSection) => void; onError: (message: string) => void }) {
  return <div className="admin-studio"><div className="studio-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ADMIN CONTENT</div><h1>Admin studio</h1><p>One reference for role plans, learning content, assessments, practical work, and company guidance.</p></div></div>
    <nav className="studio-tabs panel" aria-label="Admin content sections">{studioTabs.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'selected' : ''} onClick={() => onSection(id)}><Icon size={16} />{label}</button>)}</nav>
    {section === 'roles' && <JobRoles token={token} onError={onError} />}
    {section === 'learning' && <AdminLearning token={token} onError={onError} />}
    {section === 'assessments' && <AdminAssessments token={token} onError={onError} />}
    {section === 'practical' && <AdminPractical token={token} onError={onError} />}
    {section === 'knowledge' && <div className="studio-knowledge"><Documents token={token} onError={onError} /><Policies token={token} isAdmin onManage={() => window.scrollTo({ top: 0, behavior: 'smooth' })} onError={onError} /></div>}
  </div>
}

function AdminLearning({ token, onError }: { token: string; onError: (message: string) => void }) {
  const [roles, setRoles] = useState<api.AdminJobRole[]>([])
  const [modules, setModules] = useState<api.AdminModule[]>([])
  const [roleId, setRoleId] = useState('')
  const [skillId, setSkillId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [minutes, setMinutes] = useState('20')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const selectedRole = roles.find(role => role.id === Number(roleId))
  const availableSkills = selectedRole ? selectedRole.skills : []

  async function refreshModules() { setModules(await api.getAdminModules(token)) }
  useEffect(() => {
    Promise.all([api.getAdminJobRoles(token), api.getAdminModules(token)]).then(([roleRows, moduleRows]) => {
      setRoles(roleRows); setModules(moduleRows); setRoleId(String(roleRows[0]?.id ?? ''))
    }).catch(error => onError((error as Error).message)).finally(() => setLoading(false))
  }, [token, onError])
  function chooseRole(value: string) {
    setRoleId(value)
    setSkillId(String(roles.find(role => role.id === Number(value))?.skills[0]?.id ?? ''))
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice('')
    try {
      await api.createLearningModule(token, { title: title.trim(), description: description.trim(), content: content.trim(), skill_id: Number(skillId), estimated_minutes: Number(minutes), prerequisites: [] })
      await refreshModules(); setTitle(''); setDescription(''); setContent(''); setNotice('Learning module added to the catalog. Employees with this skill in their role plan will see it in their learning path.')
    } catch (error) { onError((error as Error).message) }
    finally { setSaving(false) }
  }

  return <PageHeading eyebrow="ROLE-BASED DEVELOPMENT" title="Learning path content" subtitle="Create skill-linked modules. Employees see relevant modules when their assigned role includes the skill.">
    {loading ? <LoadingState /> : <div className="studio-workspace"><form className="studio-form panel" onSubmit={submit}><div className="section-heading"><div><div className="eyebrow">NEW MODULE</div><h2>Build a learning activity</h2></div></div>
      <label>ROLE CONTEXT<select value={roleId} onChange={event => chooseRole(event.target.value)} required disabled={loading || roles.length === 0}><option value="">{loading ? 'Loading roles…' : roles.length ? 'Choose a role' : 'Create a role in the Roles tab first'}</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name} · {role.skills.length} skills</option>)}</select></label>
      <label>LINKED SKILL<select value={skillId} onChange={event => setSkillId(event.target.value)} required disabled={!selectedRole || availableSkills.length === 0}><option value="">{!selectedRole ? 'Choose a role first' : availableSkills.length ? 'Choose a required skill' : 'Add skill requirements to this role first'}</option>{availableSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      {selectedRole && availableSkills.length === 0 && <p className="studio-field-hint">This role needs at least one skill requirement before a linked learning activity can appear in employee paths. Add one in the Roles tab.</p>}
      <label>TITLE<input value={title} onChange={event => setTitle(event.target.value)} minLength={2} maxLength={160} required placeholder="e.g. Writing clear acceptance criteria" /></label>
      <label>SHORT DESCRIPTION<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} placeholder="What will the learner practice?" /></label>
      <label>LEARNING CONTENT<textarea rows={7} value={content} onChange={event => setContent(event.target.value)} maxLength={30000} placeholder="Explain the concept, give examples, and describe a practice activity." /></label>
      <label>ESTIMATED MINUTES<input type="number" min="1" max="600" value={minutes} onChange={event => setMinutes(event.target.value)} required /></label>
      <button className="button button-primary" disabled={saving || !skillId || title.trim().length < 2}>{saving ? 'Saving module…' : <><Plus size={15} /> Add to learning paths</>}</button>{notice && <p className="studio-notice" role="status">{notice}</p>}
    </form><section className="studio-list panel"><div className="section-heading"><div><div className="eyebrow">LEARNING LIBRARY</div><h2>{modules.length} modules</h2></div></div>{modules.length ? modules.map(module => <article className="studio-list-item" key={module.id}><span className="studio-item-icon"><BookOpen size={16} /></span><div><strong>{module.title}</strong><small>{module.skill} · {module.estimated_minutes} min</small><p>{module.description || 'No description added.'}</p></div></article>) : <EmptyState title="No modules yet" text="Create the first learning module to populate role-based paths." />}</section></div>}
  </PageHeading>
}

function AdminAssessments({ token, onError }: { token: string; onError: (message: string) => void }) {
  const [skills, setSkills] = useState<{ id: number; name: string }[]>([])
  const [questions, setQuestions] = useState<api.AdminAssessmentQuestion[]>([])
  const [skillId, setSkillId] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<'foundation' | 'intermediate' | 'advanced'>('foundation')
  const [prompt, setPrompt] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [correctIndex, setCorrectIndex] = useState('0')
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  async function refreshQuestions() { setQuestions(await api.getAdminQuestions(token)) }
  useEffect(() => { Promise.all([api.getCatalog(token), api.getAdminQuestions(token)]).then(([catalog, rows]) => { setSkills(catalog.skills); setQuestions(rows); setSkillId(String(catalog.skills[0]?.id ?? '')) }).catch(error => onError((error as Error).message)).finally(() => setLoading(false)) }, [token, onError])
  const options = optionsText.split('\n').map(value => value.trim()).filter(Boolean)
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice('')
    try {
      await api.createAssessmentQuestion(token, { skill_id: Number(skillId), topic: topic.trim(), difficulty, prompt: prompt.trim(), options, correct_index: Number(correctIndex), explanation: explanation.trim() })
      await refreshQuestions(); setTopic(''); setPrompt(''); setOptionsText(''); setCorrectIndex('0'); setExplanation(''); setNotice('Assessment question published for this skill.')
    } catch (error) { onError((error as Error).message) }
    finally { setSaving(false) }
  }
  const filtered = questions.filter(question => !skillId || question.skill_id === Number(skillId))
  return <PageHeading eyebrow="ASSESSMENT DESIGN" title="Assessment question bank" subtitle="Add scored questions by skill. Every question needs at least two options and one correct answer.">
    {loading ? <LoadingState /> : <div className="studio-workspace"><form className="studio-form panel" onSubmit={submit}><div className="section-heading"><div><div className="eyebrow">NEW QUESTION</div><h2>Write a knowledge check</h2></div></div>
      <label>SKILL<select value={skillId} onChange={event => setSkillId(event.target.value)} required disabled={loading || skills.length === 0}><option value="">{loading ? 'Loading skills…' : skills.length ? 'Choose a skill' : 'Create a role skill first'}</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      <label>TOPIC<input value={topic} onChange={event => setTopic(event.target.value)} minLength={2} maxLength={100} required placeholder="e.g. Request validation" /></label>
      <label>LEVEL<select value={difficulty} onChange={event => setDifficulty(event.target.value as typeof difficulty)}><option value="foundation">Foundation</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
      <label>QUESTION<textarea rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} minLength={3} maxLength={2000} required placeholder="Write a clear, single-focus question." /></label>
      <label>ANSWER OPTIONS · ONE PER LINE<textarea rows={4} value={optionsText} onChange={event => { setOptionsText(event.target.value); setCorrectIndex('0') }} placeholder={'A Pydantic schema\nA CSS selector\nA SQL index\nA JWT signature'} required /></label>
      <label>CORRECT ANSWER<select value={correctIndex} onChange={event => setCorrectIndex(event.target.value)} required>{options.map((option, index) => <option key={`${index}-${option}`} value={index}>{index + 1}. {option}</option>)}</select></label>
      <label>EXPLANATION<textarea rows={2} value={explanation} onChange={event => setExplanation(event.target.value)} maxLength={2000} placeholder="Explain why the answer is correct." /></label>
      <button className="button button-primary" disabled={saving || !skillId || options.length < 2 || Number(correctIndex) >= options.length}>{saving ? 'Publishing…' : <><Plus size={15} /> Add question</>}</button>{notice && <p className="studio-notice" role="status">{notice}</p>}
    </form><section className="studio-list panel"><div className="section-heading"><div><div className="eyebrow">QUESTION BANK</div><h2>{filtered.length} questions</h2></div></div>{filtered.length ? filtered.map(question => <article className="studio-list-item" key={question.id}><span className="studio-item-icon"><ClipboardCheck size={16} /></span><div><strong>{question.prompt}</strong><small>{question.skill} · {question.topic} · {question.difficulty}</small><p>Correct answer: {question.options[question.correct_index]}{question.explanation ? ` · ${question.explanation}` : ''}</p></div></article>) : <EmptyState title="No questions for this skill" text="Add a question to make this skill assessable." />}</section></div>}
  </PageHeading>
}

function AdminPractical({ token, onError }: { token: string; onError: (message: string) => void }) {
  const initialChecks = '[\n  {"label":"Result includes a status","path":"status","operator":"exists"}\n]'
  const [skills, setSkills] = useState<{ id: number; name: string }[]>([])
  const [tasks, setTasks] = useState<api.AdminPracticalTask[]>([])
  const [skillId, setSkillId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [checksText, setChecksText] = useState(initialChecks)
  const [checksError, setChecksError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  async function refreshTasks() { setTasks(await api.getAdminPracticalTasks(token)) }
  useEffect(() => { Promise.all([api.getCatalog(token), api.getAdminPracticalTasks(token)]).then(([catalog, rows]) => { setSkills(catalog.skills); setTasks(rows); setSkillId(String(catalog.skills[0]?.id ?? '')) }).catch(error => onError((error as Error).message)).finally(() => setLoading(false)) }, [token, onError])
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice(''); setChecksError('')
    let checks: api.AdminPracticalTask['checks']
    try { checks = JSON.parse(checksText) as api.AdminPracticalTask['checks']; if (!Array.isArray(checks) || checks.length === 0) throw new Error('Add at least one evaluation check.') }
    catch (error) { setChecksError(error instanceof Error ? error.message : 'Checks must be valid JSON.'); setSaving(false); return }
    try {
      await api.createPracticalTask(token, { skill_id: Number(skillId), title: title.trim(), description: description.trim(), instructions: instructions.trim(), checks })
      await refreshTasks(); setTitle(''); setDescription(''); setInstructions(''); setChecksText(initialChecks); setNotice('Practical task published to the employee task library.')
    } catch (error) { onError((error as Error).message) }
    finally { setSaving(false) }
  }
  return <PageHeading eyebrow="APPLIED SKILL PRACTICE" title="Practical task library" subtitle="Create hands-on exercises with clear instructions and consistent evaluation checks.">
    {loading ? <LoadingState /> : <div className="studio-workspace"><form className="studio-form panel" onSubmit={submit}><div className="section-heading"><div><div className="eyebrow">NEW TASK</div><h2>Design a practical exercise</h2></div></div>
      <label>SKILL<select value={skillId} onChange={event => setSkillId(event.target.value)} required disabled={loading || skills.length === 0}><option value="">{loading ? 'Loading skills…' : skills.length ? 'Choose a skill' : 'Create a role skill first'}</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      <label>TITLE<input value={title} onChange={event => setTitle(event.target.value)} minLength={2} maxLength={160} required placeholder="e.g. Validate an API response" /></label>
      <label>SUMMARY<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} placeholder="What is the learner asked to demonstrate?" /></label>
      <label>INSTRUCTIONS<textarea rows={4} value={instructions} onChange={event => setInstructions(event.target.value)} maxLength={5000} required placeholder="Explain what the learner should do and include an example if helpful." /></label>
      <label>EVALUATION CHECKS · JSON<textarea className="code-textarea" rows={9} value={checksText} onChange={event => setChecksText(event.target.value)} required spellCheck={false} /></label>
      <p className="studio-field-hint">Checks support equals, exists, type_is, and contains. Use label, path, operator, and value.</p>
      {checksError && <p className="studio-form-error" role="alert">{checksError}</p>}
      <button className="button button-primary" disabled={saving || !skillId || title.trim().length < 2}>{saving ? 'Publishing…' : <><Plus size={15} /> Add practical task</>}</button>{notice && <p className="studio-notice" role="status">{notice}</p>}
    </form><section className="studio-list panel"><div className="section-heading"><div><div className="eyebrow">PUBLISHED TASKS</div><h2>{tasks.length} activities</h2></div></div>{tasks.length ? tasks.map(task => <article className="studio-list-item" key={task.id}><span className="studio-item-icon"><Target size={16} /></span><div><strong>{task.title}</strong><small>{task.skill} · {task.checks.length} checks</small><p>{task.description}</p></div></article>) : <EmptyState title="No practical tasks yet" text="Create an exercise to let employees demonstrate applied skills." />}</section></div>}
  </PageHeading>
}

function MyAssignments({ token, openView, onError }: { token: string; openView: (view: View) => void; onError: (message: string) => void }) {
  const [assignments, setAssignments] = useState<api.WorkAssignment[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.getMyAssignments(token).then(setAssignments).catch(error => onError((error as Error).message)).finally(() => setLoading(false)) }, [token, onError])
  const destination: Record<api.WorkAssignment['assignment_type'], View> = { module: 'path', assessment: 'assessments', practical: 'practical' }
  const pending = assignments.filter(item => item.status !== 'completed')
  return <PageHeading eyebrow="YOUR NEXT STEPS" title="Assigned work" subtitle="Work your administrator has specifically assigned to you, with deadlines and guidance.">
    {loading ? <LoadingState /> : assignments.length ? <><div className="work-summary-strip panel"><div><strong>{pending.length}</strong><span>items to complete</span></div><div><strong>{assignments.length - pending.length}</strong><span>completed</span></div><p>Complete an item in its learning, assessment, or practical task page. Progress updates here automatically.</p></div><div className="assigned-work-list">{assignments.map(item => <article className={`assigned-work-card panel ${item.status === 'completed' ? 'is-complete' : ''}`} key={item.id}><div className="assigned-work-icon">{item.assignment_type === 'module' ? <BookOpen size={18} /> : item.assignment_type === 'assessment' ? <ClipboardCheck size={18} /> : <BriefcaseBusiness size={18} />}</div><div className="assigned-work-content"><div className="assigned-work-meta"><span>{item.assignment_type === 'module' ? 'LEARNING MODULE' : item.assignment_type === 'assessment' ? 'SKILL QUIZ' : 'PRACTICAL TASK'}</span><span className={`assigned-work-status ${item.status}`}>{item.status === 'completed' ? 'Completed' : 'To do'}</span></div><h2>{item.title}</h2><p>{item.skill}{item.due_at ? ` · Due ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.due_at))}` : ''}</p>{item.note && <blockquote>{item.note}</blockquote>}<button className={item.status === 'completed' ? 'button button-quiet' : 'button button-primary'} onClick={() => openView(destination[item.assignment_type])}>{item.status === 'completed' ? 'Review work' : 'Open assignment'}<ArrowRight size={15} /></button></div></article>)}</div></> : <EmptyState title="Nothing assigned just yet" text="When your administrator assigns a module, skill quiz, or practical task, it will appear here." />}
  </PageHeading>
}

function LearningPath({ token, onError, onComplete }: { token: string; onError: (message: string) => void; onComplete: () => void }) {
  const [modules, setModules] = useState<LearningModule[]>([])
  const [selected, setSelected] = useState<LearningModule | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.getLearningPath(token).then(setModules).catch(error => onError(error.message)).finally(() => setLoading(false)) }, [token, onError])
  async function complete(module: LearningModule) {
    setSaving(true)
    try { await api.completeModule(token, module.id); setModules(values => values.map(item => item.id === module.id ? { ...item, status: 'completed' } : item)); setSelected(null); onComplete() }
    catch (error) { onError((error as Error).message) }
    finally { setSaving(false) }
  }
  return <PageHeading eyebrow="YOUR DEVELOPMENT PLAN" title="Learning path" subtitle="A role-focused sequence, ordered around your skill evidence and module prerequisites.">{loading ? <LoadingState /> : modules.length === 0 ? <EmptyState title="Your path is taking shape" text="Once a job role and its skill requirements are assigned, your learning modules will appear here." /> : <div className="learning-layout"><div className="module-list">{modules.map((module, index) => <button key={module.id} className={`module-row ${selected?.id === module.id ? 'selected' : ''}`} onClick={() => setSelected(module)}><span className={`module-number ${module.status === 'completed' ? 'is-done' : ''}`}>{module.status === 'completed' ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><span className="module-info"><strong>{module.title}</strong><small>{module.skill} · {module.estimated_minutes} min</small></span><span className={`status-pill ${module.status === 'completed' ? 'completed' : module.is_available ? 'assigned' : 'locked'}`}>{module.status === 'completed' ? 'Complete' : module.is_available ? 'Up next' : 'Locked'}</span><ChevronRight size={17} className="module-chevron" /></button>)}</div><section className="module-detail panel">{selected ? <><div className="eyebrow">MODULE {String(selected.position).padStart(2, '0')} · {selected.skill.toUpperCase()}</div><h2>{selected.title}</h2><p className="module-description">{selected.description}</p><div className="recommendation-reason"><Target size={15} /><span>{selected.recommendation_reason}</span></div><div className="module-content">{selected.content}</div><div className="module-detail-bottom"><span><BookOpen size={15} /> {selected.estimated_minutes} minute module</span><button className="button button-primary" disabled={saving || selected.status === 'completed' || !selected.is_available} onClick={() => complete(selected)}>{selected.status === 'completed' ? <><CheckCircle2 size={16} /> Completed</> : !selected.is_available ? 'Complete prerequisites first' : <>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Mark complete</>}</button></div></> : <EmptyState title="Choose a module" text="Select a learning activity to review its material and completion status." />}</section></div>}</PageHeading>
}

function Assessments({ token, onError, onResult }: { token: string; onError: (message: string) => void; onResult: () => void }) {
  const [catalog, setCatalog] = useState<{ id: number; name: string }[]>([])
  const [skillId, setSkillId] = useState('')
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<{ score_percent: number; action: string; explanation: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => { api.getCatalog(token).then(data => setCatalog(data.skills)).catch(error => onError(error.message)) }, [token, onError])
  async function loadQuestions(id: string) {
    setSkillId(id); setAnswers({}); setResult(null); setLoading(true)
    try { setQuestions(await api.getQuestions(token, Number(id))) }
    catch (error) { onError((error as Error).message) }
    finally { setLoading(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try { setResult(await api.submitAssessment(token, Number(skillId), answers)); onResult() }
    catch (error) { onError((error as Error).message) }
    finally { setSubmitting(false) }
  }
  return <PageHeading eyebrow="CHECK YOUR UNDERSTANDING" title="Assessments" subtitle="Short, scored checks help shape what you practice next."><div className="assessment-toolbar"><label htmlFor="assessment-skill">SKILL</label><select id="assessment-skill" value={skillId} onChange={event => loadQuestions(event.target.value)}><option value="">Choose a skill</option>{catalog.map(skill => <option value={skill.id} key={skill.id}>{skill.name}</option>)}</select><span className="toolbar-note"><ShieldCheck size={14} /> Scored consistently, every time</span></div>{loading ? <LoadingState /> : result ? <div className="result-panel panel"><span className={`result-icon ${result.action}`}><CheckCircle2 size={24} /></span><div className="eyebrow">ASSESSMENT RESULT</div><div className="result-score">{Math.round(result.score_percent)}<small>%</small></div><h2>{result.action === 'advanced' ? 'Ready for advanced content' : result.action === 'practice' ? 'Practice will strengthen this' : 'Let’s revisit the foundations'}</h2><p>{result.explanation}</p><button className="button button-outline" onClick={() => { setResult(null); setAnswers({}) }}>Try again <ArrowRight size={16} /></button></div> : questions.length ? <form className="question-form" onSubmit={submit}><div className="question-meta"><span>{questions.length} questions</span><span>Choose one answer for each</span></div>{questions.map((question, index) => <fieldset className="question-card" key={question.id}><legend><span>{String(index + 1).padStart(2, '0')}</span>{question.prompt}</legend><div className="answer-options">{question.options.map((option, optionIndex) => <label className={`answer-option ${answers[question.id] === optionIndex ? 'chosen' : ''}`} key={option}><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === optionIndex} onChange={() => setAnswers(value => ({ ...value, [question.id]: optionIndex }))} /><span className="option-marker" />{option}</label>)}</div></fieldset>)}<button className="button button-primary" disabled={submitting || Object.keys(answers).length !== questions.length}>{submitting ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Submit assessment</button></form> : <EmptyState title={skillId ? 'No questions available yet' : 'Choose a skill to begin'} text={skillId ? 'Your administrator can add an assessment for this skill.' : 'Questions and scoring come from the onboarding knowledge base.'} />}</PageHeading>
}

function Assistant({ token, isAdmin, onError }: { token: string; isAdmin: boolean; onError: (message: string) => void }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{ question: string; answer?: string; sources?: Source[] }[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!isAdmin) return
    api.getAdminAssistantHistory(token).then(history => setMessages(history.reverse().map(item => ({ question: item.question, answer: item.answer, sources: item.sources }))))
      .catch(error => onError((error as Error).message))
  }, [token, isAdmin, onError])
  async function ask(event: FormEvent) {
    event.preventDefault()
    const value = question.trim()
    if (!value || loading) return
    setQuestion(''); setLoading(true); setMessages(items => [...items, { question: value }])
    try {
      const conversation = messages.filter(item => item.answer).slice(-4).flatMap(item => [
        { role: 'user' as const, content: item.question },
        { role: 'assistant' as const, content: item.answer! },
      ])
      const response = await api.ask(token, value, conversation)
      setMessages(items => items.map((item, index) => index === items.length - 1 ? { ...item, ...response } : item))
    } catch (error) { onError((error as Error).message); setQuestion(value); setMessages(items => items.filter(item => item.answer || item.question !== value)) }
    finally { setLoading(false) }
  }
  const title = isAdmin ? 'Employee updates chatbot' : 'Learning and task assistant'
  const example = isAdmin
    ? 'Try “Summarize Rahul Sharma’s progress,” “Who on my team needs support?” or “What is a 30-60-90 day plan?”'
    : 'Ask “What should I submit for the practical task?” or “Explain this learning module in simple steps.”'
  const description = isAdmin
    ? 'Ask about employee skill levels, assessment results, readiness, and progress—or ask general questions. Employee updates use live records; current-information answers can include web sources.'
    : 'Ask about company guidance, learning modules, and task instructions—or ask general questions. Company-specific answers use available references; current-information answers can include web sources. You can also ask about your own progress.'
  const placeholder = isAdmin ? 'Ask about an employee update or any general question…' : 'Ask about a module, task, or company guidance…'
  return <PageHeading eyebrow={isAdmin ? 'PEOPLE INSIGHTS' : 'YOUR LEARNING HELPER'} title={title} subtitle={description}><div className="assistant-layout"><div className="assistant-intro"><div className="assistant-emblem"><Bot size={23} /></div><div><strong>{title}</strong><p>{description}</p></div></div><div className="chat-history">{messages.length === 0 ? <div className="chat-empty"><MessageSquareText size={24} /><strong>What would you like to know?</strong><span>{example}</span></div> : messages.map((message, index) => <div className="message-pair" key={`${message.question}-${index}`}><div className="user-message"><span className="avatar small-avatar">{initials('You')}</span><p>{message.question}</p></div>{message.answer ? <div className="assistant-message"><span className="assistant-mini"><Sparkles size={14} /></span><div><p>{message.answer}</p>{message.sources?.length ? <div className="source-list"><span className="source-label">SOURCES</span>{message.sources.map((source, sourceIndex) => <div className="source-item" key={`${source.document}-${sourceIndex}`}><FileText size={14} /><div><strong>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.document}</a> : source.document}</strong><small>{source.section}{source.source_type === 'web' ? ' · Web source' : ` · ${Math.round(source.similarity * 100)}% match`}</small><p>{source.excerpt}</p></div></div>)}</div> : <div className="no-source-note"><CircleHelp size={14} /> Answer uses general knowledge; no company reference matched.</div>}</div></div> : <div className="thinking"><LoaderCircle className="spin" size={15} /> {isAdmin ? 'Checking employee records…' : 'Searching references and preparing an answer…'}</div>}</div>)}</div><form className="chat-composer" onSubmit={ask}><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder={placeholder} rows={2} minLength={3} maxLength={2000} /><div className="composer-bottom"><span>{question.trim().length < 3 ? 'Enter at least 3 characters' : `${question.trim().length} / 2,000 · Company answers include source references`}</span><button className="button button-dark" aria-label="Send question" disabled={question.trim().length < 3 || loading}><Send size={16} /> Ask</button></div></form></div></PageHeading>
}

function PracticalTasks({ token, onError }: { token: string; onError: (message: string) => void }) {
  const [tasks, setTasks] = useState<PracticalTaskData[]>([])
  const [selected, setSelected] = useState<PracticalTaskData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.getPracticalTasks(token).then(setTasks).catch(error => onError(error.message)).finally(() => setLoading(false)) }, [token, onError])
  function selectTask(task: PracticalTaskData) {
    setSelected(task)
  }
  return <PageHeading eyebrow="PRACTICE ACTIVITIES" title="Practical tasks" subtitle="Browse activities and read the instructions for each one.">{loading ? <LoadingState /> : tasks.length === 0 ? <EmptyState title="No practical tasks yet" text="Practical activities assigned to your role will appear here." /> : <div className="learning-layout"><div className="module-list">{tasks.map(task => <button key={task.id} className={`module-row ${selected?.id === task.id ? 'selected' : ''}`} onClick={() => selectTask(task)}><span className="module-number"><BookOpen size={14} /></span><span className="module-info"><strong>{task.title}</strong><small>Read activity</small></span><ChevronRight size={17} className="module-chevron" /></button>)}</div><section className="module-detail panel">{selected ? <><div className="eyebrow">ACTIVITY INSTRUCTIONS</div><h2>{selected.title}</h2>{selected.description && <p className="module-description">{selected.description}</p>}<div className="module-content">{selected.instructions || 'No instructions are available for this activity yet.'}</div></> : <EmptyState title="Choose an activity" text="Select a practical task to read its instructions." />}</section></div>}</PageHeading>
}

function Team({ token, isAdmin, onError }: { token: string; isAdmin: boolean; onError: (message: string) => void }) {
  const demoTeam: TeamMember[] = [
    { id: -1, full_name: 'Alex Morgan', email: 'alex.morgan@example.invalid', job_role: 'Customer Success Associate', progress_percent: 68, latest_assessment: 84 },
    { id: -2, full_name: 'Jordan Lee', email: 'jordan.lee@example.invalid', job_role: 'People Operations Coordinator', progress_percent: 42, latest_assessment: 72 },
    { id: -3, full_name: 'Sam Taylor', email: 'sam.taylor@example.invalid', job_role: 'Product Support Specialist', progress_percent: 91, latest_assessment: 93 },
  ]
  const [team, setTeam] = useState<TeamMember[]>([])
  const [report, setReport] = useState<ProgressReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<api.AdminUser[]>([])
  const [roles, setRoles] = useState<api.AdminJobRole[]>([])
  const [availableModules, setAvailableModules] = useState<api.AdminModule[]>([])
  const [availableTasks, setAvailableTasks] = useState<api.AdminPracticalTask[]>([])
  const [quizQuestions, setQuizQuestions] = useState<api.AdminAssessmentQuestion[]>([])
  const [assignments, setAssignments] = useState<api.WorkAssignment[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignmentNotice, setAssignmentNotice] = useState('')
  const [newEmployee, setNewEmployee] = useState({ full_name: '', email: '', password: '', job_role_id: '' })
  const [creatingEmployee, setCreatingEmployee] = useState(false)
  const [createNotice, setCreateNotice] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ full_name: string; email: string; password: string } | null>(null)
  const [resetCredentials, setResetCredentials] = useState<api.AdminResetCredential[] | null>(null)
  const [resettingPasswords, setResettingPasswords] = useState(false)
  const [assignmentEmployees, setAssignmentEmployees] = useState<number[]>([])
  const [assignmentType, setAssignmentType] = useState<api.WorkAssignment['assignment_type']>('module')
  const [assignmentTargetId, setAssignmentTargetId] = useState('')
  const [assignmentDueAt, setAssignmentDueAt] = useState('')
  const [assignmentNote, setAssignmentNote] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [workAssignmentNotice, setWorkAssignmentNotice] = useState('')
  useEffect(() => {
    const load = isAdmin
      ? Promise.all([api.getTeam(token), api.getAdminUsers(token), api.getAdminJobRoles(token), api.getEmployeeCredentials(token), api.getAdminModules(token), api.getAdminPracticalTasks(token), api.getAdminQuestions(token), api.getAdminAssignments(token)]).then(([members, adminUsers, jobRoles, credentials, modules, practicalTasks, questions, currentAssignments]) => {
          setTeam(members)
          setUsers(adminUsers.filter(item => item.access_role === 'employee'))
          setRoles(jobRoles)
          setResetCredentials(credentials.employees)
          setAvailableModules(modules)
          setAvailableTasks(practicalTasks)
          setQuizQuestions(questions)
          setAssignments(currentAssignments)
        })
      : api.getTeam(token).then(setTeam)
    load.catch(error => onError(error.message)).finally(() => setLoading(false))
  }, [token, onError, isAdmin])
  async function assignWork(event: FormEvent) {
    event.preventDefault()
    if (!employeeId || !roleId) return
    setAssigning(true)
    setAssignmentNotice('')
    try {
      await api.assignJobRole(token, Number(employeeId), Number(roleId))
      const selectedRole = roles.find(role => role.id === Number(roleId))
      const selectedEmployee = users.find(item => item.id === Number(employeeId))
      setTeam(await api.getTeam(token))
      setUsers(current => current.map(item => item.id === Number(employeeId) ? { ...item, job_role_id: Number(roleId) } : item))
      setAssignmentNotice(`Learning plan saved for ${selectedEmployee?.full_name ?? 'the employee'}${selectedRole ? ` · ${selectedRole.name}` : ''}.`)
    } catch (error) { onError((error as Error).message) }
    finally { setAssigning(false) }
  }
  async function submitSpecificAssignment(event: FormEvent) {
    event.preventDefault()
    if (!assignmentEmployees.length || !assignmentTargetId) return
    setSavingAssignment(true)
    setWorkAssignmentNotice('')
    try {
      const result = await api.createWorkAssignments(token, {
        employee_ids: assignmentEmployees,
        assignment_type: assignmentType,
        target_id: Number(assignmentTargetId),
        due_at: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
        note: assignmentNote.trim(),
      })
      setAssignments(current => [...result.assignments, ...current.filter(existing => !result.assignments.some(saved => saved.id === existing.id))])
      setWorkAssignmentNotice(`Assigned to ${result.assigned_count} employee${result.assigned_count === 1 ? '' : 's'}. Their assigned-work list is now updated.`)
      setAssignmentNote('')
    } catch (error) { onError((error as Error).message) }
    finally { setSavingAssignment(false) }
  }
  async function createEmployee(event: FormEvent) {
    event.preventDefault()
    if (!newEmployee.job_role_id) return
    setCreatingEmployee(true)
    setCreateNotice('')
    setCreatedCredentials(null)
    try {
      const created = await api.createEmployee(token, {
        full_name: newEmployee.full_name,
        email: newEmployee.email,
        password: newEmployee.password,
        job_role_id: Number(newEmployee.job_role_id),
      })
      const [members, adminUsers] = await Promise.all([api.getTeam(token), api.getAdminUsers(token)])
      setTeam(members)
      setUsers(adminUsers.filter(item => item.access_role === 'employee'))
      setCreateNotice(`${created.full_name} can now sign in with the assigned learning plan.`)
      setCreatedCredentials({ full_name: created.full_name, email: created.email, password: newEmployee.password })
      setNewEmployee({ full_name: '', email: '', password: '', job_role_id: '' })
    } catch (error) { onError((error as Error).message) }
    finally { setCreatingEmployee(false) }
  }
  function downloadCredentials() {
    if (!createdCredentials) return
    const content = [
      'ONBOARDX AI — Employee sign-in details',
      '',
      `Name: ${createdCredentials.full_name}`,
      `Email: ${createdCredentials.email}`,
      `Initial password: ${createdCredentials.password}`,
      '',
      'Share these details privately. Delete this file after sharing.',
    ].join('\n')
    const blobUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = `onboardx-employee-${createdCredentials.email.replace(/[^a-z0-9.-]/gi, '-')}-credentials.txt`
    anchor.click()
    URL.revokeObjectURL(blobUrl)
  }
  function downloadEmployeeRoster(credentials: api.AdminResetCredential[]) {
    const columns = ['Employee name', 'Gmail / work email', 'Assigned learning role', 'Temporary password']
    const escapeCell = (value: string) => {
      const safeValue = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value
      return `"${safeValue.replace(/"/g, '""')}"`
    }
    const rows = credentials.map(employee => [
      employee.full_name,
      employee.email,
      roles.find(role => role.id === employee.job_role_id)?.name ?? 'Unassigned',
      employee.temporary_password,
    ])
    const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n')
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = 'onboardx-employee-accounts.csv'
    anchor.click()
    URL.revokeObjectURL(blobUrl)
  }
  async function resetAndDownloadEmployeeCredentials() {
    setResettingPasswords(true)
    setResetCredentials(null)
    try {
      const result = await api.resetEmployeePasswords(token)
      setResetCredentials(result.employees)
      downloadEmployeeRoster(result.employees)
    } catch (error) { onError((error as Error).message) }
    finally { setResettingPasswords(false) }
  }
  async function openReport(employee: TeamMember) {
    try { setReport(await api.getEmployeeReport(token, employee.id)) }
    catch (error) { onError((error as Error).message) }
  }
  const selectedEmployee = users.find(item => item.id === Number(employeeId))
  const selectedRole = roles.find(role => role.id === Number(roleId))
  const currentRole = roles.find(role => role.id === selectedEmployee?.job_role_id)
  const quizTargets = [...new Map(quizQuestions.map(question => [question.skill_id, { id: question.skill_id, title: `${question.skill} quiz`, detail: `${quizQuestions.filter(item => item.skill_id === question.skill_id).length} questions` }])).values()]
  const assignmentTargets = assignmentType === 'module'
    ? availableModules.map(module => ({ id: module.id, title: module.title, detail: `${module.skill} · ${module.estimated_minutes} min` }))
    : assignmentType === 'assessment'
      ? quizTargets
      : availableTasks.map(task => ({ id: task.id, title: task.title, detail: task.skill }))
  function planPreview(role: api.AdminJobRole) {
    const skillNames = new Set(role.skills.map(skill => skill.name))
    const modules = availableModules.filter(module => skillNames.has(module.skill))
    const tasks = availableTasks.filter(task => skillNames.has(task.skill))
    const estimatedMinutes = modules.reduce((total, module) => total + module.estimated_minutes, 0)
    const prioritizedSkills = [...role.skills].sort((a, b) => b.priority - a.priority || a.required_level - b.required_level).slice(0, 3)
    return <div className="assignment-plan-preview"><div className="assignment-plan-stats"><span><strong>{modules.length}</strong> learning modules</span><span><strong>{tasks.length}</strong> related practice activities</span><span><strong>{estimatedMinutes < 60 ? `${estimatedMinutes}m` : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`}</strong> learning time</span></div>{prioritizedSkills.length > 0 && <p><strong>Focus first:</strong> {prioritizedSkills.map(skill => `${skill.name} (priority ${skill.priority})`).join(' · ')}</p>}{modules.length ? <div><strong>Included modules</strong><ul>{modules.slice(0, 4).map(module => <li key={module.id}>{module.title} · {module.skill}</li>)}</ul>{modules.length > 4 && <small>And {modules.length - 4} more</small>}</div> : <p className="assignment-warning">No learning modules match this role’s skills yet. Add skill modules in Content studio.</p>}{tasks.length ? <div><strong>Related practical activities</strong><ul>{tasks.slice(0, 3).map(task => <li key={task.id}>{task.title} · {task.skill}</li>)}</ul><small>These activities are available in the task library; they are not assigned individually.</small>{tasks.length > 3 && <small>And {tasks.length - 3} more</small>}</div> : <p>No practical activities match these skills yet.</p>}</div>
  }
  const showingDemo = import.meta.env.DEV && team.length === 0
  const displayedTeam = team.length ? team : showingDemo ? demoTeam : []

  return <PageHeading eyebrow={isAdmin ? 'ADMINISTRATION' : 'MANAGER WORKSPACE'} title={isAdmin ? 'People & roles' : 'Team progress'} subtitle={isAdmin ? 'Create employee logins with a learning plan, update roles, and review progress.' : 'Review learning completion, skills, assessments, and practical readiness for assigned employees.'}>{loading ? <LoadingState /> : report ? <div className="report-view"><button className="text-button" onClick={() => setReport(null)}>← Back to team</button><div className="report-header"><div><div className="eyebrow">EMPLOYEE REPORT</div><h2>{report.employee.name}</h2></div><div className="report-progress"><strong>{report.overall_progress_percent}%</strong><span>onboarding complete</span></div></div><div className="report-summary"><span>{report.completed_modules} / {report.assigned_modules} modules</span><span>{report.assessments.length} assessments</span><span>{report.practical_tasks.filter(task => task.passed).length} practical passes</span></div><h3>Skill profile</h3><div className="report-skills">{report.skills.map(skill => <div key={skill.skill}><strong>{skill.skill}</strong><span>{skill.current_level ?? '—'} / {skill.required_level}</span><small>{skill.category} · {skill.explanation}</small></div>)}</div><div className="report-next"><span className="eyebrow">NEXT RECOMMENDATION</span><strong>{report.next_action}</strong></div></div> : <>{isAdmin && <>
  <form className="employee-create-panel panel" onSubmit={createEmployee}>
    <div className="assignment-intro"><span className="eyebrow">NEW EMPLOYEE</span><h2>Create an account with assigned work</h2><p>The employee account will be created with the selected learning role and its learning plan. Share the initial password with them privately.</p></div>
    <label>FULL NAME<input value={newEmployee.full_name} onChange={event => setNewEmployee(value => ({ ...value, full_name: event.target.value }))} autoComplete="name" minLength={2} maxLength={120} required placeholder="Employee name" /></label>
    <label>WORK EMAIL<input type="email" value={newEmployee.email} onChange={event => setNewEmployee(value => ({ ...value, email: event.target.value }))} autoComplete="email" maxLength={254} required placeholder="name@company.com" /></label>
    <label>INITIAL PASSWORD<input type="password" value={newEmployee.password} onChange={event => setNewEmployee(value => ({ ...value, password: event.target.value }))} autoComplete="new-password" minLength={12} maxLength={128} required placeholder="At least 12 characters" /><small className="form-hint">Use at least 12 characters and share it privately.</small></label>
    <label>LEARNING ROLE<select value={newEmployee.job_role_id} onChange={event => setNewEmployee(value => ({ ...value, job_role_id: event.target.value }))} required><option value="">Choose a role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    {roles.find(role => role.id === Number(newEmployee.job_role_id)) && <div className="assignment-preview"><strong>What this employee will receive</strong>{planPreview(roles.find(role => role.id === Number(newEmployee.job_role_id))!)}</div>}
    <button className="button button-primary" disabled={creatingEmployee || roles.length === 0}>{creatingEmployee ? 'Creating account…' : 'Create account & assign learning plan'}</button>
    {createNotice && <p className="assignment-notice" role="status">{createNotice}</p>}
    {createdCredentials && <div className="created-credentials" role="status"><div><strong>Account created — save these sign-in details</strong><span><b>Name</b> {createdCredentials.full_name}</span><span><b>Email</b> {createdCredentials.email}</span><span><b>Initial password</b> <code>{createdCredentials.password}</code></span><small>The password is shown only now and cannot be retrieved later. Share it privately.</small></div><button className="button button-outline" type="button" onClick={downloadCredentials}><Download size={16} /> Download credentials</button></div>}
    {roles.length === 0 && <p className="assignment-hint">Create a job role and add skill requirements first.</p>}
  </form>
  <form className="assignment-panel panel" onSubmit={assignWork}>
    <div className="assignment-intro"><span className="eyebrow">ROLE-BASED LEARNING</span><h2>Set an employee’s learning plan</h2><p>Choose a learning role. ONBOARDX builds the employee’s path from that role’s required skills and matching modules.</p></div>
    <label>EMPLOYEE<select value={employeeId} onChange={event => { const id = event.target.value; setEmployeeId(id); setRoleId(String(users.find(item => item.id === Number(id))?.job_role_id ?? '')) }} required><option value="">Choose an employee</option>{users.map(item => <option key={item.id} value={item.id}>{item.full_name} · {item.email}</option>)}</select></label>
    <label>LEARNING ROLE<select value={roleId} onChange={event => setRoleId(event.target.value)} required><option value="">Choose a role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    <button className="button button-primary" disabled={assigning || !employeeId || !roleId || selectedEmployee?.job_role_id === Number(roleId)}>{assigning ? 'Saving plan…' : selectedEmployee?.job_role_id === Number(roleId) ? 'Role already assigned' : selectedEmployee?.job_role_id ? 'Save role change' : 'Assign learning plan'}</button>
    {(selectedEmployee || selectedRole) && <div className="assignment-preview">
      {selectedEmployee && <p><strong>Current role:</strong> {currentRole?.name ?? (selectedEmployee.job_role_id ? 'Loading current role…' : 'None assigned yet')}</p>}
      {selectedRole ? <><p><strong>New learning role:</strong> {selectedRole.name}</p>{selectedRole.skills.length ? <><div className="assignment-skill-list"><strong>Skills that shape this plan</strong><div>{selectedRole.skills.map(skill => <span key={skill.id}>{skill.name}<small>Target {skill.required_level}/5 · Priority {skill.priority}</small></span>)}</div></div>{planPreview(selectedRole)}</> : <p className="assignment-warning">This role has no skill requirements yet, so it won’t produce a skill-based learning path. Add requirements under Job roles first.</p>}</> : <p>Choose a learning role to preview its required skills.</p>}
      {selectedEmployee?.job_role_id && selectedRole && selectedEmployee.job_role_id !== selectedRole.id && <p className="assignment-warning">Saving will change this employee’s learning role. Completed work remains recorded.</p>}
    </div>}
    <p className="assignment-help"><strong>Need to assign one specific item?</strong> Use the assignment form below to give selected employees a module, quiz, or practical task with a due date.</p>
    {assignmentNotice && <p className="assignment-notice" role="status">{assignmentNotice}</p>}
    {users.length === 0 && <p className="assignment-hint">No employee accounts yet. Create one in the form above to assign a learning plan.</p>}
    {roles.length === 0 && <p className="assignment-hint">Create a job role and add skill requirements before assigning a learning plan.</p>}
  </form>
  <form className="specific-assignment-panel panel" onSubmit={submitSpecificAssignment}>
    <div className="assignment-intro"><span className="eyebrow">TARGETED WORK</span><h2>Assign a module, quiz, or practical task</h2><p>Choose one or more employees, then select a published item. Due dates and notes appear in each employee’s Assigned work page.</p></div>
    <fieldset className="assignment-employee-picker"><legend>EMPLOYEES</legend>{users.length ? users.map(employee => <label key={employee.id}><input type="checkbox" checked={assignmentEmployees.includes(employee.id)} onChange={event => setAssignmentEmployees(current => event.target.checked ? [...current, employee.id] : current.filter(id => id !== employee.id))} /><span><strong>{employee.full_name}</strong><small>{employee.email}</small></span></label>) : <p>Create employee accounts above before assigning work.</p>}</fieldset>
    <div className="specific-assignment-controls"><label>WORK TYPE<select value={assignmentType} onChange={event => { setAssignmentType(event.target.value as api.WorkAssignment['assignment_type']); setAssignmentTargetId('') }}><option value="module">Learning module</option><option value="assessment">Skill quiz</option><option value="practical">Practical task</option></select></label><label>ITEM<select value={assignmentTargetId} onChange={event => setAssignmentTargetId(event.target.value)} required><option value="">Choose an item</option>{assignmentTargets.map(item => <option key={item.id} value={item.id}>{item.title} · {item.detail}</option>)}</select></label><label>DUE DATE (OPTIONAL)<input type="datetime-local" value={assignmentDueAt} onChange={event => setAssignmentDueAt(event.target.value)} /></label><label>NOTE FOR EMPLOYEES (OPTIONAL)<input value={assignmentNote} onChange={event => setAssignmentNote(event.target.value)} maxLength={1000} placeholder="Add context or what to focus on" /></label><button className="button button-primary" disabled={savingAssignment || assignmentEmployees.length === 0 || !assignmentTargetId}>{savingAssignment ? 'Assigning…' : <><ClipboardCheck size={16} /> Assign work</>}</button></div>
    {assignmentTargets.length === 0 && <p className="assignment-hint">No items of this type are published yet. Add them in Content studio first.</p>}
    {workAssignmentNotice && <p className="assignment-notice" role="status">{workAssignmentNotice}</p>}
  </form>
  <section className="admin-assignments-list panel"><div className="section-heading"><div><div className="eyebrow">RECENT ASSIGNMENTS</div><h2>Work sent to employees</h2></div><span>{assignments.length} total</span></div>{assignments.length ? assignments.slice(0, 8).map(item => <div className="admin-assignment-row" key={item.id}><div><strong>{item.title}</strong><small>{item.employee_name} · {item.assignment_type} · {item.skill}{item.due_at ? ` · Due ${new Date(item.due_at).toLocaleDateString()}` : ''}</small></div><span className={`assigned-work-status ${item.status}`}>{item.status === 'completed' ? 'Completed' : 'Assigned'}</span></div>) : <p className="assignment-hint">Assignments you create will appear here.</p>}</section>
  </>} {isAdmin && <div className="employee-roster-toolbar"><div><strong>{resetCredentials?.length ? `Saved credentials · ${resetCredentials.length} employees` : `Employee accounts · ${users.length}`}</strong><small>Passwords are encrypted at rest and visible only to administrators. Keep downloads private.</small></div><div className="employee-roster-actions">{resetCredentials?.length ? <button className="button button-outline" type="button" onClick={() => downloadEmployeeRoster(resetCredentials)}><Download size={16} /> Download saved credentials</button> : null}<button className="button button-outline" type="button" onClick={resetAndDownloadEmployeeCredentials} disabled={!users.length || resettingPasswords}>{resettingPasswords ? 'Resetting passwords…' : <><KeyRound size={16} /> {resetCredentials?.length ? 'Reset all passwords again' : 'Create passwords & download all'}</>}</button></div></div>} {displayedTeam.length ? <>{showingDemo && <div className="demo-data-note"><strong>Sample team activity</strong><span>Illustrative demo data only. No real employee activity is recorded here yet.</span></div>}<div className="team-table"><div className="team-table-head"><span>EMPLOYEE</span><span>ROLE</span><span>PROGRESS</span><span>LATEST ASSESSMENT</span><span /></div>{displayedTeam.map(employee => <button className="team-row" key={employee.id} onClick={() => { if (!showingDemo) void openReport(employee) }} disabled={showingDemo} aria-label={showingDemo ? `${employee.full_name}, sample progress ${employee.progress_percent} percent` : `View ${employee.full_name} progress`}><span className="team-name"><span className="avatar light-avatar">{initials(employee.full_name)}</span><span><strong>{employee.full_name}</strong><small>{showingDemo ? 'Sample profile' : employee.email}</small></span></span><span>{employee.job_role ?? 'Unassigned'}</span><span className="team-progress"><i><b style={{ width: `${employee.progress_percent}%` }} /></i>{employee.progress_percent}%</span><span>{employee.latest_assessment === null ? '—' : `${Math.round(employee.latest_assessment)}%`}</span><ArrowRight size={15} /></button>)}</div></> : isAdmin ? <EmptyState title="No employee accounts" text="Create an employee account above and choose their learning role." /> : <EmptyState title="No assigned employees" text="Employees assigned to your manager account will appear here." />}</>}</PageHeading>
}

function JobRoles({ token, onError }: { token: string; onError: (message: string) => void }) {
  const [roles, setRoles] = useState<api.AdminJobRole[]>([])
  const [skills, setSkills] = useState<{ id: number; name: string }[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [skillName, setSkillName] = useState('')
  const [skillId, setSkillId] = useState('')
  const [requiredLevel, setRequiredLevel] = useState('3')
  const [priority, setPriority] = useState('3')
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState(false)
  const [savingRequirement, setSavingRequirement] = useState(false)
  const [notice, setNotice] = useState('')
  const selectedRole = roles.find(role => role.id === selectedId) ?? null

  useEffect(() => {
    Promise.all([api.getAdminJobRoles(token), api.getCatalog(token)])
      .then(([roleRows, catalog]) => {
        setRoles(roleRows)
        setSkills(catalog.skills)
        setSelectedId(roleRows[0]?.id ?? null)
      })
      .catch(error => onError((error as Error).message))
      .finally(() => setLoading(false))
  }, [token, onError])

  async function createRole(event: FormEvent) {
    event.preventDefault()
    setSavingRole(true)
    setNotice('')
    try {
      const created = await api.createJobRole(token, name.trim(), description.trim())
      setRoles(current => [...current, { ...created, skills: [] }].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedId(created.id)
      setName('')
      setDescription('')
      setNotice(`“${created.name}” created. Add its required skills to prepare it for assignment.`)
    } catch (error) { onError((error as Error).message) }
    finally { setSavingRole(false) }
  }

  async function saveRequirement(event: FormEvent) {
    event.preventDefault()
    if (!selectedRole || !skillId) return
    setSavingRequirement(true)
    setNotice('')
    try {
      await api.setJobRoleRequirement(token, selectedRole.id, Number(skillId), Number(requiredLevel), Number(priority))
      const updated = await api.getAdminJobRoles(token)
      setRoles(updated)
      setNotice('Skill requirement saved.')
    } catch (error) { onError((error as Error).message) }
    finally { setSavingRequirement(false) }
  }

  async function addSkill(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    try {
      const created = await api.createSkill(token, skillName.trim())
      setSkills(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
      setSkillId(String(created.id))
      setSkillName('')
      setNotice(`${created.name} added to the skill catalog.`)
    } catch (error) { onError((error as Error).message) }
  }

  function chooseSkill(value: string) {
    setSkillId(value)
    const existing = selectedRole?.skills.find(skill => skill.id === Number(value))
    setRequiredLevel(String(existing?.required_level ?? 3))
    setPriority(String(existing?.priority ?? 3))
  }

  return <PageHeading eyebrow="ADMINISTRATION" title="Job roles" subtitle="Create role profiles and set the skill targets that shape each employee’s learning plan.">
    {loading ? <LoadingState /> : <div className="role-admin-layout">
      <section className="role-create-card panel">
        <div className="section-heading"><div><div className="eyebrow">ROLE CATALOG</div><h2>Create a job role</h2></div></div>
        <form className="role-create-form" onSubmit={createRole}>
          <label>ROLE NAME<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Product Designer" minLength={2} maxLength={100} required /></label>
          <label>DESCRIPTION<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What this role does and the outcomes it owns" rows={3} maxLength={5000} /></label>
          <button className="button button-primary" disabled={savingRole || name.trim().length < 2}>{savingRole ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Create role</button>
        </form>
        {notice && <p className="role-notice" role="status">{notice}</p>}
      </section>

      <section className="role-catalog-card panel">
        <div className="section-heading"><div><div className="eyebrow">AVAILABLE ROLES</div><h2>{roles.length} role{roles.length === 1 ? '' : 's'}</h2></div></div>
        {roles.length ? <div className="role-list">{roles.map(role => <button key={role.id} className={`role-list-item ${selectedId === role.id ? 'selected' : ''}`} onClick={() => { setSelectedId(role.id); setSkillId(''); setNotice('') }}><span><strong>{role.name}</strong><small>{role.skills.length} required skill{role.skills.length === 1 ? '' : 's'}</small></span><ChevronRight size={16} /></button>)}</div> : <EmptyState title="No job roles yet" text="Create a role above, then add its skill requirements." />}
      </section>

      <section className="role-requirements-card panel">
        <div className="section-heading"><div><div className="eyebrow">ROLE REQUIREMENTS</div><h2>{selectedRole ? selectedRole.name : 'Choose a role'}</h2><p>{selectedRole?.description || 'Add skills and proficiency targets to make this role ready for assignment.'}</p></div></div>
        {selectedRole && <>
          {selectedRole.skills.length > 0 ? <div className="role-skill-list">{selectedRole.skills.map(skill => <div className="role-skill-row" key={skill.id}><span><strong>{skill.name}</strong><small>Priority {skill.priority}</small></span><span className="role-level">{skill.required_level}<small> / 5</small></span></div>)}</div> : <div className="role-empty-note">No skill requirements yet. Add at least one so this role creates a useful learning path.</div>}
          <form className="requirement-form" onSubmit={saveRequirement}>
            <label>SKILL<select value={skillId} onChange={event => chooseSkill(event.target.value)} required><option value="">Choose a skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
            <label>REQUIRED LEVEL<input type="number" min="0" max="5" value={requiredLevel} onChange={event => setRequiredLevel(event.target.value)} required /></label>
            <label>PRIORITY<input type="number" min="1" max="5" value={priority} onChange={event => setPriority(event.target.value)} required /></label>
            <button className="button button-primary" disabled={savingRequirement || !skillId}>{savingRequirement ? 'Saving…' : 'Save requirement'}</button>
          </form>
          <form className="add-skill-form" onSubmit={addSkill}><label>Need another skill? Add to catalog<input value={skillName} onChange={event => setSkillName(event.target.value)} placeholder="New skill name" minLength={2} maxLength={100} required /></label><button className="button button-outline" disabled={skillName.trim().length < 2}><Plus size={15} /> Add skill</button></form>
        </>}
      </section>
    </div>}
  </PageHeading>
}

function Skills({ dashboard }: { dashboard: Dashboard }) {
  return <PageHeading eyebrow="YOUR ROLE PROFILE" title="My skills" subtitle="Every level is compared with role requirements and the recorded evidence behind your readiness score."><section className="readiness-explainer panel"><div><span className="eyebrow">ROLE READINESS</span><strong>{dashboard.readiness.score_percent === null ? 'Not calculated' : `${dashboard.readiness.score_percent}%`}</strong><span>{dashboard.readiness.status === 'ready' ? 'All required skills meet target with full evidence.' : dashboard.readiness.status === 'unassigned' ? 'Ask an administrator to assign role requirements.' : 'Readiness is weighted by role priority and available evidence.'}</span></div><p>{dashboard.readiness.method}</p></section><div className="skills-table"><div className="skills-table-head"><span>SKILL</span><span>YOUR LEVEL</span><span>ROLE TARGET</span><span>GAP</span><span>PRIORITY</span><span>STATUS</span></div>{dashboard.readiness.skills.map(skill => <div className="skills-table-row" key={skill.skill}><strong>{skill.skill}<small className="skill-evidence">Score {skill.score_percent}% · {skill.evidence_count} evidence item{skill.evidence_count === 1 ? '' : 's'}</small></strong><span className="level-value">{skill.current_level === null ? <em>Not recorded</em> : `${skill.current_level} / 5`}</span><div className="matrix-meter" aria-label={`Current ${skill.current_level ?? 0} of 5, target ${skill.required_level} of 5`}><i className="matrix-target" style={{ width: `${skill.required_level * 20}%` }} /><i className="matrix-current" style={{ width: `${(skill.current_level ?? 0) * 20}%` }} /></div><span>{skill.gap === null ? 'No profile' : skill.gap === 0 ? '0' : `${skill.gap} level${skill.gap === 1 ? '' : 's'}`}</span><span className="priority-value">P{skill.priority}</span><span className={`skill-status ${skill.category}`}>{skill.category === 'strong' ? 'On track' : skill.category === 'missing' ? 'Not assessed' : skill.category === 'moderate' ? 'Developing' : 'Priority gap'}</span><span className="skill-explanation">{skill.explanation}</span></div>)}{dashboard.readiness.skills.length === 0 && <EmptyState title="No skills assigned yet" text="Your role requirements will appear here after assignment." />}</div><div className="scale-note"><Target size={15} /><span>Proficiency scale: 0 = no experience · 5 = advanced, independently applied skill. Assessment and practical scores are shown as readiness evidence.</span></div></PageHeading>
}

function Documents({ token, onError }: { token: string; onError: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<api.AdminDocument[]>([])
  useEffect(() => { api.getAdminDocuments(token).then(setHistory).catch(error => onError((error as Error).message)) }, [token, onError])
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setUploading(true); setNotice('')
    try { const result = await api.uploadDocument(token, file); setNotice(`${result.filename} indexed successfully · ${result.chunks} searchable sections.`); setFile(null); setHistory(await api.getAdminDocuments(token)) }
    catch (error) { onError((error as Error).message) }
    finally { setUploading(false) }
  }
  return <PageHeading eyebrow="ADMINISTRATION" title="Knowledge base" subtitle="Upload trusted company and technical documents for employee questions."><div className="document-layout"><section className="document-guidance"><div className="eyebrow">DOCUMENT INGESTION</div><h2>Make internal knowledge searchable.</h2><p>Documents are extracted, divided into overlapping sections, embedded, and stored for semantic retrieval. Answers cite the matching source sections.</p><div className="ingestion-steps"><div><span>01</span><div><strong>Extract text</strong><small>PDF, DOCX, or plain text</small></div></div><div><span>02</span><div><strong>Index sections</strong><small>Gemini embeddings in PostgreSQL</small></div></div><div><span>03</span><div><strong>Answer with sources</strong><small>Grounded generation, no unsupported claims</small></div></div></div></section><form className="upload-panel panel" onSubmit={upload}><div className="upload-symbol"><Upload size={21} /></div><h3>Add a document</h3><p>Maximum file size 10 MB</p><label className="file-drop"><input type="file" accept=".pdf,.docx,.txt" onChange={event => setFile(event.target.files?.[0] ?? null)} /><span className="file-drop-icon"><Plus size={17} /></span><strong>{file ? file.name : 'Choose a file to upload'}</strong><small>{file ? `${(file.size / 1024).toFixed(0)} KB · ready to index` : 'PDF, DOCX, or TXT'}</small></label><button className="button button-primary full-button" disabled={!file || uploading}>{uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{uploading ? 'Indexing document…' : 'Upload and index'}</button>{notice && <div className="upload-success"><CheckCircle2 size={15} />{notice}</div>}<div className="upload-security"><ShieldCheck size={14} /> Uploaded content is treated as reference data, never as system instructions.</div></form></div><section className="admin-upload-history panel"><div className="admin-section-heading"><div><div className="eyebrow">UPLOAD HISTORY</div><h2>Uploaded documents</h2></div><span>{history.length} file{history.length === 1 ? '' : 's'}</span></div>{history.length ? <div className="upload-history-list">{history.map(document => <div className="upload-history-row" key={document.id}><FileText size={17} /><div><strong>{document.filename}</strong><small>Uploaded by {document.uploaded_by} · {new Date(document.created_at).toLocaleString()} · {document.chunk_count} indexed sections</small></div><span className={`document-status ${document.status}`}>{document.status}</span></div>)}</div> : <p className="history-empty">No documents uploaded yet.</p>}</section></PageHeading>
}

function Policies({ token, isAdmin, onManage, onError }: { token: string; isAdmin: boolean; onManage: () => void; onError: (message: string) => void }) {
  const [documents, setDocuments] = useState<api.PolicyDocument[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.getPolicies(token).then(setDocuments).catch(error => onError((error as Error).message)).finally(() => setLoading(false))
  }, [token, onError])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleDocuments = documents.map(document => ({
    ...document,
    visibleSections: document.sections.filter(section => !normalizedQuery || `${section.title} ${section.content}`.toLocaleLowerCase().includes(normalizedQuery)),
  })).filter(document => !normalizedQuery || document.filename.toLocaleLowerCase().includes(normalizedQuery) || document.visibleSections.length > 0)

  return <PageHeading eyebrow="COMPANY GUIDANCE" title="Rules & policies" subtitle="Find the official company guidance and policy documents shared with your workspace.">
    <div className="policies-toolbar panel"><div className="policy-trust"><ShieldCheck size={18} /><span>Published company documents</span></div><label className="policy-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search policies and rules" aria-label="Search company policies" /></label></div>
    {loading ? <LoadingState /> : visibleDocuments.length ? <div className="policy-library">{visibleDocuments.map(document => <details className="policy-document panel" key={document.id}><summary><span className="policy-file-icon"><FileText size={18} /></span><span className="policy-file-name"><strong>{document.filename}</strong><small>{document.chunk_count} section{document.chunk_count === 1 ? '' : 's'} · Company reference</small></span><span className="policy-open-label">View document</span><ChevronRight size={17} className="policy-chevron" /></summary><div className="policy-sections">{document.visibleSections.map((section, index) => <article className="policy-section" key={`${document.id}-${index}`}><div className="eyebrow">{section.title}</div><p>{section.content}</p></article>)}</div></details>)}</div> : documents.length ? <EmptyState title="No matching guidance" text="Try another title or phrase to find the policy you need." /> : <section className="panel policies-empty"><div className="policy-file-icon"><FileText size={19} /></div><h2>No policies have been published yet</h2><p>{isAdmin ? 'Upload your company handbook, conduct standards, security rules, or benefit policies in the knowledge base. Employees will be able to browse them here.' : 'Ask your administrator to add the company handbook, conduct standards, security rules, and other workplace policies.'}</p>{isAdmin && <button className="button button-primary" onClick={onManage}><Upload size={16} /> Open knowledge base</button>}</section>}
  </PageHeading>
}

function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return <><div className="page-heading"><div className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{children}</>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span><BookOpen size={19} /></span><strong>{title}</strong><p>{text}</p></div>
}

function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>Loading your onboarding workspace…</span></div>
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'OX'
}

export default App
