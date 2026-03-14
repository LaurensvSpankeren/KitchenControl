import React, { useEffect, useMemo, useRef, useState } from 'react'

import { apiClient } from '../api/client'

const requiredLabels = {
  name: 'Naam',
  articleNumber: 'Artikelnummer',
  supplier: 'Leverancier',
  pricePerPackage: 'Prijs per verpakking',
  vat: 'BTW',
  packagingType: 'Verpakkingstype',
  netContentAmount: 'Netto inhoud verpakking',
  netContentUnit: 'Inhoudseenheid'
}

const netContentUnitOptions = ['gram', 'kg', 'ml', 'liter', 'stuk']
const dualUnitOptions = ['stuk', 'gram', 'kg', 'ml', 'liter']

const initialForm = {
  name: '',
  articleNumber: '',
  supplier: '',
  brand: '',
  productGroup: '',
  pricePerPackage: '',
  vat: '',
  packagingType: '',
  unitsPerPackage: '',
  netContentAmount: '',
  netContentUnit: 'gram',
  packageWeightAmount: '',
  packageWeightUnit: '',
  packageVolumeAmount: '',
  packageVolumeUnit: '',
  calculationUnit: '',
  calculationQuantityPerPackage: '',
  preferredUnit: '',
  secondaryUnit: '',
  secondaryUnitFactor: '',
  yieldPercent: '',
  wastePercent: '',
  internalCategory: '',
  notes: ''
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

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  const number = Number(value)
  if (Number.isNaN(number)) {
    return '-'
  }
  return number.toFixed(digits).replace('.', ',')
}

function normalizeDisplayUnit(value) {
  return normalizeUnit(value)
}

function formatPackageWeight(amount, unit) {
  const numericAmount = Number(amount)
  const normalizedUnit = normalizeDisplayUnit(unit)
  if (Number.isNaN(numericAmount) || !normalizedUnit) {
    return '-'
  }
  if (normalizedUnit === 'kg') {
    return `${formatNumber(numericAmount * 1000, 0).replace(/,?0+$/, '')} gram`
  }
  if (normalizedUnit === 'gram') {
    return `${formatNumber(numericAmount, 0).replace(/,?0+$/, '')} gram`
  }
  return `${formatNumber(numericAmount, 4).replace(/,?0+$/, '')} ${normalizedUnit}`
}

