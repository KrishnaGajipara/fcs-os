import { useEffect, useMemo, useState } from 'react'
import {
  createCategory,
  createMaterial,
  deleteCategory,
  deleteMaterial,
  fetchCategoriesAdmin,
  fetchMaterialsAdmin,
  updateCategory,
  updateMaterial,
  type AdminCategory,
  type AdminMaterial,
} from '../../lib/admin'
import { IconSpinner } from '../../components/ui'

export function MaterialsManager(props: { onClose: () => void }) {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null)
  const [materials, setMaterials] = useState<AdminMaterial[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<string>('')

  const load = async () => {
    setLoadError('')
    try {
      const [cats, mats] = await Promise.all([fetchCategoriesAdmin(), fetchMaterialsAdmin()])
      setCategories(cats)
      setMaterials(mats)
      setSelected((prev) => prev || cats[0]?.slug || '')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load materials.')
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeCategory = categories?.find((c) => c.slug === selected) ?? null
  const categoryMaterials = useMemo(
    () => (materials ?? []).filter((m) => m.list === selected),
    [materials, selected],
  )

  if (loadError) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="banner banner-error">{loadError}</div>
          <button className="btn btn-secondary" onClick={load}>Retry</button>
        </div>
      </div>
    )
  }

  if (!categories || !materials) {
    return (
      <div className="admin-center" style={{ minHeight: 240 }}>
        <IconSpinner size={22} />
      </div>
    )
  }

  return (
    <div>
      <div className="admin-topline">
        <div>
          <h2 className="admin-title">Materials &amp; Categories</h2>
          <p className="admin-subtitle">Manage the catalog shown on the Material Order form.</p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-secondary" onClick={props.onClose}>← Back to dashboard</button>
        </div>
      </div>

      <CategoryBar
        categories={categories}
        materials={materials}
        selected={selected}
        onSelect={setSelected}
        onCreated={(cat) => {
          setCategories((prev) => [...(prev ?? []), cat])
          setSelected(cat.slug)
        }}
        onUpdated={(cat) => setCategories((prev) => (prev ?? []).map((c) => (c.id === cat.id ? cat : c)))}
        onDeleted={(id) => {
          setCategories((prev) => (prev ?? []).filter((c) => c.id !== id))
          setSelected((prev) => (categories.find((c) => c.id === id)?.slug === prev ? '' : prev))
        }}
      />

      {activeCategory ? (
        <MaterialsPanel
          category={activeCategory}
          items={categoryMaterials}
          onCreated={(mat) => setMaterials((prev) => [...(prev ?? []), mat])}
          onUpdated={(mat) => setMaterials((prev) => (prev ?? []).map((m) => (m.id === mat.id ? mat : m)))}
          onDeleted={(id) => setMaterials((prev) => (prev ?? []).filter((m) => m.id !== id))}
        />
      ) : (
        <div className="card"><div className="card-body admin-empty">Add a category to get started.</div></div>
      )}
    </div>
  )
}

/* ---- category bar ---------------------------------------------------------- */

function CategoryBar(props: {
  categories: AdminCategory[]
  materials: AdminMaterial[]
  selected: string
  onSelect: (slug: string) => void
  onCreated: (c: AdminCategory) => void
  onUpdated: (c: AdminCategory) => void
  onDeleted: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    props.materials.forEach((mat) => m.set(mat.list, (m.get(mat.list) ?? 0) + 1))
    return m
  }, [props.materials])

  const submitAdd = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const cat = await createCategory(name.trim())
      props.onCreated(cat)
      setName('')
      setAdding(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-body cat-bar">
        {props.categories.map((c) => (
          <CategoryPill
            key={c.id}
            category={c}
            count={counts.get(c.slug) ?? 0}
            selected={props.selected === c.slug}
            onSelect={() => props.onSelect(c.slug)}
            onUpdated={props.onUpdated}
            onDeleted={props.onDeleted}
          />
        ))}

        {adding ? (
          <div className="cat-add-form">
            <input
              className="input"
              autoFocus
              placeholder="e.g. Fireproofing"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
            />
            <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={submitAdd}>
              {busy ? <IconSpinner /> : 'Add'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setAdding(false); setName(''); setError('') }}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={() => setAdding(true)}>+ Add category</button>
        )}
      </div>
      {error && <div className="banner banner-error" style={{ margin: '0 20px 16px' }}>{error}</div>}
    </div>
  )
}

