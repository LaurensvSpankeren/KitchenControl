import React from 'react'
import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

export default function Dashboard() {
  const [ingredients, setIngredients] = useState([])
  const [semiFinishedProducts, setSemiFinishedProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [semiFinishedName, setSemiFinishedName] = useState('')
  const [semiFinishedDescription, setSemiFinishedDescription] = useState('')
  const [semiFinishedMessage, setSemiFinishedMessage] = useState('')
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

  async function loadSemiFinishedProducts() {
    try {
      const data = await apiClient.getSemiFinishedProducts()
      setSemiFinishedProducts(Array.isArray(data) ? data : [])
    } catch {
      setSemiFinishedProducts([])
    }
  }

  useEffect(() => {
    let active = true

    async function loadDataOnMount() {
      try {
        const [ingredientsData, semiFinishedProductsData] = await Promise.all([
          apiClient.getIngredients(),
          apiClient.getSemiFinishedProducts()
        ])
        if (active) {
          setIngredients(Array.isArray(ingredientsData) ? ingredientsData : [])
          setSemiFinishedProducts(
            Array.isArray(semiFinishedProductsData) ? semiFinishedProductsData : []
          )
        }
      } catch {
        if (active) {
          setIngredients([])
          setSemiFinishedProducts([])
        }
      }
    }

    loadDataOnMount()

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

  async function handleCreateSemiFinishedProduct() {
    const name = semiFinishedName.trim()
    if (!name) {
      setSemiFinishedMessage('Naam is verplicht')
      return
    }

    try {
      await apiClient.createSemiFinishedProduct({
        name,
        description: semiFinishedDescription.trim() || null
      })
      setSemiFinishedMessage('Halffabricaat opgeslagen')
      setSemiFinishedName('')
      setSemiFinishedDescription('')
      await loadSemiFinishedProducts()
    } catch {
      setSemiFinishedMessage('Opslaan mislukt')
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
        <h2>Halffabricaten</h2>
        <input
          type="text"
          placeholder="Naam"
          value={semiFinishedName}
          onChange={(event) => setSemiFinishedName(event.target.value)}
        />
        <textarea
          placeholder="Omschrijving (optioneel)"
          value={semiFinishedDescription}
          onChange={(event) => setSemiFinishedDescription(event.target.value)}
        />
        <button type="button" onClick={handleCreateSemiFinishedProduct}>
          Halffabricaat toevoegen
        </button>
        {semiFinishedMessage ? <p>{semiFinishedMessage}</p> : null}
        {semiFinishedProducts.length === 0 ? (
          <p>Nog geen halffabricaten</p>
        ) : (
          <ul>
            {semiFinishedProducts.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                {item.description ? ` - ${item.description}` : ''}
              </li>
            ))}
          </ul>
        )}
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
