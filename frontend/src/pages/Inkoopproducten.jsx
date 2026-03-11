import React, { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

export default function Inkoopproducten() {
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
    loadIngredients()
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
    <div>
      <header className="page-header">
        <h2>Inkoopproducten</h2>
        <p>Beheer leveranciersproducten en importeer Bidfood CSV-bestanden.</p>
      </header>

      <section className="card-grid">
        <article className="card">
          <h3>Importeren</h3>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
          <button type="button" onClick={handleImport} disabled={!selectedFile || isImporting}>
            {isImporting ? 'Bezig met importeren...' : 'CSV uploaden'}
          </button>
          {importMessage ? <p>{importMessage}</p> : null}
        </article>

        <article className="card">
          <h3>Zoeken</h3>
          <input
            className="search-input"
            type="text"
            placeholder="Zoek op naam"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {!searchTerm.trim() ? (
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
        </article>
      </section>
    </div>
  )
}
