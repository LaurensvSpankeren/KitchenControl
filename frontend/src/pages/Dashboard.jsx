import React from 'react'
import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

export default function Dashboard() {
  const [ingredients, setIngredients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

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

  const filteredIngredients = ingredients.filter((ingredient) =>
    (ingredient.supplier_product_name || '')
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )

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
        <h2>Ingrediënten</h2>
        <input
          type="text"
          placeholder="Zoek op naam"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        {filteredIngredients.length === 0 ? (
          <p>Geen ingrediënten gevonden</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Leverancier</th>
                <th>Prijs</th>
                <th>BTW</th>
                <th>Eenheid</th>
              </tr>
            </thead>
            <tbody>
              {filteredIngredients.map((ingredient) => (
                <tr key={ingredient.id}>
                  <td>{ingredient.supplier_product_name || '-'}</td>
                  <td>{ingredient.supplier_name || '-'}</td>
                  <td>{ingredient.supplier_price_ex_vat ?? '-'}</td>
                  <td>{ingredient.supplier_vat_rate ?? '-'}</td>
                  <td>{ingredient.supplier_unit || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
