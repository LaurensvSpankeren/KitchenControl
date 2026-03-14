import React, { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'

const initialForm = {
  photo_url: '',
  name: '',
  category: '',
  subcategory: '',
  final_yield_amount: '',
  final_yield_unit: '',
  storage_fridge_days: '',
  storage_freezer_days: '',
  storage_notes: ''
}

const EMPTY_STEPS = Array.from({ length: 10 }, () => '')
const endProductUnitOptions = ['gram', 'kg', 'ml', 'liter', 'stuk']

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
    stuk: 'stuk',
    pc: 'stuk',
    pcs: 'stuk'
  }
  return mapping[unit] || unit
}

function getIngredientUnitOptions(ingredient) {
  if (!ingredient) {
    return []
  }

  const options = []
  const preferred = normalizeUnit(ingredient.preferred_unit)
  const secondary = normalizeUnit(ingredient.secondary_unit)
  const calculation = normalizeUnit(ingredient.calculation_unit || ingredient.base_unit)
  const hasWeight =
    ingredient.package_weight_amount !== null &&
    ingredient.package_weight_amount !== undefined &&
    ingredient.package_weight_unit
  const hasVolume =
    ingredient.package_volume_amount !== null &&
    ingredient.package_volume_amount !== undefined &&
    ingredient.package_volume_unit

  const addOption = (unit) => {
    const normalized = normalizeUnit(unit)
    if (normalized && !options.includes(normalized)) {
      options.push(normalized)
    }
  }

  if (preferred === 'stuk' || secondary === 'stuk' || calculation === 'stuk') {
    addOption('stuk')
  }
  if (hasWeight) {
    addOption('gram')
  }
  if (hasVolume) {
    addOption('ml')
  }

  addOption(preferred)
  addOption(secondary)
  addOption(calculation)

  return options
}

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

function formatDateForInput(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateNl(isoDate) {
  if (!isoDate) {
    return '-'
  }
  const [year, month, day] = String(isoDate).split('-')
  if (!year || !month || !day) {
    return isoDate
  }
  return `${day}-${month}-${year}`
}

function addDaysToIsoDate(isoDate, days) {
  const parsedDays = Number(days)
  if (!isoDate || Number.isNaN(parsedDays) || parsedDays < 0) {
    return null
  }
  const date = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  date.setDate(date.getDate() + parsedDays)
  return formatDateForInput(date)
}

function formatCompactNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  const num = Number(value)
  if (Number.isNaN(num)) {
    return '-'
  }
  return num.toFixed(digits).replace('.', ',')
}

function formatPackageWeightLabel(ingredient) {
  if (!ingredient) {
    return null
  }
  const amount = Number(ingredient.package_weight_amount)
  const unit = normalizeUnit(ingredient.package_weight_unit)
  if (Number.isNaN(amount) || !unit) {
    return null
  }
  if (unit === 'kg') {
    return `${(amount * 1000).toFixed(0)} gram`
  }
  if (unit === 'gram') {
    return `${amount.toFixed(0)} gram`
  }
  return `${formatCompactNumber(amount, 4).replace(/,?0+$/, '')} ${unit}`
}

function formatPackageVolumeLabel(ingredient) {
  if (!ingredient) {
    return null
  }
  const amount = Number(ingredient.package_volume_amount)
  const unit = normalizeUnit(ingredient.package_volume_unit)
  if (Number.isNaN(amount) || !unit) {
    return null
  }
  if (unit === 'liter') {
    return `${(amount * 1000).toFixed(0)} ml`
  }
  if (unit === 'ml') {
    return `${amount.toFixed(0)} ml`
  }
  return `${formatCompactNumber(amount, 4).replace(/,?0+$/, '')} ${unit}`
}

