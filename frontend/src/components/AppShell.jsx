import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { apiClient } from '../api/client'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/ingredientenbeheer', label: 'Ingrediëntenbeheer' },
  { to: '/importbeheer', label: 'Importbeheer' },
  { to: '/halffabricaten', label: 'Halffabricaten' },
  { to: '/gerechten', label: 'Gerechten' },
  { to: '/menukaarten', label: 'Menukaarten' },
  { to: '/buffetten', label: 'Buffetten' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
]

export default function AppShell({ onLogout }) {
  const [importAlerts, setImportAlerts] = useState(0)
  const location = useLocation()

  useEffect(() => {
    let isCancelled = false

    async function loadImportAlerts() {
      try {
        const [manualMatches, manualReview, staleImport, issues] = await Promise.all([
          apiClient.getManualIngredientsWithMatches(),
          apiClient.getManualIngredientsForReview(),
          apiClient.getStaleImportIngredients(),
          apiClient.getImportIssues({ status: 'open' })
        ])

        const duplicateIssues = Array.isArray(issues)
          ? issues.filter((issue) => issue.issue_type === 'duplicate_conflict_in_file')
          : []

        if (!isCancelled) {
          setImportAlerts(
            (Array.isArray(manualMatches) ? manualMatches.length : 0) +
              (Array.isArray(manualReview) ? manualReview.length : 0) +
              (Array.isArray(staleImport) ? staleImport.length : 0) +
              duplicateIssues.length
          )
        }
      } catch (error) {
        console.error('Importbeheer badge laden mislukt.', error)
        if (!isCancelled) {
          setImportAlerts(0)
        }
      }
    }

    loadImportAlerts()

    return () => {
      isCancelled = true
    }
  }, [location.pathname])

  const importAlertsLabel = useMemo(() => {
    if (importAlerts <= 0) {
      return null
    }
    return importAlerts > 99 ? '99+' : String(importAlerts)
  }, [importAlerts])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <h1>KitchenControl</h1>
          <p>Calculatie & receptuur</p>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-link${isActive ? ' is-active' : ''}`
              }
            >
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                {item.icon ? (
                  <span aria-hidden="true" style={{ display: 'inline-flex', width: '1rem', justifyContent: 'center' }}>
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
                {item.to === '/importbeheer' && importAlertsLabel ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-0.35rem',
                      right: '-1.15rem',
                      minWidth: '1.2rem',
                      height: '1.2rem',
                      padding: '0 0.3rem',
                      borderRadius: '999px',
                      background: '#dc2626',
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      lineHeight: '1.2rem',
                      textAlign: 'center',
                      boxShadow: '0 0 0 2px #fff'
                    }}
                  >
                    {importAlertsLabel}
                  </span>
                ) : null}
              </span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className="logout-btn" onClick={onLogout}>
          Uitloggen
        </button>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
