import React from 'react'
import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

export default function Dashboard() {
  const [ingredients, setIngredients] = useState([])

  useEffect(() => {
    let active = true

    async function loadIngredients() {
      try {
        const data = await apiClient.getIngredients()
        if (active) {
          setIngredients(Array.isArray(data) ? data : [])
        }
      } catch {
        if (active) {
          setIngredients([])
        }
      }
    }

    loadIngredients()

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="dashboard">
      <section className="card">
        <h2>Import status</h2>
      </section>
      <section className="card">
        <h2>Prijsstijgingen</h2>
      </section>
      <section className="card">
        <h2>Gerechten onder marge</h2>
      </section>
      <section className="card">
        <h2>Snelle acties</h2>
      </section>
      <section className="card">
        <h2>Ingredients</h2>
        {ingredients.length === 0 ? (
          <p>No ingredients yet</p>
        ) : (
          <ul>
            {ingredients.map((ingredient) => (
              <li key={ingredient.id}>{ingredient.supplier_product_name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
