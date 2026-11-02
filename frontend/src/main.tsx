import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  Activity, ArrowDownToLine, ArrowRight, CheckCheck, ChevronDown,
  CircleAlert, ClipboardList, Clock3, Cog, Factory, FileClock, Gauge, LayoutDashboard,
  Menu, Plus, QrCode, RefreshCw, Search, ShieldCheck, TrendingDown, Wrench, X,
} from 'lucide-react'
import './style.css'

type Equipment = { id:number; code:string; name:string; line:string; location:string; created_at:string; active_tickets?:number }
type Ticket = { id:number; equipment_id:number; title:string; description:string; priority:'low'|'medium'|'high'|'critical'; reporter:string; status:string; created_at:string; registration_seconds:number; equipment_name:string; equipment_code:string; line:string }
type Stats = { equipment:number; tickets_total:number; tickets_active:number; tickets_completed:number; avg_registration_seconds:number; goal_reduction_pct:number; note:string }
const API = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin)).replace(/\/$/, '')
const priorityName:Record<string,string> = {low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'}
const statusName:Record<string,string> = {new:'Новая',accepted:'Принята',in_progress:'В работе',resolved:'Восстановлено',closed:'Закрыта'}
const statusOptions = Object.entries(statusName)

async function request<T>(path:string, opts?:RequestInit):Promise<T> {
  let response:Response
  try {response = await fetch(`${API}${path}`, {headers:{'Content-Type':'application/json',...opts?.headers}, ...opts})}
  catch {throw new Error('Нет соединения с API. Проверьте, запущен ли backend на порту 8000.')}
  if (!response.ok) {
    const body = await response.json().catch(()=>null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : `Ошибка сервера: ${response.status}`)
  }
  return response.json()
}
function useData() {
  const [equipment,setEquipment] = useState<Equipment[]>([])
  const [tickets,setTickets] = useState<Ticket[]>([])
  const [stats,setStats] = useState<Stats|null>(null)
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const refresh = useCallback(async()=>{
    try {
      const [e,t,s] = await Promise.all([
        request<Equipment[]>('/api/equipment'),
        request<Ticket[]>('/api/tickets'),
        request<Stats>('/api/stats'),
      ])
      setEquipment(e);setTickets(t);setStats(s);setError('')
    } catch(err) {setError((err as Error).message)} finally {setLoading(false)}
  },[])
  useEffect(()=>{refresh()},[refresh])
  return {equipment,tickets,stats,error,loading,refresh}
}
const fmtTime = (s:string) => new Date(s).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
const fmtSecs = (seconds:number) => seconds < 60 ? `${seconds} сек` : `${Math.floor(seconds/60)} мин ${seconds%60} сек`

function Shell(){
  const {equipment,tickets,stats,error,loading,refresh} = useData()
  const [sidebar,setSidebar] = useState(false)
  const [modal,setModal] = useState<Equipment|null>(null)
  const [createOpen,setCreateOpen] = useState(false)
  return <div className="app-layout">
    <aside className={`sidebar ${sidebar?'show':''}`}>
      <Link className="brand" to="/" onClick={()=>setSidebar(false)}><div className="brand-icon"><QrCode size={25}/></div><div><strong>QR Maintenance</strong><small>Factory operations · MVP</small></div></Link>
      <div className="nav-title">РАБОЧАЯ ОБЛАСТЬ</div>
      <nav className="navigation" onClick={()=>setSidebar(false)}>
        <NavLink to="/" end><LayoutDashboard size={19}/> Обзор системы</NavLink>
        <NavLink to="/equipment"><Factory size={19}/> Оборудование <span>{equipment.length}</span></NavLink>
        <NavLink to="/tickets"><ClipboardList size={19}/> Заявки <span>{tickets.filter(t=>t.status!=='closed'&&t.status!=='resolved').length}</span></NavLink>
        <NavLink to="/hypothesis"><Gauge size={19}/> Гипотеза H1</NavLink>
      </nav>
      <div className="sidebar-bottom"><div className="pilot-tag"><span className="pulse"/> Пилотный проект</div><div className="sidebar-note">ФАБРИКА 2030<br/>Конкурс лидерских решений</div><div className="sidebar-foot">H1 · Digital incident registration</div></div>
    </aside>
    {sidebar&&<div className="mobile-backdrop" onClick={()=>setSidebar(false)}/>}
    <div className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={()=>setSidebar(true)}><Menu size={21}/></button><div className="breadcrumb">Фабрика 2030 <span>/</span> <strong>QR Maintenance</strong></div><div className="top-actions"><div className="live"><span className="pulse"/> MVP ACTIVE</div><button className="icon-button" title="Обновить" onClick={refresh}><RefreshCw size={18}/></button><div className="avatar">H1</div></div></header>
    <div className="content">
      {error&&<div className="error"><CircleAlert size={19}/>{error}<button onClick={refresh}>Повторить</button></div>}
      <Routes>
        <Route path="/" element={<Dashboard equipment={equipment} tickets={tickets} stats={stats} loading={loading} onQr={setModal} onCreate={()=>setCreateOpen(true)}/>}/>
        <Route path="/equipment" element={<EquipmentPage equipment={equipment} onQr={setModal} onCreate={()=>setCreateOpen(true)}/>}/>
        <Route path="/tickets" element={<TicketsPage tickets={tickets} equipment={equipment} onUpdate={refresh}/>}/>
        <Route path="/hypothesis" element={<HypothesisPage stats={stats}/>}/>
        <Route path="*" element={<div className="surface">Страница не найдена. <Link to="/">Вернуться к обзору</Link></div>}/>
      </Routes>
    </div></div>
    {modal&&<QrModal equipment={modal} onClose={()=>setModal(null)}/>}
    {createOpen&&<CreateEquipment onClose={()=>setCreateOpen(false)} onSuccess={()=>{setCreateOpen(false);refresh()}}/>}
  </div>
}

function Head({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action&&<div className="page-actions">{action}</div>}</div>
}
function Dashboard({equipment,tickets,stats,loading,onQr,onCreate}:{equipment:Equipment[];tickets:Ticket[];stats:Stats|null;loading:boolean;onQr:(x:Equipment)=>void;onCreate:()=>void}){
  const navigate=useNavigate()
  return <>
    <Head eyebrow="ПАНЕЛЬ УПРАВЛЕНИЯ / H1" title="Система мониторинга неисправностей" description="Цифровая регистрация заявок на ремонт через QR-коды оборудования." action={<><button className="btn btn-light" onClick={onCreate}><Plus size={18}/> Оборудование</button><button className="btn btn-primary" onClick={()=>navigate('/equipment')}><QrCode size={18}/> Показать QR-коды</button></>}/>
    <div className="hero"><div className="hero-info"><div className="hero-pill"><span className="tiny-dot"/> ГИПОТЕЗА H1 · ПИЛОТ</div><h2>От неисправности<br/>до заявки за несколько шагов.</h2><p>Сканируйте QR-код на оборудовании, опишите проблему и передайте информацию ремонтной службе.</p><button className="hero-button" onClick={()=>navigate('/equipment')}>Перейти к оборудованию <ArrowRight size={17}/></button></div><div className="hero-art"><div className="hero-circle second"/><div className="hero-circle"/><div className="hero-qr"><QrCode size={92} strokeWidth={1.35}/><span>SCAN TO REPORT</span></div><div className="hero-mini"><CheckCheck size={17}/> Заявка создана</div></div></div>
    <div className="stats-grid">
      <StatCard icon={<Factory size={21}/>} label="Оборудование" value={String(stats?.equipment||0)} note="Зарегистрировано" tone="blue"/>
      <StatCard icon={<FileClock size={21}/>} label="Всего заявок" value={String(stats?.tickets_total||0)} note="За всё время пилота" tone="purple"/>
      <StatCard icon={<Wrench size={21}/>} label="В работе" value={String(stats?.tickets_active||0)} note="Активных обращений" tone="orange"/>
      <StatCard icon={<Clock3 size={21}/>} label="Регистрация" value={loading?'…':fmtSecs(stats?.avg_registration_seconds||0)} note="Среднее время через QR" tone="green"/>
    </div>
    <div className="dashboard-cols"><section className="surface"><div className="section-head"><div><h3>Оборудование</h3><p>Быстрый доступ к QR-кодам</p></div><Link className="text-link" to="/equipment">Смотреть всё <ArrowRight size={16}/></Link></div><div className="eq-list">{equipment.slice(0,4).map(e=><div className="eq-list-row" key={e.id}><div className="eq-icon"><Cog size={20}/></div><div className="eq-info"><b>{e.name}</b><small>{e.code} · {e.line}</small></div><button className="small-action" onClick={()=>onQr(e)}><QrCode size={17}/> QR-код</button></div>)}</div></section>
    <section className="surface"><div className="section-head"><div><h3>Последние заявки</h3><p>Актуальные обращения сотрудников</p></div><Link className="text-link" to="/tickets">Все заявки <ArrowRight size={16}/></Link></div>{tickets.length?<div className="recent-list">{tickets.slice(0,5).map(t=><div className="recent-row" key={t.id}><span className={`priority-dot ${t.priority}`}/><div><b>{t.title}</b><small>#{String(t.id).padStart(4,'0')} · {t.equipment_code}</small></div><span className={`status ${t.status}`}>{statusName[t.status]}</span></div>)}</div>:<div className="empty"><div className="empty-icon"><ClipboardList size={26}/></div><strong>Заявок пока нет</strong><p>Отсканируйте QR-код станка и создайте первое обращение.</p></div>}</section></div>
    <div className="footnote"><ShieldCheck size={17}/> Система предназначена для учёта заявок, не заменяет процедуры промышленной безопасности и аварийного останова.</div>
  </>
}
function StatCard({icon,label,value,note,tone}:{icon:React.ReactNode;label:string;value:string;note:string;tone:string}){
  return <div className="stat"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>
}
function EquipmentPage({equipment,onQr,onCreate}:{equipment:Equipment[];onQr:(x:Equipment)=>void;onCreate:()=>void}){
  const [search,setSearch]=useState('')
  const filtered=equipment.filter(e=>`${e.name} ${e.code} ${e.location} ${e.line}`.toLowerCase().includes(search.toLowerCase()))
  return <><Head eyebrow="СПРАВОЧНИК ОБОРУДОВАНИЯ" title="Оборудование" description="Создавайте оборудование и печатайте индивидуальные QR-коды для быстрой регистрации неисправностей." action={<button className="btn btn-primary" onClick={onCreate}><Plus size={18}/> Добавить оборудование</button>}/>
  <div className="surface table-surface"><div className="table-toolbar"><div><h3>Реестр оборудования</h3><p>Всего записей: {filtered.length}</p></div><div className="search-box"><Search size={18}/><input placeholder="Поиск по оборудованию..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
  <div className="table-wrap"><table className="data-table"><thead><tr><th>ОБОРУДОВАНИЕ</th><th>ЛИНИЯ</th><th>РАСПОЛОЖЕНИЕ</th><th>ЗАЯВКИ</th><th>QR-КОД</th></tr></thead><tbody>{filtered.map(e=><tr key={e.id}><td><div className="table-name"><span className="eq-icon"><Cog size={19}/></span><div><b>{e.name}</b><small>{e.code}</small></div></div></td><td>{e.line}</td><td>{e.location}</td><td><span className={`count-pill ${e.active_tickets?'busy':''}`}>{e.active_tickets||0} активных</span></td><td><button className="small-action" onClick={()=>onQr(e)}><QrCode size={17}/> Показать</button></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty">Ничего не найдено</div>}</div></div>
  <div className="hint"><QrCode size={21}/><div><b>Как использовать QR-коды?</b><p>Откройте QR-код, скачайте PNG и разместите наклейку на оборудовании. Для сканирования телефоном используйте IP-адрес компьютера в локальной сети, а не localhost.</p></div></div></>
}
function TicketsPage({tickets,equipment,onUpdate}:{tickets:Ticket[];equipment:Equipment[];onUpdate:()=>void}){
  const [filter,setFilter]=useState('all')
  const [saving,setSaving]=useState<number|null>(null)
  const [error,setError]=useState('')
  const filtered=tickets.filter(t=>filter==='all'||(filter==='open'? !['resolved','closed'].includes(t.status):t.status===filter))
  const change=async(id:number,status:string)=>{setSaving(id);setError('');try{await request(`/api/tickets/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});onUpdate()}catch(e){setError((e as Error).message)}finally{setSaving(null)}}
  return <><Head eyebrow="РЕМОНТНАЯ СЛУЖБА" title="Заявки на ремонт" description="Контролируйте полученные обращения и переводите их по этапам выполнения." action={<Link className="btn btn-primary" to="/equipment"><QrCode size={18}/> Регистрация через QR</Link>}/>
  <div className="surface table-surface"><div className="table-toolbar"><div><h3>Журнал заявок</h3><p>{tickets.length} обращений за период</p></div><div className="segmented"><button className={filter==='all'?'chosen':''} onClick={()=>setFilter('all')}>Все</button><button className={filter==='open'?'chosen':''} onClick={()=>setFilter('open')}>Активные</button><button className={filter==='closed'?'chosen':''} onClick={()=>setFilter('closed')}>Закрытые</button></div></div>
  {error&&<div className="error">{error}</div>}
  <div className="table-wrap"><table className="data-table"><thead><tr><th>ЗАЯВКА</th><th>ОБОРУДОВАНИЕ</th><th>ПРИОРИТЕТ</th><th>СОЗДАНА</th><th>ВРЕМЯ ФОРМЫ</th><th>СТАТУС</th></tr></thead><tbody>{filtered.map(t=><tr key={t.id}><td><div className="ticket-title"><b>#{String(t.id).padStart(4,'0')} · {t.title}</b><small>{t.description}</small><small>Сообщил: {t.reporter}</small></div></td><td><b>{t.equipment_code}</b><small className="block-subtext">{t.equipment_name}</small></td><td><span className={`priority ${t.priority}`}><span className={`priority-dot ${t.priority}`}/>{priorityName[t.priority]}</span></td><td className="nobr">{fmtTime(t.created_at)}</td><td>{fmtSecs(t.registration_seconds)}</td><td><div className="select-wrap"><select aria-label="Статус заявки" disabled={saving===t.id} value={t.status} onChange={e=>change(t.id,e.target.value)}>{statusOptions.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select><ChevronDown size={15}/></div></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty"><div className="empty-icon"><ClipboardList size={26}/></div><strong>Заявок не найдено</strong><p>После отправки формы по QR-коду здесь появится новая заявка.</p>{equipment[0]&&<Link to={`/scan/${equipment[0].id}`} className="text-link">Создать тестовую заявку <ArrowRight size={17}/></Link>}</div>}</div></div></>
}
function HypothesisPage({stats}:{stats:Stats|null}){
  return <><Head eyebrow="КОНКУРС ЛИДЕРСКИХ РЕШЕНИЙ · ФАБРИКА 2030" title="Гипотеза H1" description="Пилот цифровой регистрации производственных неисправностей через QR-коды."/>
  <div className="hypothesis-grid"><div className="surface hypothesis-main"><span className="h1-badge">P1 · H1</span><h2>Цифровая регистрация неисправностей через QR-код</h2><p>При возникновении неисправности сотрудник сканирует QR-код оборудования, заполняет короткую форму и направляет заявку ремонтной службе.</p><div className="hypothesis-feature"><TrendingDown size={23}/><div><b>Целевой эффект: −50%</b><span>Снижение времени передачи информации о неисправности. Это цель пилота, не доказанный результат.</span></div></div><div className="hypothesis-feature"><Activity size={23}/><div><b>Основная метрика</b><span>Время открытия QR-формы → отправка заявки (сек/инцидент). Базовое время «до» нужно измерить отдельно.</span></div></div><div className="hypothesis-feature"><Gauge size={23}/><div><b>Текущий замер в MVP</b><span>Среднее время заполнения формы: {fmtSecs(stats?.avg_registration_seconds||0)}; создано заявок: {stats?.tickets_total||0}.</span></div></div></div><div className="surface side-measure"><h3>Что проверяем</h3><div className="measure-step"><span>01</span><div><b>Замер до пилота</b><p>Фиксируем текущее время регистрации и передачи заявки.</p></div></div><div className="measure-step"><span>02</span><div><b>Пилот на линии</b><p>Размещаем QR на станках и обучаем сотрудников.</p></div></div><div className="measure-step"><span>03</span><div><b>Замер после</b><p>Сравниваем медиану/среднее время на сопоставимых инцидентах.</p></div></div><div className="measure-step"><span>04</span><div><b>Решение о масштабировании</b><p>Оцениваем результат, использование и ограничения.</p></div></div></div></div>
  <div className="hint"><CircleAlert size={21}/><div><b>Важное ограничение</b><p>Уменьшение времени отправки заявки не доказывает такое же уменьшение простоя оборудования. Для длительности простоя нужны отдельные события и измерения.</p></div></div></>
}
function Overlay({children,onClose}:{children:React.ReactNode;onClose:()=>void}){
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose])
  return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal">{children}</div></div>
}
function QrModal({equipment,onClose}:{equipment:Equipment;onClose:()=>void}){
  const [baseUrl,setBaseUrl]=useState(`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`)
  const url=`${baseUrl.replace(/\/$/,'')}/scan/${equipment.id}`
  const imageUrl=`${API}/api/equipment/${equipment.id}/qr?base_url=${encodeURIComponent(baseUrl)}`
  return <Overlay onClose={onClose}><div className="modal-head"><div><div className="eyebrow">QR-КОД ОБОРУДОВАНИЯ</div><h2>{equipment.name}</h2><p>{equipment.code} · {equipment.location}</p></div><button className="icon-button" onClick={onClose}><X size={20}/></button></div><div className="qr-preview"><img src={imageUrl} alt={`QR-код для ${equipment.name}`}/><span>СКАНИРУЙТЕ ДЛЯ ПОДАЧИ ЗАЯВКИ</span></div><label className="form-label">Адрес приложения для QR <small>(для телефонов используйте IP компьютера)</small><input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="http://192.168.1.100:5173"/></label><div className="qr-url">{url}</div><div className="modal-actions"><a className="btn btn-light" href={imageUrl} download={`QR_${equipment.code}.png`} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={18}/> Скачать PNG</a><a className="btn btn-primary" href={`${import.meta.env.BASE_URL}scan/${equipment.id}`} target="_blank" rel="noopener noreferrer">Открыть форму <ArrowRight size={18}/></a></div></Overlay>
}
function CreateEquipment({onClose,onSuccess}:{onClose:()=>void;onSuccess:()=>void}){
  const [values,setValues]=useState({code:'',name:'',line:'',location:''})
  const [error,setError]=useState('');const [saving,setSaving]=useState(false)
  const save=async(e:React.FormEvent)=>{e.preventDefault();setError('');setSaving(true);try{await request('/api/equipment',{method:'POST',body:JSON.stringify(values)});onSuccess()}catch(e){setError((e as Error).message)}finally{setSaving(false)}}
  return <Overlay onClose={onClose}><div className="modal-head"><div><div className="eyebrow">РЕЕСТР ОБОРУДОВАНИЯ</div><h2>Добавить оборудование</h2><p>После добавления QR-код будет доступен автоматически.</p></div><button className="icon-button" onClick={onClose}><X size={20}/></button></div><form className="fields" onSubmit={save}><label className="form-label">Инвентарный код<input required minLength={2} maxLength={40} value={values.code} onChange={e=>setValues({...values,code:e.target.value})} placeholder="Например, CNC-005"/></label><label className="form-label">Название оборудования<input required minLength={2} maxLength={140} value={values.name} onChange={e=>setValues({...values,name:e.target.value})} placeholder="Станок лазерной резки"/></label><div className="field-grid"><label className="form-label">Производственная линия<input required value={values.line} onChange={e=>setValues({...values,line:e.target.value})} placeholder="Линия 1"/></label><label className="form-label">Расположение<input required value={values.location} onChange={e=>setValues({...values,location:e.target.value})} placeholder="Цех А"/></label></div>{error&&<div className="error">{error}</div>}<div className="modal-actions"><button type="button" className="btn btn-light" onClick={onClose}>Отмена</button><button disabled={saving} className="btn btn-primary" type="submit"><Plus size={17}/>{saving?'Сохранение…':'Добавить'}</button></div></form></Overlay>
}
function ScanPage(){
  const {id}=useParams()
  const [equipment,setEquipment]=useState<Equipment|null>(null)
  const [error,setError]=useState('')
  const [submitted,setSubmitted]=useState<number|null>(null)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({title:'',description:'',priority:'medium',reporter:''})
  const [openedAt]=useState(()=>new Date().toISOString())
  useEffect(()=>{request<Equipment>(`/api/equipment/${id}`).then(setEquipment).catch(e=>setError(e.message))},[id])
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');try{const result=await request<{id:number}>('/api/tickets',{method:'POST',body:JSON.stringify({...form,equipment_id:Number(id),opened_at:openedAt})});setSubmitted(result.id)}catch(e){setError((e as Error).message)}finally{setSaving(false)}}
  return <div className="scan-page"><div className="scan-top"><div className="scan-brand"><QrCode size={25}/> QR Maintenance <span>· H1</span></div><div className="pilot-tag"><span className="pulse"/> Фабрика 2030</div></div><div className="scan-container">{submitted?<div className="scan-card success-card"><div className="success-icon"><CheckCheck size={34}/></div><h1>Заявка отправлена!</h1><p>Ремонтная служба получила ваше обращение. Номер заявки:</p><div className="big-number">#{String(submitted).padStart(4,'0')}</div><Link className="btn btn-primary" to="/tickets">Посмотреть заявки <ArrowRight size={17}/></Link></div>:<><div className="scan-intro"><span className="eyebrow">РЕГИСТРАЦИЯ НЕИСПРАВНОСТИ</span><h1>Сообщить о проблеме</h1><p>Заполните короткую форму. Заявка поступит ремонтной службе.</p></div><div className="scan-card">{equipment?<div className="scan-equipment"><span className="eq-icon"><Cog size={25}/></span><div><small>ОБОРУДОВАНИЕ</small><b>{equipment.name}</b><span>{equipment.code} · {equipment.line} · {equipment.location}</span></div><ShieldCheck size={21} className="scan-check"/></div>:<div className="loading">Загрузка оборудования…</div>}
  {error&&<div className="error"><CircleAlert size={18}/>{error}</div>}
  <form className="fields" onSubmit={submit}><label className="form-label">Краткое описание проблемы<input required minLength={3} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Например, не запускается двигатель"/></label><label className="form-label">Что произошло?<textarea required minLength={3} rows={4} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Опишите симптомы, когда заметили проблему и что происходит с оборудованием"/></label><div className="field-grid"><label className="form-label">Приоритет<div className="select-input"><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option><option value="critical">Критический</option></select><ChevronDown size={17}/></div></label><label className="form-label">Ваше имя<input required minLength={2} value={form.reporter} onChange={e=>setForm({...form,reporter:e.target.value})} placeholder="Имя сотрудника"/></label></div><button className="btn btn-primary submit-btn" type="submit" disabled={saving||!equipment}>{saving?'Отправка…':'Отправить заявку'} <ArrowRight size={18}/></button></form></div><div className="scan-warning"><CircleAlert size={18}/> При угрозе безопасности немедленно остановите оборудование согласно инструкции и сообщите ответственному. Эта форма не заменяет аварийную сигнализацию.</div></>}</div></div>
}
function App(){return <BrowserRouter basename={import.meta.env.BASE_URL}><Routes><Route path="/scan/:id" element={<ScanPage/>}/><Route path="/*" element={<Shell/>}/></Routes></BrowserRouter>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
