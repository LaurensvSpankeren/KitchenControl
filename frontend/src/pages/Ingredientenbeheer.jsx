import React, { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'

const requiredLabels = {
  name: 'Naam',
  articleNumber: 'Artikelnummer',
  supplier: 'Leverancier',
  pricePerPackage: 'Prijs per verpakking',
  vat: 'BTW',
  packageUnit: 'Verpakking',
  packageContent: 'Inhoud verpakking',
  baseUnit: 'Rekeneenheid',
  amountPerPackage: 'Aantal per verpakking'
}

const initialForm = {
  name: '',
  articleNumber: '',
  supplier: '',
  brand: '',
  productGroup: '',
  pricePerPackage: '',
  vat: '',
  packageUnit: '',
  packageContent: '',
  baseUnit: '',
  amountPerPackage: '',
  yieldPercent: '',
  wastePercent: '',
  internalCategory: '',
  notes: '',
  allergensCross: ''
}

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

function splitInternalNotes(value) {
  if (!value) {
    return { internalCategory: '', notes: '' }
  }

  const lines = String(value).split('\n')
  const firstLine = lines[0] || ''
  const prefix = 'Eigen categorie:'
  if (firstLine.trim().startsWith(prefix)) {
    return {
      internalCategory: firstLine.replace(prefix, '').trim(),
      notes: lines.slice(1).join('\n').trim()
    }
  }

  return { internalCategory: '', notes: String(value) }
}

function mapIngredientToForm(ingredient) {
  const parsedNotes = splitInternalNotes(ingredient.internal_notes)
  return {
    name: ingredient.supplier_product_name || '',
    articleNumber: ingredient.supplier_product_code || '',
    supplier: ingredient.supplier_name || '',
    brand: ingredient.supplier_brand || '',
    productGroup: ingredient.category || '',
    pricePerPackage: ingredient.supplier_price_ex_vat ?? '',
    vat: ingredient.supplier_vat_rate ?? '',
    packageUnit: ingredient.supplier_unit || '',
    packageContent: ingredient.supplier_net_content ?? '',
    baseUnit: ingredient.base_unit || '',
    amountPerPackage: ingredient.conversion_factor_to_base ?? '',
    yieldPercent: ingredient.yield_percent ?? '',
    wastePercent: ingredient.waste_percent ?? '',
    internalCategory: parsedNotes.internalCategory,
    notes: parsedNotes.notes,
    allergensCross:
      ingredient.cross_contamination_notes || ingredient.internal_allergens_extra || ''
  }
}

function mapFormToPayload(formData) {
  const internalCategory = formData.internalCategory.trim()
  const noteText = formData.notes.trim()
  const notesWithCategory = internalCategory
    ? noteText
      ? `Eigen categorie: ${internalCategory}\n${noteText}`
      : `Eigen categorie: ${internalCategory}`
    : noteText || null

  return {
    supplier_name: formData.supplier.trim(),
    supplier_product_code: formData.articleNumber.trim(),
    supplier_product_name: formData.name.trim(),
    supplier_brand: formData.brand.trim() || null,
    supplier_unit: formData.packageUnit.trim(),
    supplier_net_content: Number(formData.packageContent),
    supplier_price_ex_vat: Number(formData.pricePerPackage),
    supplier_vat_rate: Number(formData.vat),
    base_unit: formData.baseUnit.trim(),
    conversion_factor_to_base: Number(formData.amountPerPackage),
    yield_percent: formData.yieldPercent ? Number(formData.yieldPercent) : null,
    waste_percent: formData.wastePercent ? Number(formData.wastePercent) : null,
    category: formData.productGroup.trim() || internalCategory || null,
    internal_notes: notesWithCategory,
    internal_allergens_extra: formData.allergensCross.trim() || null,
    cross_contamination_notes: formData.allergensCross.trim() || null
  }
}

export default function Ingredientenbeheer() {
  const [ingredients, setIngredients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingIngredientId, setEditingIngredientId] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [validationMessage, setValidationMessage] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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

  const sortedIngredients = useMemo(
    () =>
      [...ingredients].sort((a, b) =>
        String(a.supplier_product_name || '').localeCompare(
          String(b.supplier_product_name || ''),
          'nl'
        )
      ),
    [ingredients]
  )

  const visibleIngredients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      return sortedIngredients.slice(0, 50)
    }
    return sortedIngredients.filter((ingredient) =>
      String(ingredient.supplier_product_name || '').toLowerCase().includes(term)
    )
  }, [searchTerm, sortedIngredients])

  function openCreateModal() {
    setEditingIngredientId(null)
    setFormData(initialForm)
    setValidationMessage('')
    setSaveMessage('')
    setIsModalOpen(true)
  }

  function openEditModal(ingredient) {
    setEditingIngredientId(ingredient.id)
    setFormData(mapIngredientToForm(ingredient))
    setValidationMessage('')
    setSaveMessage('')
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSaving) {
      return
    }
    setIsModalOpen(false)
  }

  function handleFieldChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  function validateForm() {
    const requiredFields = [
      'name',
      'articleNumber',
      'supplier',
      'pricePerPackage',
      'vat',
      'packageUnit',
      'packageContent',
      'baseUnit',
      'amountPerPackage'
    ]

    const missing = requiredFields.filter((field) => !String(formData[field]).trim())
    if (missing.length > 0) {
      setValidationMessage(
        `Vul verplichte velden in: ${missing.map((field) => requiredLabels[field]).join(', ')}`
      )
      return false
    }

    setValidationMessage('')
    return true
  }

  async function handleSave() {
    if (!validateForm()) {
      return
    }

    setIsSaving(true)
    setSaveMessage('')

    try {
      const payload = mapFormToPayload(formData)
      if (editingIngredientId) {
        await apiClient.updateIngredient(editingIngredientId, payload)
      } else {
        await apiClient.createIngredient(payload)
      }

      await loadIngredients()
      setIsModalOpen(false)
      setSaveMessage(editingIngredientId ? 'Ingrediënt bijgewerkt' : 'Ingrediënt opgeslagen')
    } catch {
      setSaveMessage('Opslaan mislukt')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <header className="page-header">
        <h2>Ingrediëntenbeheer</h2>
        <p>Zoek, bekijk en beheer handmatig ingevoerde ingrediënten.</p>
      </header>

      <section className="card">
        <div className="ingredient-header-row">
          <h3>Ingrediëntenoverzicht</h3>
          <button type="button" className="open-modal-btn" onClick={openCreateModal}>
            Handmatig ingrediënt toevoegen
          </button>
        </div>

        <input
          className="search-input"
          type="text"
          placeholder="Zoek op naam"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        {saveMessage ? <p className="form-info inline-message">{saveMessage}</p> : null}

        {visibleIngredients.length === 0 ? (
          <p>Geen ingrediënten gevonden</p>
        ) : (
          <div className="table-scroll">
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th>Artikelnummer</th>
                  <th>Naam</th>
                  <th>Merk</th>
                  <th>Netto prijs</th>
                  <th>Verpakking</th>
                  <th>Inhoud verpakking</th>
                  <th>Hoofdproductgroep</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {visibleIngredients.map((ingredient) => (
                  <tr key={ingredient.id}>
                    <td>{ingredient.supplier_product_code || '-'}</td>
                    <td>{ingredient.supplier_product_name || '-'}</td>
                    <td>{ingredient.supplier_brand || '-'}</td>
                    <td>{formatPrice(ingredient.supplier_price_ex_vat)}</td>
                    <td>{ingredient.supplier_unit || '-'}</td>
                    <td>{ingredient.supplier_net_content ?? '-'}</td>
                    <td>{ingredient.category || '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn"
                        onClick={() => openEditModal(ingredient)}
                      >
                        Bewerken
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
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>
                {editingIngredientId
                  ? 'Ingrediënt bewerken'
                  : 'Handmatig ingrediënt toevoegen'}
              </h3>
            </div>

            <div className="modal-body">
              <section className="modal-section">
                <h4>Product</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Naam
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(event) => handleFieldChange('name', event.target.value)}
                    />
                  </label>
                  <label>
                    Artikelnummer
                    <input
                      type="text"
                      value={formData.articleNumber}
                      onChange={(event) => handleFieldChange('articleNumber', event.target.value)}
                    />
                  </label>
                  <label>
                    Leverancier
                    <input
                      type="text"
                      value={formData.supplier}
                      onChange={(event) => handleFieldChange('supplier', event.target.value)}
                    />
                  </label>
                  <label>
                    Merk
                    <input
                      type="text"
                      value={formData.brand}
                      onChange={(event) => handleFieldChange('brand', event.target.value)}
                    />
                  </label>
                  <label className="full-width">
                    Productgroep
                    <input
                      type="text"
                      value={formData.productGroup}
                      onChange={(event) => handleFieldChange('productGroup', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Inkoop en verpakking</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Prijs per verpakking
                    <input
                      type="number"
                      step="any"
                      value={formData.pricePerPackage}
                      onChange={(event) => handleFieldChange('pricePerPackage', event.target.value)}
                    />
                  </label>
                  <label>
                    BTW
                    <input
                      type="number"
                      step="any"
                      value={formData.vat}
                      onChange={(event) => handleFieldChange('vat', event.target.value)}
                    />
                  </label>
                  <label>
                    Verpakking
                    <input
                      type="text"
                      value={formData.packageUnit}
                      onChange={(event) => handleFieldChange('packageUnit', event.target.value)}
                    />
                  </label>
                  <label>
                    Inhoud verpakking
                    <input
                      type="number"
                      step="any"
                      value={formData.packageContent}
                      onChange={(event) => handleFieldChange('packageContent', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Calculatie</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Rekeneenheid
                    <input
                      type="text"
                      value={formData.baseUnit}
                      onChange={(event) => handleFieldChange('baseUnit', event.target.value)}
                    />
                  </label>
                  <label>
                    Aantal per verpakking
                    <input
                      type="number"
                      step="any"
                      value={formData.amountPerPackage}
                      onChange={(event) => handleFieldChange('amountPerPackage', event.target.value)}
                    />
                  </label>
                  <label>
                    Schoon rendement %
                    <input
                      type="number"
                      step="any"
                      value={formData.yieldPercent}
                      onChange={(event) => handleFieldChange('yieldPercent', event.target.value)}
                    />
                  </label>
                  <label>
                    Snijverlies %
                    <input
                      type="number"
                      step="any"
                      value={formData.wastePercent}
                      onChange={(event) => handleFieldChange('wastePercent', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Intern</h4>
                <div className="modal-grid one-col calm-grid">
                  <label>
                    Eigen categorie
                    <input
                      type="text"
                      value={formData.internalCategory}
                      onChange={(event) => handleFieldChange('internalCategory', event.target.value)}
                    />
                  </label>
                  <label>
                    Notities
                    <textarea
                      value={formData.notes}
                      onChange={(event) => handleFieldChange('notes', event.target.value)}
                    />
                  </label>
                  <label>
                    Allergenen / kruisbesmetting
                    <textarea
                      value={formData.allergensCross}
                      onChange={(event) => handleFieldChange('allergensCross', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              {validationMessage ? <p className="form-error">{validationMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={closeModal}>
                Annuleren
              </button>
              <button type="button" className="primary-btn" onClick={handleSave} disabled={isSaving}>
                {isSaving
                  ? 'Bezig met opslaan...'
                  : editingIngredientId
                    ? 'Wijzigingen opslaan'
                    : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
