import React from 'react'
import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

export default function Dashboard() {
  const [ingredients, setIngredients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [importMessage, setImportMessage] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  async function loadIngredients() {
    try {
      const data = await apiClient.getIngredients()
      setIngredients(Array.isArray(data) ? data : [])
    } catch {
      setIngredients([])
    }
  }

  useEffect(() => {
    let active = true

    async function loadIngredientsOnMount() {
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

    loadIngredientsOnMount()

    return () => {
      active = false
    }
  }, [])

  async function handleImport() {
    if (!selectedFile || isImporting) {
      return
    }

    setIsImporting(true)
    setImportMessage('')
    try {
      const result = await apiClient.importIngredientsCsv(selectedFile)
      setImportMessage(`Import geslaagd: ${result.created} aangemaakt, ${result.updated} bijgewerkt`)
      await loadIngredients()
    } catch {
      setImportMessage('Import mislukt')
    } finally {
      setIsImporting(false)
    }
  }

  const filteredIngredients = ingredients.filter((ingredient) =>
    (ingredient.supplier_product_name || '')
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )
  const hasSearch = searchTerm.trim().length > 0

  function formatPrice(value) {
    if (value === null || value === undefined || value === '') {
      return '-'
    }
    const number = Number(value)
    if (Number.isNaN(number)) {
      return '-'
    }
    return `€ ${number.toFixed(2).replace('.', ',')}`
  }

  function formatVat(value) {
    if (value === null || value === undefined || value === '') {
      return '-'
    }
    const number = Number(value)
    if (Number.isNaN(number)) {
      return '-'
    }
    return `${number}%`
  }

  return (
    <main className="dashboard">
      <section className="card">
        <h2>Import status</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
        <button type="button" onClick={handleImport} disabled={!selectedFile || isImporting}>
          {isImporting ? 'Bezig met importeren...' : 'CSV uploaden'}
        </button>
        {importMessage ? <p>{importMessage}</p> : null}
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
          className="search-input"
          type="text"
          placeholder="Zoek op naam"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        {!hasSearch ? (
          <p>Typ om ingrediënten te zoeken</p>
        ) : filteredIngredients.length === 0 ? (
          <p>Geen ingrediënten gevonden</p>
        ) : (
          <table className="ingredients-table">
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
                  <td>{formatPrice(ingredient.supplier_price_ex_vat)}</td>
                  <td>{formatVat(ingredient.supplier_vat_rate)}</td>
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