function formatPackageVolume(amount, unit) {
  const numericAmount = Number(amount)
  const normalizedUnit = normalizeDisplayUnit(unit)
  if (Number.isNaN(numericAmount) || !normalizedUnit) {
    return '-'
  }
  if (normalizedUnit === 'liter') {
    return `${formatNumber(numericAmount * 1000, 0).replace(/,?0+$/, '')} ml`
  }
  if (normalizedUnit === 'ml') {
    return `${formatNumber(numericAmount, 0).replace(/,?0+$/, '')} ml`
  }
  return `${formatNumber(numericAmount, 4).replace(/,?0+$/, '')} ${normalizedUnit}`
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

function normalizeUnit(value) {
  const unit = String(value || '').trim().toLowerCase()
  if (!unit) {
    return ''
  }

  const mapping = {
    g: 'gram',
    gr: 'gram',
    gram: 'gram',
    kg: 'kg',
    ml: 'ml',
    l: 'liter',
    lt: 'liter',
    liter: 'liter',
    st: 'stuk',
    stuks: 'stuk',
    stuk: 'stuk'
  }
  return mapping[unit] || unit
}

function deriveCalculation(netContentAmount, netContentUnit, unitsPerPackage) {
  const amount = Number(netContentAmount)
  const units = Number(unitsPerPackage)
  const unit = normalizeUnit(netContentUnit)

  if (unit === 'kg' && !Number.isNaN(amount)) {
    return { calculationUnit: 'gram', calculationQuantityPerPackage: amount * 1000 }
  }
  if (unit === 'gram' && !Number.isNaN(amount)) {
    return { calculationUnit: 'gram', calculationQuantityPerPackage: amount }
  }
  if (unit === 'liter' && !Number.isNaN(amount)) {
    return { calculationUnit: 'ml', calculationQuantityPerPackage: amount * 1000 }
  }
  if (unit === 'ml' && !Number.isNaN(amount)) {
    return { calculationUnit: 'ml', calculationQuantityPerPackage: amount }
  }
  if (unit === 'stuk') {
    return {
      calculationUnit: 'stuk',
      calculationQuantityPerPackage: Number.isNaN(units) || units <= 0 ? 1 : units
    }
  }
  return { calculationUnit: '', calculationQuantityPerPackage: '' }
}

function formatPackagingText(ingredient) {
  const packagingType = ingredient.packaging_type || ingredient.supplier_unit || ''
  const units = ingredient.units_per_package

  if (units !== null && units !== undefined && units !== '') {
    const unitsNumber = Number(units)
    if (!Number.isNaN(unitsNumber)) {
      const formattedUnits = Number.isInteger(unitsNumber)
        ? String(unitsNumber)
        : formatNumber(unitsNumber, 2)
      if (packagingType) {
        return `${formattedUnits} ${packagingType}`
      }
      return `${formattedUnits} stuks`
    }
  }

  return packagingType || '-'
}

function formatNetContentText(ingredient) {
  const amount = ingredient.net_content_amount ?? ingredient.supplier_net_content
  const unit = ingredient.net_content_unit
  if (amount === null || amount === undefined || amount === '') {
    return '-'
  }
  if (unit) {
    return `${formatNumber(amount, 4).replace(/,?0+$/, '')} ${unit}`
  }
  return formatNumber(amount, 4).replace(/,?0+$/, '')
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
    packagingType: ingredient.packaging_type || ingredient.supplier_unit || '',
    unitsPerPackage: ingredient.units_per_package ?? '',
    netContentAmount: ingredient.net_content_amount ?? ingredient.supplier_net_content ?? '',
    netContentUnit: ingredient.net_content_unit || 'gram',
    packageWeightAmount: ingredient.package_weight_amount ?? '',
    packageWeightUnit: ingredient.package_weight_unit || '',
    packageVolumeAmount: ingredient.package_volume_amount ?? '',
    packageVolumeUnit: ingredient.package_volume_unit || '',
    calculationUnit: ingredient.calculation_unit || ingredient.base_unit || '',
    calculationQuantityPerPackage:
      ingredient.calculation_quantity_per_package ?? ingredient.conversion_factor_to_base ?? '',
    preferredUnit: ingredient.preferred_unit || '',
    secondaryUnit: ingredient.secondary_unit || '',
    secondaryUnitFactor: ingredient.secondary_unit_factor ?? '',
    yieldPercent: ingredient.yield_percent ?? '',
    wastePercent: ingredient.waste_percent ?? '',
    internalCategory: parsedNotes.internalCategory,
    notes: parsedNotes.notes
  }
}

