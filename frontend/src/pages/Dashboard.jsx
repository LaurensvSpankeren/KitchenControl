import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiClient } from '../api/client'

export default function Dashboard() {
  const [ingredientCount, setIngredientCount] = useState(0)
  const [semiFinishedCount, setSemiFinishedCount] = useState(0)

  useEffect(() => {
    let active = true

    async function loadSummary() {
      try {
        const [ingredients, semiFinished] = await Promise.all([
          apiClient.getIngredients(),
          apiClient.getSemiFinishedProducts()
        ])
        if (active) {
          setIngredientCount(Array.isArray(ingredients) ? ingredients.length : 0)
          setSemiFinishedCount(Array.isArray(semiFinished) ? semiFinished.length : 0)
        }
      } catch {
        if (active) {
          setIngredientCount(0)
          setSemiFinishedCount(0)
        }
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <header className="page-header">
        <h2>Dashboard</h2>
        <p>Overzicht van signalen en snelle toegang tot modules.</p>
      </header>

      <section className="card-grid">
        <article className="card">
          <h3>Laatste importstatus</h3>
          <p>Gebruik Inkoopproducten om een nieuwe CSV-import te draaien.</p>
        </article>
        <article className="card">
          <h3>Sterke prijsstijgingen</h3>
          <p>Placeholder voor signalering prijsstijgingen.</p>
        </article>
        <article className="card">
          <h3>Gerechten onder marge</h3>
          <p>Placeholder voor marge-signalen gerechten.</p>
        </article>
        <article className="card">
          <h3>Buffetten onder marge</h3>
          <p>Placeholder voor marge-signalen buffetten.</p>
        </article>
      </section>

      <section className="card quick-nav-card">
        <h3>Snelle navigatie</h3>
        <div className="quick-nav-grid">
          <Link className="quick-nav-link" to="/inkoopproducten">
            Inkoopproducten
            <span>{ingredientCount} producten</span>
          </Link>
          <Link className="quick-nav-link" to="/halffabricaten">
            Halffabricaten
            <span>{semiFinishedCount} halffabricaten</span>
          </Link>
          <Link className="quick-nav-link" to="/gerechten">
            Gerechten
            <span>Module openen</span>
          </Link>
          <Link className="quick-nav-link" to="/menus">
            Menu's
            <span>Module openen</span>
          </Link>
          <Link className="quick-nav-link" to="/buffetten">
            Buffetten
            <span>Module openen</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