function CategoryPill(props: {
  category: AdminCategory
  count: number
  selected: boolean
  onSelect: () => void
  onUpdated: (c: AdminCategory) => void
  onDeleted: (id: string) => void
}) {
  const { category: c } = props
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim() || name.trim() === c.name) return setEditing(false)
    setBusy(true)
    try {
      props.onUpdated(await updateCategory(c.id, { name: name.trim() }))
      setEditing(false)
    } catch {
      setError('Rename failed.')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    setBusy(true)
    try {
      props.onUpdated(await updateCategory(c.id, { active: !c.active }))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (props.count > 0) return
    if (!confirm(`Delete category "${c.name}"? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteCategory(c.id)
      props.onDeleted(c.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="cat-add-form">
        <input className="input" autoFocus value={name} maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <IconSpinner /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={() => { setEditing(false); setName(c.name) }}>Cancel</button>
      </div>
    )
  }

  return (
    <div className={`cat-pill ${props.selected ? 'selected' : ''} ${!c.active ? 'inactive' : ''}`}>
      <button className="cat-pill-main" onClick={props.onSelect} title={error || undefined}>
        {c.name}
        <span className="cat-pill-count">{props.count}</span>
        {!c.active && <span className="cat-pill-tag">Hidden</span>}
      </button>
      <div className="cat-pill-menu">
        <button className="btn btn-ghost" onClick={() => setEditing(true)} aria-label={`Rename ${c.name}`}>✎</button>
        <button className="btn btn-ghost" onClick={toggleActive} disabled={busy} aria-label={c.active ? 'Hide category' : 'Show category'}>
          {c.active ? '⏻' : '⏼'}
        </button>
        <button
          className="btn btn-ghost"
          onClick={remove}
          disabled={busy || props.count > 0}
          aria-label={`Delete ${c.name}`}
          title={props.count > 0 ? `Remove all ${props.count} item(s) first` : 'Delete category'}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/* ---- materials panel ------------------------------------------------------- */

function MaterialsPanel(props: {
  category: AdminCategory
  items: AdminMaterial[]
  onCreated: (m: AdminMaterial) => void
  onUpdated: (m: AdminMaterial) => void
  onDeleted: (id: string) => void
}) {
  const groups = useMemo(() => {
    const order: string[] = []
    const byGrp = new Map<string, AdminMaterial[]>()
    for (const m of props.items) {
      if (!byGrp.has(m.grp)) { byGrp.set(m.grp, []); order.push(m.grp) }
      byGrp.get(m.grp)!.push(m)
    }
    return order.map((label) => ({ label, items: byGrp.get(label)! }))
  }, [props.items])

  const sectionOptions = useMemo(
    () => [...new Set(props.items.map((m) => m.grp))],
    [props.items],
  )

  return (
    <div className="card">
      <div className="card-head">
        <h2>{props.category.name}</h2>
        <span className="hint">{props.items.length} item{props.items.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card-body">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="section-label">{g.label}</div>
            <div className="mgr-list">
              {g.items.map((m) => (
                <MaterialRow key={m.id} material={m} onUpdated={props.onUpdated} onDeleted={props.onDeleted} />
              ))}
            </div>
          </div>
        ))}
        {props.items.length === 0 && (
          <p style={{ color: 'var(--faint)', padding: '4px 0 16px' }}>No materials in this category yet.</p>
        )}

        <AddMaterialForm
          categorySlug={props.category.slug}
          sectionOptions={sectionOptions}
          onCreated={props.onCreated}
        />
      </div>
    </div>
  )
}

function MaterialRow(props: {
  material: AdminMaterial
  onUpdated: (m: AdminMaterial) => void
  onDeleted: (id: string) => void
}) {
  const { material: m } = props
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(m.name)
  const [detail, setDetail] = useState(m.detail ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      props.onUpdated(await updateMaterial(m.id, { name: name.trim(), detail: detail.trim() }))
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    setBusy(true)
    try {
      props.onUpdated(await updateMaterial(m.id, { active: !m.active }))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteMaterial(m.id)
      props.onDeleted(m.id)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="mgr-row editing">
        <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input className="input" value={detail} maxLength={300} onChange={(e) => setDetail(e.target.value)} placeholder="Detail / note (optional)" />
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? <IconSpinner /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    )
  }

  return (
    <div className={`mgr-row ${!m.active ? 'inactive' : ''}`}>
      <span className="mgr-name">
        {m.name}
        {m.detail && <span className="item-detail">{m.detail}</span>}
        {!m.active && <span className="cat-pill-tag">Hidden</span>}
      </span>
      <div className="mgr-actions">
        <button className="btn btn-ghost" onClick={() => setEditing(true)} aria-label={`Edit ${m.name}`}>✎</button>
        <button className="btn btn-ghost" onClick={toggleActive} disabled={busy} aria-label={m.active ? 'Hide item' : 'Show item'}>
          {m.active ? '⏻' : '⏼'}
        </button>
        <button className="btn btn-ghost" onClick={remove} disabled={busy} aria-label={`Delete ${m.name}`}>✕</button>
      </div>
    </div>
  )
}

function AddMaterialForm(props: {
  categorySlug: string
  sectionOptions: string[]
  onCreated: (m: AdminMaterial) => void
}) {
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [grp, setGrp] = useState(props.sectionOptions[0] ?? 'Materials')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const mat = await createMaterial({
        list: props.categorySlug,
        grp: grp.trim() || 'Materials',
        name: name.trim(),
        detail: detail.trim() || undefined,
      })
      props.onCreated(mat)
      setName('')
      setDetail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add material.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mgr-add">
      <div className="section-label" style={{ marginTop: 20 }}>Add material</div>
      <div className="mgr-add-row">
        <input className="input" placeholder="Item name" value={name} maxLength={120}
          onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
        <input className="input" placeholder="Section (e.g. Materials & Equipment)" value={grp} maxLength={60}
          list="mgr-sections" onChange={(e) => setGrp(e.target.value)} style={{ flex: 1 }} />
        <input className="input" placeholder="Detail (optional)" value={detail} maxLength={300}
          onChange={(e) => setDetail(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? <IconSpinner /> : 'Add'}
        </button>
      </div>
      <datalist id="mgr-sections">
        {props.sectionOptions.map((s) => <option key={s} value={s} />)}
      </datalist>
      {error && <div className="field-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}
