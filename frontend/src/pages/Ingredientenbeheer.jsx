import React, { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

const requiredLabels = {
  name: 'Naam',
  productCode: 'Artikelnummer / intern nummer',
  supplierName: 'Leverancier',
  supplierPriceExVat: 'Netto prijs',
  supplierVatRate: 'BTW',
  supplierUnit: 'Verkoopeenheid',
  supplierNetContent: 'Netto inhoud / gewicht',
  baseUnit: 'Base unit',
  conversionFactorToBase: 'Conversiefactor naar base unit'
}

const initialForm = {
  name: '',
  productCode: '',
  supplierName: '',
  brand: '',
  hoofdproductgroep: '',
  supplierPriceExVat: '',
  supplierVatRate: '',
  supplierUnit: '',
  supplierNetContent: '',
  baseUnit: '',
  conversionFactorToBase: '',
  yieldPercent: '',
  wastePercent: '',
  internalCategory: '',
  internalNotes: '',
  extraAllergensCrossContamination: ''
}

export default function Ingredientenbeheer() {
  const [ingredients, setIngredients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState(initialForm)
  const [formMessage, setFormMessage] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
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

  function openModal() {
    setFormData(initialForm)
    setValidationMessage('')
    setFormMessage('')
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
    const requiredKeys = [
      'name',
      'productCode',
      'supplierName',
      'supplierPriceExVat',
      'supplierVatRate',
      'supplierUnit',
      'supplierNetContent',
      'baseUnit',
      'conversionFactorToBase'
    ]

    const missing = requiredKeys.filter((key) => !String(formData[key]).trim())
    if (missing.length > 0) {
      const labels = missing.map((key) => requiredLabels[key]).join(', ')
      setValidationMessage(`Vul verplichte velden in: ${labels}`)
      return false
    }

    setValidationMessage('')
    return true
  }

  async function handleSaveIngredient() {
    if (!validateForm()) {
      return
    }

    setIsSaving(true)
    setFormMessage('')

    try {
      await apiClient.createIngredient({
        supplier_name: formData.supplierName.trim(),
        supplier_product_code: formData.productCode.trim(),
        supplier_product_name: formData.name.trim(),
        supplier_brand: formData.brand.trim() || null,
        supplier_unit: formData.supplierUnit.trim(),
        supplier_net_content: Number(formData.supplierNetContent),
        supplier_price_ex_vat: Number(formData.supplierPriceExVat),
        supplier_vat_rate: Number(formData.supplierVatRate),
        base_unit: formData.baseUnit.trim(),
        conversion_factor_to_base: Number(formData.conversionFactorToBase),
        yield_percent: formData.yieldPercent ? Number(formData.yieldPercent) : null,
        waste_percent: formData.wastePercent ? Number(formData.wastePercent) : null,
        category: formData.internalCategory.trim() || formData.hoofdproductgroep.trim() || null,
        internal_notes: formData.internalNotes.trim() || null,
        internal_allergens_extra: formData.extraAllergensCrossContamination.trim() || null,
        cross_contamination_notes: formData.extraAllergensCrossContamination.trim() || null
      })
      setFormMessage('Ingrediënt opgeslagen')
      await loadIngredients()
      setFormData(initialForm)
    } catch {
      setFormMessage('Backend voor handmatige ingrediënten volgt nog')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredIngredients = ingredients.filter((ingredient) =>
    (ingredient.supplier_product_name || '')
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )

  return (
    <div>
      <header className="page-header">
        <h2>Ingrediëntenbeheer</h2>
        <p>Beheer inkoopproducten en voeg handmatig ingrediënten toe.</p>
      </header>

      <section className="card">
        <div className="ingredient-header-row">
          <h3>Ingrediëntenoverzicht</h3>
          <button type="button" className="open-modal-btn" onClick={openModal}>
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
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Handmatig ingrediënt toevoegen</h3>
            </div>

            <div className="modal-body">
              <section className="modal-section">
                <h4>Product</h4>
                <div className="modal-grid two-col">
                  <label>
                    Naam (verplicht)
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(event) => handleFieldChange('name', event.target.value)}
                    />
                  </label>
                  <label>
                    Artikelnummer / intern nummer (verplicht)
                    <input
                      type="text"
                      value={formData.productCode}
                      onChange={(event) => handleFieldChange('productCode', event.target.value)}
                    />
                  </label>
                  <label>
                    Leverancier (verplicht)
                    <input
                      type="text"
                      value={formData.supplierName}
                      onChange={(event) => handleFieldChange('supplierName', event.target.value)}
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
                    Hoofdproductgroep
                    <input
                      type="text"
                      value={formData.hoofdproductgroep}
                      onChange={(event) => handleFieldChange('hoofdproductgroep', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Inkoop en verpakking</h4>
                <div className="modal-grid two-col">
                  <label>
                    Netto prijs (verplicht)
                    <input
                      type="number"
                      step="any"
                      value={formData.supplierPriceExVat}
                      onChange={(event) => handleFieldChange('supplierPriceExVat', event.target.value)}
                    />
                  </label>
                  <label>
                    BTW (verplicht)
                    <input
                      type="number"
                      step="any"
                      value={formData.supplierVatRate}
                      onChange={(event) => handleFieldChange('supplierVatRate', event.target.value)}
                    />
                  </label>
                  <label>
                    Verkoopeenheid (verplicht)
                    <input
                      type="text"
                      value={formData.supplierUnit}
                      onChange={(event) => handleFieldChange('supplierUnit', event.target.value)}
                    />
                  </label>
                  <label>
                    Netto inhoud / gewicht (verplicht)
                    <input
                      type="number"
                      step="any"
                      value={formData.supplierNetContent}
                      onChange={(event) => handleFieldChange('supplierNetContent', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Calculatie</h4>
                <div className="modal-grid two-col">
                  <label>
                    Base unit (verplicht)
                    <input
                      type="text"
                      value={formData.baseUnit}
                      onChange={(event) => handleFieldChange('baseUnit', event.target.value)}
                    />
                  </label>
                  <label>
                    Conversiefactor naar base unit (verplicht)
                    <input
                      type="number"
                      step="any"
                      value={formData.conversionFactorToBase}
                      onChange={(event) => handleFieldChange('conversionFactorToBase', event.target.value)}
                    />
                  </label>
                  <label>
                    Yield %
                    <input
                      type="number"
                      step="any"
                      value={formData.yieldPercent}
                      onChange={(event) => handleFieldChange('yieldPercent', event.target.value)}
                    />
                  </label>
                  <label>
                    Waste %
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
                <div className="modal-grid one-col">
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
                      value={formData.internalNotes}
                      onChange={(event) => handleFieldChange('internalNotes', event.target.value)}
                    />
                  </label>
                  <label>
                    Extra allergenen / kruisbesmetting
                    <textarea
                      value={formData.extraAllergensCrossContamination}
                      onChange={(event) =>
                        handleFieldChange('extraAllergensCrossContamination', event.target.value)
                      }
                    />
                  </label>
                </div>
              </section>

              {validationMessage ? <p className="form-error">{validationMessage}</p> : null}
              {formMessage ? <p className="form-info">{formMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={closeModal}>
                Annuleren
              </button>
              <button type="button" className="primary-btn" onClick={handleSaveIngredient} disabled={isSaving}>
                {isSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
