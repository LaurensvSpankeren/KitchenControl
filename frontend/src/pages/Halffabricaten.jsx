import React, { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'

const initialForm = {
  photo_url: '',
  name: '',
  category: '',
  subcategory: '',
  final_yield_amount: '',
  final_yield_unit: '',
  storage_advice: '',
  shelf_life_after_preparation_days: ''
}

const EMPTY_STEPS = Array.from({ length: 10 }, () => '')

function formatCurrency(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  const num = Number(value)
  if (Number.isNaN(num)) {
    return '-'
  }
  return `€ ${num.toFixed(digits).replace('.', ',')}`
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  const num = Number(value)
  if (Number.isNaN(num)) {
    return '-'
  }
  return `${num.toFixed(2).replace('.', ',')}%`
}

function formatYield(value, unit) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  return `${value} ${unit || ''}`.trim()
}

function mapProductToForm(product) {
  return {
    photo_url: product.photo_url || '',
    name: product.name || '',
    category: product.category || '',
    subcategory: product.subcategory || '',
    final_yield_amount: product.final_yield_amount ?? '',
    final_yield_unit: product.final_yield_unit || '',
    storage_advice: product.storage_advice || '',
    shelf_life_after_preparation_days: product.shelf_life_after_preparation_days ?? ''
  }
}

function mapFormToPayload(form) {
  return {
    name: form.name.trim(),
    photo_url: form.photo_url.trim() || null,
    category: form.category.trim() || null,
    subcategory: form.subcategory.trim() || null,
    final_yield_amount: form.final_yield_amount === '' ? null : Number(form.final_yield_amount),
    final_yield_unit: form.final_yield_unit.trim() || null,
    storage_advice: form.storage_advice.trim() || null,
    shelf_life_after_preparation_days:
      form.shelf_life_after_preparation_days === ''
        ? null
        : Number(form.shelf_life_after_preparation_days)
  }
}

