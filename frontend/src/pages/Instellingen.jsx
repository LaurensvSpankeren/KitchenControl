import React, { useMemo, useState } from 'react'

const TABS = [
  { id: 'gebruikersbeheer', label: 'Gebruikersbeheer' },
  { id: 'ingredient-categories', label: 'Ingrediënten categorieën' },
  { id: 'semi-finished-categories', label: 'Halffabricaten categorieën' },
  { id: 'dish-categories', label: 'Gerechten categorieën' },
  { id: 'menu-categories', label: 'Menukaarten categorieën' }
]

function getCurrentUser() {
  if (typeof window === 'undefined') {
    return { role: 'Supervisor' }
  }

  const candidateKeys = ['currentUser', 'user', 'kc_user', 'kitchencontrol_user']
  for (const key of candidateKeys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch {
      // Ignore malformed storage content and continue fallback chain.
    }
  }

  return { role: 'Supervisor' }
}

export default function Instellingen() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const currentUser = useMemo(() => getCurrentUser(), [])
  const role = String(
    currentUser?.role ||
      currentUser?.user_role ||
      currentUser?.role_name ||
      currentUser?.type ||
      ''
  ).trim()
  const hasAccess = role === 'Supervisor'
  const activeTabRecord = TABS.find((tab) => tab.id === activeTab) || TABS[0]

  return (
    <div>
      <header className="page-header">
        <h2>Instellingen</h2>
        <p>Beheer hier de instellingen van KitchenControl per onderdeel.</p>
      </header>

      {!hasAccess ? (
        <section className="card">
          <h3>Instellingen</h3>
          <p>Je hebt geen toegang tot deze pagina.</p>
        </section>
      ) : (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="table-action-btn"
                onClick={() => setActiveTab(tab.id)}
                style={activeTab === tab.id ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              background: '#fafafa',
              padding: '1rem'
            }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>{activeTabRecord.label}</h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              Placeholder voor {activeTabRecord.label.toLowerCase()}.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