function mapFormToPayload(formData, derivedCalculation) {
  const internalCategory = formData.internalCategory.trim()
  const noteText = formData.notes.trim()
  const notesWithCategory = internalCategory
    ? noteText
      ? `Eigen categorie: ${internalCategory}\n${noteText}`
      : `Eigen categorie: ${internalCategory}`
    : noteText || null

  const calculationUnit = derivedCalculation.calculationUnit || null
  const calculationQuantity =
    derivedCalculation.calculationQuantityPerPackage === ''
      ? null
      : Number(derivedCalculation.calculationQuantityPerPackage)

  return {
    supplier_name: formData.supplier.trim(),
    supplier_product_code: formData.articleNumber.trim(),
    supplier_product_name: formData.name.trim(),
    supplier_brand: formData.brand.trim() || null,
    supplier_unit: formData.packagingType.trim(),
    packaging_type: formData.packagingType.trim(),
    units_per_package: formData.unitsPerPackage ? Number(formData.unitsPerPackage) : null,
    net_content_amount: Number(formData.netContentAmount),
    net_content_unit: normalizeUnit(formData.netContentUnit),
    supplier_net_content: Number(formData.netContentAmount),
    supplier_price_ex_vat: Number(formData.pricePerPackage),
    supplier_vat_rate: Number(formData.vat),
    base_unit: calculationUnit || normalizeUnit(formData.netContentUnit) || 'stuk',
    calculation_unit: calculationUnit,
    calculation_quantity_per_package: calculationQuantity,
    preferred_unit: formData.preferredUnit || null,
    secondary_unit: formData.secondaryUnit || null,
    secondary_unit_factor: formData.secondaryUnitFactor ? Number(formData.secondaryUnitFactor) : null,
    conversion_factor_to_base: calculationQuantity,
    yield_percent: formData.yieldPercent ? Number(formData.yieldPercent) : null,
    waste_percent: formData.wastePercent ? Number(formData.wastePercent) : null,
    category: formData.productGroup.trim() || internalCategory || null,
    internal_notes: notesWithCategory
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
  const modalBodyRef = useRef(null)

  const derivedCalculation = useMemo(
    () =>
      deriveCalculation(
        formData.netContentAmount,
        formData.netContentUnit,
        formData.unitsPerPackage
      ),
    [formData.netContentAmount, formData.netContentUnit, formData.unitsPerPackage]
  )

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
      'packagingType',
      'netContentAmount',
      'netContentUnit'
    ]

    const missing = requiredFields.filter((field) => !String(formData[field]).trim())
    if (missing.length > 0) {
      setValidationMessage(
        `Opslaan lukt nog niet. Vul eerst deze velden in: ${missing
          .map((field) => requiredLabels[field])
          .join(', ')}`
      )
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
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
      const payload = mapFormToPayload(formData, derivedCalculation)
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

  const packageWeightLabel = formatPackageWeight(formData.packageWeightAmount, formData.packageWeightUnit)
  const packageVolumeLabel = formatPackageVolume(formData.packageVolumeAmount, formData.packageVolumeUnit)

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
                  <th>Inhoud verpakking</th>
                  <th>Nettogewicht</th>
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
                    <td>{formatPackagingText(ingredient)}</td>
                    <td>{formatNetContentText(ingredient)}</td>
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
              <h3>{editingIngredientId ? 'Ingrediënt bewerken' : 'Handmatig ingrediënt toevoegen'}</h3>
            </div>

            <div className="modal-body" ref={modalBodyRef}>
              {validationMessage ? (
                <div className="modal-validation-banner" role="alert">
                  {validationMessage}
                </div>
              ) : null}

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
                <h4>Inkoop</h4>
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
                </div>
              </section>

              <section className="modal-section">
                <h4>Verpakking</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Verpakkingstype
                    <input
                      type="text"
                      value={formData.packagingType}
                      onChange={(event) => handleFieldChange('packagingType', event.target.value)}
                    />
                  </label>
                  <label>
                    Aantal stuks per verpakking
                    <input
                      type="number"
                      step="any"
                      value={formData.unitsPerPackage}
                      onChange={(event) => handleFieldChange('unitsPerPackage', event.target.value)}
                    />
                  </label>
                  <label>
                    Netto inhoud verpakking
                    <input
                      type="number"
                      step="any"
                      value={formData.netContentAmount}
                      onChange={(event) => handleFieldChange('netContentAmount', event.target.value)}
                    />
                  </label>
                  <label>
                    Inhoudseenheid
                    <select
                      value={formData.netContentUnit}
                      onChange={(event) => handleFieldChange('netContentUnit', event.target.value)}
                    >
                      {netContentUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Brondata verpakking</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Gewicht per verpakking
                    <input type="text" value={packageWeightLabel} readOnly />
                  </label>
                  <label>
                    Inhoud per verpakking
                    <input type="text" value={packageVolumeLabel} readOnly />
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
                      value={derivedCalculation.calculationUnit || formData.calculationUnit || '-'}
                      readOnly
                    />
                  </label>
                  <label>
                    Aantal rekeneenheden per verpakking
                    <input
                      type="text"
                      value={
                        derivedCalculation.calculationQuantityPerPackage !== ''
                          ? formatNumber(derivedCalculation.calculationQuantityPerPackage, 4)
                          : formData.calculationQuantityPerPackage !== ''
                            ? formatNumber(formData.calculationQuantityPerPackage, 4)
                            : '-'
                      }
                      readOnly
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
                <h4>Dubbele rekeneenheid</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Voorkeursrekeneenheid
                    <select
                      value={formData.preferredUnit}
                      onChange={(event) => handleFieldChange('preferredUnit', event.target.value)}
                    >
                      <option value="">Kies een eenheid</option>
                      {dualUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Alternatieve rekeneenheid
                    <select
                      value={formData.secondaryUnit}
                      onChange={(event) => handleFieldChange('secondaryUnit', event.target.value)}
                    >
                      <option value="">Kies een eenheid</option>
                      {dualUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full-width">
                    Omrekening: 1 voorkeursrekeneenheid = X alternatieve rekeneenheid
                    <input
                      type="number"
                      step="any"
                      value={formData.secondaryUnitFactor}
                      onChange={(event) => handleFieldChange('secondaryUnitFactor', event.target.value)}
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
                </div>
              </section>
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