function mapProductToForm(product) {
  return {
    photo_url: product.photo_url || '',
    name: product.name || '',
    category: product.category || '',
    subcategory: product.subcategory || '',
    final_yield_amount: product.final_yield_amount ?? '',
    final_yield_unit: product.final_yield_unit || '',
    storage_fridge_days: product.storage_fridge_days ?? '',
    storage_freezer_days: product.storage_freezer_days ?? '',
    storage_notes: product.storage_notes || product.storage_advice || ''
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
    storage_fridge_days:
      form.storage_fridge_days === '' ? null : Number(form.storage_fridge_days),
    storage_freezer_days:
      form.storage_freezer_days === '' ? null : Number(form.storage_freezer_days),
    storage_notes: form.storage_notes.trim() || null,
    storage_advice: form.storage_notes.trim() || null
  }
}

export default function Halffabricaten() {
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [semiFinishedCategories, setSemiFinishedCategories] = useState([])
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
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewSubcategoryInput, setShowNewSubcategoryInput] = useState(false)
  const [newSubcategoryName, setNewSubcategoryName] = useState('')

  const [pageMessage, setPageMessage] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false)
  const [labelProductionDate, setLabelProductionDate] = useState(formatDateForInput(new Date()))
  const [labelUseFridge, setLabelUseFridge] = useState(true)
  const [labelUseFreezer, setLabelUseFreezer] = useState(false)
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

  async function loadSemiFinishedCategories() {
    try {
      const data = await apiClient.getSemiFinishedCategories()
      setSemiFinishedCategories(Array.isArray(data) ? data : [])
    } catch {
      setSemiFinishedCategories([])
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
    loadSemiFinishedCategories()
  }, [])

  const categoryOptions = useMemo(
    () =>
      semiFinishedCategories
        .map((category) => category.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'nl')),
    [semiFinishedCategories]
  )

  const filterSubcategoryOptions = useMemo(() => {
    if (!categoryFilter) {
      return []
    }
    const categoryRecord =
      semiFinishedCategories.find((category) => category.name === categoryFilter) || null
    return (categoryRecord?.subcategories || [])
      .map((subcategory) => subcategory.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl'))
  }, [semiFinishedCategories, categoryFilter])

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
  const selectedIngredientUnitOptions = useMemo(
    () => getIngredientUnitOptions(selectedIngredient),
    [selectedIngredient]
  )

  const selectedCategoryRecord = useMemo(
    () =>
      semiFinishedCategories.find((category) => category.name === formData.category) || null,
    [semiFinishedCategories, formData.category]
  )

  const modalCategoryOptions = useMemo(() => {
    const base = semiFinishedCategories.map((category) => category.name)
    if (formData.category && !base.includes(formData.category)) {
      return [...base, formData.category]
    }
    return base
  }, [semiFinishedCategories, formData.category])

  const modalSubcategoryOptions = useMemo(() => {
    if (!selectedCategoryRecord) {
      return formData.subcategory ? [formData.subcategory] : []
    }
    const base = (selectedCategoryRecord.subcategories || []).map((subcategory) => subcategory.name)
    if (formData.subcategory && !base.includes(formData.subcategory)) {
      return [...base, formData.subcategory]
    }
    return base
  }, [selectedCategoryRecord, formData.subcategory])

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
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setShowNewSubcategoryInput(false)
    setNewSubcategoryName('')
    setModalMessage('')
    setErrorMessage('')
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
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setShowNewSubcategoryInput(false)
    setNewSubcategoryName('')
    setModalMessage('')
    setErrorMessage('')
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

  function handleCategoryChange(value) {
    setFormData((prev) => ({
      ...prev,
      category: value,
      subcategory: ''
    }))
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
      const selectedUnit =
        recipeUnit || selectedIngredient.calculation_unit || selectedIngredient.base_unit || 'gram'
      await apiClient.addSemiFinishedProductRecipeLine(selectedProductId, {
        item_type: 'ingredient',
        item_id: selectedIngredient.id,
        quantity,
        unit: selectedUnit
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

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (!name) {
      setErrorMessage('Vul eerst een categorienaam in.')
      return
    }

    setErrorMessage('')
    try {
      const created = await apiClient.createSemiFinishedCategory({ name })
      await loadSemiFinishedCategories()
      handleCategoryChange(created.name)
      setShowNewCategoryInput(false)
      setNewCategoryName('')
      setModalMessage('Categorie toegevoegd.')
    } catch {
      setErrorMessage('Categorie aanmaken mislukt.')
    }
  }

  async function handleCreateSubcategory() {
    if (!selectedCategoryRecord) {
      setErrorMessage('Kies eerst een categorie.')
      return
    }

    const name = newSubcategoryName.trim()
    if (!name) {
      setErrorMessage('Vul eerst een subcategorienaam in.')
      return
    }

    setErrorMessage('')
    try {
      const created = await apiClient.createSemiFinishedSubcategory(selectedCategoryRecord.id, {
        name
      })
      await loadSemiFinishedCategories()
      setFormData((prev) => ({ ...prev, subcategory: created.name }))
      setShowNewSubcategoryInput(false)
      setNewSubcategoryName('')
      setModalMessage('Subcategorie toegevoegd.')
    } catch {
      setErrorMessage('Subcategorie aanmaken mislukt.')
    }
  }

  function openLabelModal() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op.')
      return
    }
    setLabelProductionDate(formatDateForInput(new Date()))
    setLabelUseFridge(true)
    setLabelUseFreezer(false)
    setIsLabelModalOpen(true)
  }

  function handlePrintLabel() {
    const productName = formData.name || detail?.name || ''
    const fridgeDate = labelUseFridge
      ? addDaysToIsoDate(labelProductionDate, detail?.storage_fridge_days ?? formData.storage_fridge_days)
      : null
    const freezerDate = labelUseFreezer
      ? addDaysToIsoDate(
          labelProductionDate,
          detail?.storage_freezer_days ?? formData.storage_freezer_days
        )
      : null

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=620')
    if (!printWindow) {
      setErrorMessage('Printvenster kon niet worden geopend.')
      return
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Dagetiket - ${productName}</title>
          <style>
            @page { size: 89mm 36mm; margin: 4mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .label { border: 1px solid #000; padding: 8px; width: 100%; }
            .title { font-size: 14px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; }
            .line { font-size: 12px; margin: 2px 0; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="title">${productName || '-'}</div>
            <div class="line"><strong>Productiedatum:</strong> ${formatDateNl(labelProductionDate)}</div>
            ${
              labelUseFridge
                ? `<div class="line"><strong>Koelkast houdbaar tot:</strong> ${formatDateNl(fridgeDate)}</div>`
                : ''
            }
            ${
              labelUseFreezer
                ? `<div class="line"><strong>Vriezer houdbaar tot:</strong> ${formatDateNl(freezerDate)}</div>`
                : ''
            }
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    setIsLabelModalOpen(false)
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
            `<tr><td>${line.item_name || '-'}</td><td>${line.quantity || '-'}</td><td>${line.unit || '-'}</td></tr>`
        )
        .join('')

      const stepsHtml = (payload.recipe_steps || [])
        .map((step) => `<li>${step.step_number}. ${step.instruction}</li>`)
        .join('')

      printWindow.document.write(`
        <html>
          <head>
            <title>Keukenrecept - ${payload.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
              h1 { margin: 0 0 10px; }
              h2 { margin: 18px 0 8px; font-size: 18px; }
              p { margin: 4px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { border: 1px solid #cfcfcf; padding: 8px; text-align: left; }
              th { background: #f5f5f5; }
              .meta { margin-bottom: 12px; }
            </style>
          </head>
          <body>
            <h1>${payload.name || ''}</h1>
            <div class="meta">
              <p><strong>Categorie:</strong> ${payload.category || '-'}</p>
              <p><strong>Subcategorie:</strong> ${payload.subcategory || '-'}</p>
              <p><strong>Batch opbrengst:</strong> ${formatYield(payload.final_yield_amount, payload.final_yield_unit)}</p>
            </div>
            <h2>Ingrediënten</h2>
            <table>
              <thead><tr><th>Naam</th><th>Hoeveelheid</th><th>Eenheid</th></tr></thead>
              <tbody>${lines}</tbody>
            </table>
            <h2>Receptstappen</h2>
            <ol>${stepsHtml || '<li>-</li>'}</ol>
            <h2>Bewaaradvies</h2>
            <p><strong>Koelkast:</strong> ${
              payload.storage_fridge_days !== null && payload.storage_fridge_days !== undefined
                ? `${payload.storage_fridge_days} dagen`
                : '-'
            }</p>
            <p><strong>Vriezer:</strong> ${
              payload.storage_freezer_days !== null && payload.storage_freezer_days !== undefined
                ? `${payload.storage_freezer_days} dagen`
                : '-'
            }</p>
            <p><strong>Extra bewaaradvies:</strong> ${payload.storage_notes || payload.storage_advice || '-'}</p>
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

  const allergensText = detail?.allergens_total || 'Geen brondata allergenen beschikbaar'

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
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value)
              setSubcategoryFilter('')
            }}
          >
            <option value="">Alle categorieën</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={subcategoryFilter}
            onChange={(event) => setSubcategoryFilter(event.target.value)}
            disabled={!categoryFilter}
          >
            <option value="">Alle subcategorieën</option>
            {filterSubcategoryOptions.map((option) => (
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
                    <td>{item.allergens_total || 'Geen brondata allergenen beschikbaar'}</td>
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
                    <select
                      value={formData.category}
                      onChange={(event) => handleCategoryChange(event.target.value)}
                    >
                      <option value="">Kies een categorie</option>
                      {modalCategoryOptions.map((categoryName) => (
                        <option key={categoryName} value={categoryName}>
                          {categoryName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="table-action-btn"
                      onClick={() => setShowNewCategoryInput((prev) => !prev)}
                    >
                      Nieuwe categorie
                    </button>
                    {showNewCategoryInput ? (
                      <div className="recipe-line-inline">
                        <input
                          type="text"
                          placeholder="Nieuwe categorie"
                          value={newCategoryName}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                        />
                        <button type="button" onClick={handleCreateCategory}>
                          Opslaan
                        </button>
                      </div>
                    ) : null}
                  </label>
                  <label>
                    Subcategorie
                    <select
                      value={formData.subcategory}
                      onChange={(event) => handleFormChange('subcategory', event.target.value)}
                      disabled={!formData.category}
                    >
                      <option value="">Kies een subcategorie</option>
                      {modalSubcategoryOptions.map((subcategoryName) => (
                        <option key={subcategoryName} value={subcategoryName}>
                          {subcategoryName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="table-action-btn"
                      onClick={() => setShowNewSubcategoryInput((prev) => !prev)}
                      disabled={!formData.category}
                    >
                      Nieuwe subcategorie
                    </button>
                    {showNewSubcategoryInput ? (
                      <div className="recipe-line-inline">
                        <input
                          type="text"
                          placeholder="Nieuwe subcategorie"
                          value={newSubcategoryName}
                          onChange={(event) => setNewSubcategoryName(event.target.value)}
                        />
                        <button type="button" onClick={handleCreateSubcategory}>
                          Opslaan
                        </button>
                      </div>
                    ) : null}
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
                            onClick={() => {
                              setSelectedIngredient(ingredient)
                              const options = getIngredientUnitOptions(ingredient)
                              setRecipeUnit(options[0] || 'gram')
                            }}
                          >
                            <strong>
                              {ingredient.supplier_product_name}{' '}
                              {ingredient.supplier_brand ? `(${ingredient.supplier_brand})` : ''}
                            </strong>
                            <span className="ingredient-picker-meta">
                              #{ingredient.supplier_product_code || '-'} |{' '}
                              {formatCurrency(ingredient.supplier_price_ex_vat)} / verpakking
                              {formatPackageWeightLabel(ingredient)
                                ? ` | Gewicht: ${formatPackageWeightLabel(ingredient)}`
                                : ''}
                              {formatPackageVolumeLabel(ingredient)
                                ? ` | Inhoud: ${formatPackageVolumeLabel(ingredient)}`
                                : ''}
                            </span>
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
                    <select
                      value={recipeUnit}
                      onChange={(event) => setRecipeUnit(event.target.value)}
                      disabled={!selectedIngredient || selectedIngredientUnitOptions.length === 0}
                    >
                      {!selectedIngredientUnitOptions.length ? (
                        <option value="">Kies eerst ingrediënt</option>
                      ) : null}
                      {selectedIngredientUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedIngredient ? (
                    <p className="ingredient-selected-info">
                      Gekozen: <strong>{selectedIngredient.supplier_product_name}</strong> | Merk:{' '}
                      {selectedIngredient.supplier_brand || '-'} | Artikel:{' '}
                      {selectedIngredient.supplier_product_code || '-'} | Rekeneenheid:{' '}
                      {selectedIngredient.calculation_unit || '-'} | Aantal rekeneenheden:{' '}
                      {formatCompactNumber(selectedIngredient.calculation_quantity_per_package, 4)}
                      {formatPackageWeightLabel(selectedIngredient)
                        ? ` | Gewicht: ${formatPackageWeightLabel(selectedIngredient)}`
                        : ''}
                      {formatPackageVolumeLabel(selectedIngredient)
                        ? ` | Inhoud: ${formatPackageVolumeLabel(selectedIngredient)}`
                        : ''}
                      {' | '}Keuze: {selectedIngredientUnitOptions.join(' / ') || '-'}
                    </p>
                  ) : null}

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
                                  readOnly
                                />
                              ) : (
                                line.unit
                              )}
                            </td>
                            <td>{formatCurrency(line.line_cost)}</td>
                            <td>{formatPercent(line.line_cost_share_percent)}</td>
                            <td>{line.allergens_summary || 'Geen brondata allergenen beschikbaar'}</td>
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
                    <select
                      value={formData.final_yield_unit}
                      onChange={(event) => handleFormChange('final_yield_unit', event.target.value)}
                    >
                      <option value="">Kies een eenheid</option>
                      {endProductUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full-width">
                    Extra bewaaradvies
                    <textarea
                      value={formData.storage_notes}
                      onChange={(event) => handleFormChange('storage_notes', event.target.value)}
                    />
                  </label>
                  <label>
                    Koelkast houdbaar (dagen)
                    <input
                      type="number"
                      step="1"
                      value={formData.storage_fridge_days}
                      onChange={(event) =>
                        handleFormChange('storage_fridge_days', event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Vriezer houdbaar (dagen)
                    <input
                      type="number"
                      step="1"
                      value={formData.storage_freezer_days}
                      onChange={(event) =>
                        handleFormChange('storage_freezer_days', event.target.value)
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Allergenen broninformatie</h4>
                <p>{allergensText}</p>
              </section>
            </div>

            <div className="modal-actions sfp-actions">
              <button type="button" className="primary-btn" onClick={handleSaveProduct} disabled={isSaving}>
                {isSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button type="button" onClick={handlePrintRecipe}>Print keukenrecept</button>
              <button type="button" onClick={openLabelModal}>Print dagetiket</button>
              <button type="button" className="secondary-btn" onClick={closeModal}>Sluiten</button>
            </div>
          </div>
        </div>
      ) : null}
      {isLabelModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Print dagetiket</h3>
            </div>
            <div className="modal-body">
              <div className="modal-grid one-col calm-grid">
                <label>
                  Productnaam
                  <input type="text" value={formData.name || detail?.name || ''} readOnly />
                </label>
                <label>
                  Productiedatum
                  <input
                    type="date"
                    value={labelProductionDate}
                    onChange={(event) => setLabelProductionDate(event.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={labelUseFridge}
                    onChange={(event) => setLabelUseFridge(event.target.checked)}
                  />
                  Opslaan in koelkast
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={labelUseFreezer}
                    onChange={(event) => setLabelUseFreezer(event.target.checked)}
                  />
                  Opslaan in vriezer
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setIsLabelModalOpen(false)}>
                Annuleren
              </button>
              <button type="button" className="primary-btn" onClick={handlePrintLabel}>
                Print
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