export default function Halffabricaten() {
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [subcategoryFilter, setSubcategoryFilter] = useState('')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [steps, setSteps] = useState(EMPTY_STEPS)
  const [detail, setDetail] = useState(null)

  const [ingredientSearch, setIngredientSearch] = useState('')
  const [selectedIngredient, setSelectedIngredient] = useState(null)
  const [recipeQuantity, setRecipeQuantity] = useState('')
  const [recipeUnit, setRecipeUnit] = useState('gram')

  const [editingLineId, setEditingLineId] = useState(null)
  const [editingLineQuantity, setEditingLineQuantity] = useState('')
  const [editingLineUnit, setEditingLineUnit] = useState('')

  const [pageMessage, setPageMessage] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewPayload, setPreviewPayload] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  async function loadProducts() {
    try {
      const data = await apiClient.getSemiFinishedProducts()
      setProducts(Array.isArray(data) ? data : [])
    } catch {
      setProducts([])
    }
  }

  async function loadIngredients() {
    try {
      const data = await apiClient.getIngredients()
      setIngredients(Array.isArray(data) ? data : [])
    } catch {
      setIngredients([])
    }
  }

  async function loadDetail(productId) {
    if (!productId) {
      setDetail(null)
      return
    }

    try {
      const data = await apiClient.getSemiFinishedProductDetail(productId)
      setDetail(data)

      const newSteps = [...EMPTY_STEPS]
      ;(data.recipe_steps || []).forEach((step) => {
        const index = Number(step.step_number) - 1
        if (index >= 0 && index < 10) {
          newSteps[index] = step.instruction || ''
        }
      })
      setSteps(newSteps)
    } catch {
      setDetail(null)
    }
  }

  useEffect(() => {
    loadProducts()
    loadIngredients()
  }, [])

  const categoryOptions = useMemo(
    () => [...new Set(products.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl')),
    [products]
  )

  const subcategoryOptions = useMemo(
    () => [...new Set(products.map((item) => item.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl')),
    [products]
  )

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return products
      .filter((item) => {
        if (categoryFilter && item.category !== categoryFilter) {
          return false
        }
        if (subcategoryFilter && item.subcategory !== subcategoryFilter) {
          return false
        }
        if (!term) {
          return true
        }
        return String(item.name || '').toLowerCase().includes(term)
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nl'))
  }, [products, searchTerm, categoryFilter, subcategoryFilter])

  const filteredIngredients = useMemo(() => {
    const term = ingredientSearch.trim().toLowerCase()
    if (!term) {
      return []
    }
    return ingredients
      .filter((ingredient) => {
        const byName = String(ingredient.supplier_product_name || '').toLowerCase().includes(term)
        const byBrand = String(ingredient.supplier_brand || '').toLowerCase().includes(term)
        const byCode = String(ingredient.supplier_product_code || '').toLowerCase().includes(term)
        return byName || byBrand || byCode
      })
      .slice(0, 25)
  }, [ingredientSearch, ingredients])

  function openNewModal() {
    setSelectedProductId(null)
    setFormData(initialForm)
    setSteps([...EMPTY_STEPS])
    setDetail(null)
    setIngredientSearch('')
    setSelectedIngredient(null)
    setRecipeQuantity('')
    setRecipeUnit('gram')
    setEditingLineId(null)
    setEditingLineQuantity('')
    setEditingLineUnit('')
    setModalMessage('')
    setErrorMessage('')
    setPreviewTitle('')
    setPreviewPayload(null)
    setIsModalOpen(true)
  }

  async function openEditModal(product) {
    setSelectedProductId(product.id)
    setFormData(mapProductToForm(product))
    setIngredientSearch('')
    setSelectedIngredient(null)
    setRecipeQuantity('')
    setRecipeUnit('gram')
    setEditingLineId(null)
    setEditingLineQuantity('')
    setEditingLineUnit('')
    setModalMessage('')
    setErrorMessage('')
    setPreviewTitle('')
    setPreviewPayload(null)
    setIsModalOpen(true)
    await loadDetail(product.id)
  }

  function closeModal() {
    if (isSaving) {
      return
    }
    setIsModalOpen(false)
  }

  function handleFormChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  function handleStepChange(index, value) {
    setSteps((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function startEditLine(line) {
    setEditingLineId(line.id)
    setEditingLineQuantity(String(line.quantity ?? ''))
    setEditingLineUnit(line.unit || '')
    setModalMessage('')
    setErrorMessage('')
  }

  function cancelEditLine() {
    setEditingLineId(null)
    setEditingLineQuantity('')
    setEditingLineUnit('')
  }

  async function handleSaveEditedLine(line) {
    if (!selectedProductId) {
      return
    }

    const quantity = Number(editingLineQuantity)
    if (!editingLineQuantity || Number.isNaN(quantity) || quantity <= 0) {
      setErrorMessage('Vul een geldige hoeveelheid in voor de regel.')
      return
    }
    if (!editingLineUnit.trim()) {
      setErrorMessage('Vul een eenheid in voor de regel.')
      return
    }

    setErrorMessage('')
    try {
      await apiClient.updateSemiFinishedProductRecipeLine(selectedProductId, line.id, {
        quantity,
        unit: editingLineUnit.trim(),
        sort_order: line.sort_order
      })
      await loadDetail(selectedProductId)
      await loadProducts()
      setModalMessage('Receptregel bijgewerkt.')
      cancelEditLine()
    } catch {
      setErrorMessage('Receptregel bijwerken mislukt.')
    }
  }

  async function handleDeleteLine(line) {
    if (!selectedProductId) {
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je deze receptregel wilt verwijderen?')
    if (!confirmed) {
      return
    }

    setErrorMessage('')
    try {
      await apiClient.deleteSemiFinishedProductRecipeLine(selectedProductId, line.id)
      await loadDetail(selectedProductId)
      await loadProducts()
      setModalMessage('Receptregel verwijderd.')
      if (editingLineId === line.id) {
        cancelEditLine()
      }
    } catch {
      setErrorMessage('Receptregel verwijderen mislukt.')
    }
  }

  async function handleSaveProduct() {
    const name = formData.name.trim()
    if (!name) {
      setErrorMessage('Naam is verplicht.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    setModalMessage('')

    try {
      const payload = mapFormToPayload(formData)
      let productId = selectedProductId

      if (productId) {
        await apiClient.updateSemiFinishedProduct(productId, payload)
      } else {
        const created = await apiClient.createSemiFinishedProduct(payload)
        productId = created.id
        setSelectedProductId(created.id)
      }

      const cleanedSteps = steps
        .map((instruction, index) => ({
          step_number: index + 1,
          instruction: instruction.trim()
        }))
        .filter((step) => step.instruction)

      await apiClient.saveSemiFinishedProductSteps(productId, { steps: cleanedSteps })
      await loadProducts()
      await loadDetail(productId)
      setModalMessage('Halffabricaat opgeslagen.')
      setPageMessage('Halffabricaat opgeslagen.')
    } catch {
      setErrorMessage('Opslaan mislukt.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddIngredientLine() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op voordat je ingrediënten toevoegt.')
      return
    }
    if (!selectedIngredient) {
      setErrorMessage('Kies eerst een ingrediënt.')
      return
    }

    const quantity = Number(recipeQuantity)
    if (!recipeQuantity || Number.isNaN(quantity) || quantity <= 0) {
      setErrorMessage('Vul een geldige hoeveelheid in.')
      return
    }

    if (!recipeUnit.trim()) {
      setErrorMessage('Vul een eenheid in.')
      return
    }

    setErrorMessage('')
    try {
      await apiClient.addSemiFinishedProductRecipeLine(selectedProductId, {
        item_type: 'ingredient',
        item_id: selectedIngredient.id,
        quantity,
        unit: recipeUnit.trim()
      })
      await loadDetail(selectedProductId)
      await loadProducts()
      setIngredientSearch('')
      setSelectedIngredient(null)
      setRecipeQuantity('')
      setRecipeUnit('gram')
      setModalMessage('Ingrediënt toegevoegd aan recept.')
    } catch {
      setErrorMessage('Ingrediënt toevoegen mislukt.')
    }
  }

  async function handleShowPrintPayload() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op.')
      return
    }

    try {
      const payload = await apiClient.getSemiFinishedProductPrint(selectedProductId)
      setPreviewTitle('Productfiche payload')
      setPreviewPayload(payload)
    } catch {
      setErrorMessage('Productfiche payload ophalen mislukt.')
    }
  }

  async function handleShowLabelPayload() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op.')
      return
    }

    try {
      const payload = await apiClient.getSemiFinishedProductLabel(selectedProductId)
      setPreviewTitle('Dagetiket payload')
      setPreviewPayload(payload)
    } catch {
      setErrorMessage('Dagetiket payload ophalen mislukt.')
    }
  }

  async function handlePrintRecipe() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op.')
      return
    }

    try {
      const payload = await apiClient.getSemiFinishedProductPrint(selectedProductId)
      const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
      if (!printWindow) {
        setErrorMessage('Printvenster kon niet worden geopend.')
        return
      }

      const lines = (payload.ingredients || [])
        .map(
          (line) =>
            `<tr><td>${line.item_name || '-'}</td><td>${line.quantity || '-'}</td><td>${line.unit || '-'}</td><td>${line.line_cost ?? '-'}</td></tr>`
        )
        .join('')

      const stepsHtml = (payload.recipe_steps || [])
        .map((step) => `<li>${step.step_number}. ${step.instruction}</li>`)
        .join('')

      printWindow.document.write(`
        <html>
          <head><title>Keukenrecept - ${payload.name}</title></head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>${payload.name || ''}</h1>
            <p><strong>Categorie:</strong> ${payload.category || '-'}</p>
            <p><strong>Subcategorie:</strong> ${payload.subcategory || '-'}</p>
            <p><strong>Inslag totaal:</strong> ${formatCurrency(payload.inslag_totaal)}</p>
            <p><strong>Allergenen totaal:</strong> ${payload.allergenen_totaal || 'Geen allergeneninformatie beschikbaar'}</p>
            <p><strong>Eindgewicht/eindinhoud:</strong> ${formatYield(payload.final_yield_amount, payload.final_yield_unit)}</p>
            <p><strong>Bewaaradvies:</strong> ${payload.storage_advice || '-'}</p>
            <h2>Ingrediënten</h2>
            <table border="1" cellspacing="0" cellpadding="6">
              <thead><tr><th>Ingrediënt</th><th>Hoeveelheid</th><th>Eenheid</th><th>Regelprijs</th></tr></thead>
              <tbody>${lines}</tbody>
            </table>
            <h2>Receptstappen</h2>
            <ol>${stepsHtml}</ol>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    } catch {
      setErrorMessage('Printen mislukt.')
    }
  }

  const allergensText = detail?.allergens_total || 'Geen allergeneninformatie beschikbaar'

  return (
    <div>
      <header className="page-header">
        <h2>Halffabricaten</h2>
        <p>Beheer eigen recepturen zoals soepen, sauzen, dressings en toppings.</p>
      </header>

      <section className="card">
        <div className="sfp-toolbar">
          <input
            type="text"
            placeholder="Zoek op naam"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Alle categorieën</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select value={subcategoryFilter} onChange={(event) => setSubcategoryFilter(event.target.value)}>
            <option value="">Alle subcategorieën</option>
            {subcategoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button type="button" className="sfp-new-btn" onClick={openNewModal}>
            Nieuw halffabricaat
          </button>
        </div>

        {pageMessage ? <p className="form-info inline-message">{pageMessage}</p> : null}

        {filteredProducts.length === 0 ? (
          <p>Nog geen halffabricaten gevonden.</p>
        ) : (
          <div className="table-scroll">
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Categorie</th>
                  <th>Subcategorie</th>
                  <th>Inslag</th>
                  <th>Eindgewicht/eindinhoud</th>
                  <th>Allergenen</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.category || '-'}</td>
                    <td>{item.subcategory || '-'}</td>
                    <td>{formatCurrency(item.estimated_cost_total)}</td>
                    <td>{formatYield(item.final_yield_amount, item.final_yield_unit)}</td>
                    <td>{item.allergens_total || 'Geen allergeneninformatie beschikbaar'}</td>
                    <td>
                      <button type="button" className="table-action-btn" onClick={() => openEditModal(item)}>
                        Openen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide sfp-modal">
            <div className="modal-header">
              <h3>{selectedProductId ? 'Halffabricaat bewerken' : 'Nieuw halffabricaat'}</h3>
            </div>

            <div className="modal-body">
              {errorMessage ? <div className="modal-validation-banner">{errorMessage}</div> : null}
              {modalMessage ? <p className="form-info inline-message">{modalMessage}</p> : null}

              <section className="modal-section">
                <h4>Basis</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Foto URL
                    <input
                      type="text"
                      placeholder="https://..."
                      value={formData.photo_url}
                      onChange={(event) => handleFormChange('photo_url', event.target.value)}
                    />
                  </label>
                  <label>
                    Naam
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(event) => handleFormChange('name', event.target.value)}
                    />
                  </label>
                  <label>
                    Categorie
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(event) => handleFormChange('category', event.target.value)}
                    />
                  </label>
                  <label>
                    Subcategorie
                    <input
                      type="text"
                      value={formData.subcategory}
                      onChange={(event) => handleFormChange('subcategory', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Ingrediënten</h4>
                <div className="sfp-ingredient-add">
                  <input
                    type="text"
                    placeholder="Zoek op naam, merk of artikelnummer"
                    value={ingredientSearch}
                    onChange={(event) => setIngredientSearch(event.target.value)}
                  />

                  {ingredientSearch.trim() ? (
                    filteredIngredients.length > 0 ? (
                      <div className="ingredient-picker">
                        {filteredIngredients.map((ingredient) => (
                          <button
                            key={ingredient.id}
                            type="button"
                            className={`ingredient-picker-item${selectedIngredient?.id === ingredient.id ? ' is-active' : ''}`}
                            onClick={() => setSelectedIngredient(ingredient)}
                          >
                            {ingredient.supplier_product_name} {ingredient.supplier_brand ? `(${ingredient.supplier_brand})` : ''} - {ingredient.supplier_product_code}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>Geen ingrediënten gevonden.</p>
                    )
                  ) : null}

                  <div className="recipe-line-inline">
                    <input
                      type="number"
                      step="any"
                      placeholder="Hoeveelheid"
                      value={recipeQuantity}
                      onChange={(event) => setRecipeQuantity(event.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Eenheid"
                      value={recipeUnit}
                      onChange={(event) => setRecipeUnit(event.target.value)}
                    />
                  </div>

                  <button type="button" onClick={handleAddIngredientLine}>
                    Toevoegen aan recept
                  </button>
                </div>

                {detail?.recipe_lines?.length ? (
                  <div className="table-scroll">
                    <table className="recipe-lines-table">
                      <thead>
                        <tr>
                          <th>Ingrediënt</th>
                          <th>Merk</th>
                          <th>Hoeveelheid</th>
                          <th>Eenheid</th>
                          <th>Regelprijs</th>
                          <th>% van inslag</th>
                          <th>Allergenen</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.recipe_lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.item_name || `#${line.item_id}`}</td>
                            <td>{line.item_brand || '-'}</td>
                            <td>
                              {editingLineId === line.id ? (
                                <input
                                  type="number"
                                  step="any"
                                  className="line-edit-input"
                                  value={editingLineQuantity}
                                  onChange={(event) => setEditingLineQuantity(event.target.value)}
                                />
                              ) : (
                                line.quantity
                              )}
                            </td>
                            <td>
                              {editingLineId === line.id ? (
                                <input
                                  type="text"
                                  className="line-edit-input"
                                  value={editingLineUnit}
                                  onChange={(event) => setEditingLineUnit(event.target.value)}
                                />
                              ) : (
                                line.unit
                              )}
                            </td>
                            <td>{formatCurrency(line.line_cost)}</td>
                            <td>{formatPercent(line.line_cost_share_percent)}</td>
                            <td>{line.allergens_summary || 'Geen allergeneninformatie beschikbaar'}</td>
                            <td>
                              <div className="line-actions">
                                {editingLineId === line.id ? (
                                  <>
                                    <button type="button" className="table-action-btn" onClick={() => handleSaveEditedLine(line)}>
                                      Opslaan
                                    </button>
                                    <button type="button" className="table-action-btn" onClick={cancelEditLine}>
                                      Annuleren
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="table-action-btn" onClick={() => startEditLine(line)}>
                                      Bewerken
                                    </button>
                                    <button type="button" className="table-action-btn" onClick={() => handleDeleteLine(line)}>
                                      Verwijderen
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Nog geen ingrediëntenregels.</p>
                )}

                <p className="sfp-total-line">
                  <strong>Inslag totaal:</strong> {formatCurrency(detail?.estimated_cost_total)}
                </p>
                <p className="sfp-total-line">
                  <strong>Kostprijs per eindeenheid:</strong>{' '}
                  {detail?.cost_per_final_unit !== null && detail?.cost_per_final_unit !== undefined && detail?.final_yield_unit
                    ? `${formatCurrency(detail.cost_per_final_unit, 4)} per ${detail.final_yield_unit}`
                    : 'Nog niet berekenbaar'}
                </p>
              </section>

              <section className="modal-section">
                <h4>Receptstappen</h4>
                <div className="modal-grid one-col calm-grid">
                  {steps.map((step, index) => (
                    <label key={`step-${index + 1}`}>
                      Stap {index + 1}
                      <textarea
                        value={step}
                        onChange={(event) => handleStepChange(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="modal-section">
                <h4>Afwerking</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Eindgewicht / eindinhoud
                    <input
                      type="number"
                      step="any"
                      value={formData.final_yield_amount}
                      onChange={(event) => handleFormChange('final_yield_amount', event.target.value)}
                    />
                  </label>
                  <label>
                    Eenheid eindproduct
                    <input
                      type="text"
                      value={formData.final_yield_unit}
                      onChange={(event) => handleFormChange('final_yield_unit', event.target.value)}
                    />
                  </label>
                  <label className="full-width">
                    Bewaaradvies
                    <textarea
                      value={formData.storage_advice}
                      onChange={(event) => handleFormChange('storage_advice', event.target.value)}
                    />
                  </label>
                  <label>
                    Houdbaarheid na bereiding (dagen)
                    <input
                      type="number"
                      step="1"
                      value={formData.shelf_life_after_preparation_days}
                      onChange={(event) =>
                        handleFormChange('shelf_life_after_preparation_days', event.target.value)
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Allergenen</h4>
                <p>{allergensText}</p>
              </section>

              {previewPayload ? (
                <section className="modal-section">
                  <h4>{previewTitle}</h4>
                  <pre className="payload-preview">{JSON.stringify(previewPayload, null, 2)}</pre>
                </section>
              ) : null}
            </div>

            <div className="modal-actions sfp-actions">
              <button type="button" className="primary-btn" onClick={handleSaveProduct} disabled={isSaving}>
                {isSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button type="button" onClick={handlePrintRecipe}>Print keukenrecept</button>
              <button type="button" onClick={handleShowPrintPayload}>Toon productfiche payload</button>
              <button type="button" onClick={handleShowLabelPayload}>Toon dagetiket payload</button>
              <button type="button" className="secondary-btn" onClick={closeModal}>Sluiten</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
