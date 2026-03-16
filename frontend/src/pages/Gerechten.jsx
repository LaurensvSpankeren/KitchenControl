import React, { useEffect, useMemo, useRef, useState } from 'react'

import { apiClient } from '../api/client'

const initialForm = {
  name: '',
  category_id: '',
  subcategory_id: '',
  vat_rate: '',
  menu_name: '',
  menu_description: '',
  kitchen_note: '',
  plating_advice: '',
  sale_price_incl_vat: ''
}

const EMPTY_STEPS = Array.from({ length: 10 }, () => '')

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

function formatCategoryValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  return String(value)
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

function mapDishToForm(dish) {
  return {
    name: dish.name || '',
    category_id: dish.category_id ?? '',
    subcategory_id: dish.subcategory_id ?? '',
    vat_rate: dish.vat_rate ?? '',
    menu_name: dish.menu_name || '',
    menu_description: dish.menu_description || '',
    kitchen_note: dish.kitchen_note || '',
    plating_advice: dish.plating_advice || '',
    sale_price_incl_vat: dish.sale_price_incl_vat ?? ''
  }
}

function mapFormToPayload(form) {
  return {
    name: form.name.trim(),
    category_id: form.category_id === '' ? null : Number(form.category_id),
    subcategory_id: form.subcategory_id === '' ? null : Number(form.subcategory_id),
    vat_rate: form.vat_rate === '' ? null : Number(form.vat_rate),
    menu_name: form.menu_name.trim() || null,
    menu_description: form.menu_description.trim() || null,
    kitchen_note: form.kitchen_note.trim() || null,
    plating_advice: form.plating_advice.trim() || null,
    sale_price_incl_vat:
      form.sale_price_incl_vat === '' ? null : Number(form.sale_price_incl_vat)
  }
}

export default function Gerechten() {
  const [dishes, setDishes] = useState([])
  const [archivedDishes, setArchivedDishes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [semiFinishedProducts, setSemiFinishedProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [subcategoryFilter, setSubcategoryFilter] = useState('')
  const [viewMode, setViewMode] = useState('active')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDishId, setSelectedDishId] = useState(null)
  const [isSelectedArchived, setIsSelectedArchived] = useState(false)
  const [formData, setFormData] = useState(initialForm)
  const [detail, setDetail] = useState(null)
  const [steps, setSteps] = useState(EMPTY_STEPS)

  const [ingredientSearch, setIngredientSearch] = useState('')
  const [selectedIngredient, setSelectedIngredient] = useState(null)
  const [recipeQuantity, setRecipeQuantity] = useState('')
  const [recipeUnit, setRecipeUnit] = useState('gram')
  const [semiFinishedSearch, setSemiFinishedSearch] = useState('')
  const [selectedSemiFinishedRecipe, setSelectedSemiFinishedRecipe] = useState(null)
  const [semiFinishedRecipeQuantity, setSemiFinishedRecipeQuantity] = useState('')
  const [semiFinishedRecipeUnit, setSemiFinishedRecipeUnit] = useState('gram')

  const [editingLineId, setEditingLineId] = useState(null)
  const [editingLineQuantity, setEditingLineQuantity] = useState('')
  const [editingLineUnit, setEditingLineUnit] = useState('')

  const [pageMessage, setPageMessage] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isModalDirty, setIsModalDirty] = useState(false)
  const [openActionsMenuId, setOpenActionsMenuId] = useState(null)
  const [shouldFocusNameAfterDuplicate, setShouldFocusNameAfterDuplicate] = useState(false)

  const actionsMenuRef = useRef(null)
  const nameInputRef = useRef(null)
  const isReadOnlyModal = isSelectedArchived

  const uiStyles = {
    viewModeSwitch: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' },
    recipeAddBlock: {
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '0.65rem',
      background: '#f9fafb'
    },
    recipeAddBlockSpaced: {
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '0.65rem',
      background: '#f9fafb',
      marginTop: '0.9rem'
    },
    actionCell: {
      verticalAlign: 'middle',
      paddingTop: '12px',
      paddingBottom: '12px',
      textAlign: 'center'
    },
    rowActionsWrap: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      position: 'relative'
    },
    rowActionButton: {
      marginTop: 0,
      minHeight: '30px',
      height: '30px',
      padding: '0.35rem 0.6rem',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    rowMenuButton: {
      width: '30px',
      minWidth: '30px',
      height: '30px',
      marginTop: 0,
      padding: 0,
      lineHeight: 1,
      fontSize: '1rem'
    },
    rowMenu: {
      position: 'absolute',
      top: '100%',
      right: 0,
      zIndex: 15,
      marginTop: '0.2rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      background: '#fff',
      boxShadow: '0 6px 14px rgba(17,24,39,0.12)',
      minWidth: '140px',
      padding: '0.25rem'
    },
    rowMenuItem: {
      width: '100%',
      marginTop: 0,
      textAlign: 'left',
      border: '1px solid transparent',
      borderRadius: '6px',
      background: '#fff',
      padding: '0.45rem 0.5rem'
    },
    modalActionsRight: { display: 'flex', gap: '0.55rem', flexWrap: 'wrap' },
    idFieldHint: { fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem' }
  }

  async function enrichDishesWithDetail(items) {
    const source = Array.isArray(items) ? items : []
    const detailedItems = await Promise.all(
      source.map(async (item) => {
        try {
          const loadedDetail = await apiClient.getDishDetail(item.id)
          return { ...item, ...loadedDetail }
        } catch {
          return item
        }
      })
    )
    return detailedItems
  }

  async function loadDishes() {
    try {
      const data = await apiClient.getDishes()
      setDishes(await enrichDishesWithDetail(data))
    } catch {
      setDishes([])
    }
  }

  async function loadArchivedDishes() {
    try {
      const data = await apiClient.getArchivedDishes()
      setArchivedDishes(await enrichDishesWithDetail(data))
    } catch {
      setArchivedDishes([])
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

  async function loadSemiFinishedProducts() {
    try {
      const data = await apiClient.getSemiFinishedProducts()
      setSemiFinishedProducts(Array.isArray(data) ? data : [])
    } catch {
      setSemiFinishedProducts([])
    }
  }

  async function loadDetail(dishId) {
    if (!dishId) {
      setDetail(null)
      return
    }

    try {
      const data = await apiClient.getDishDetail(dishId)
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
      setSteps([...EMPTY_STEPS])
    }
  }

  useEffect(() => {
    loadDishes()
    loadArchivedDishes()
    loadIngredients()
    loadSemiFinishedProducts()
  }, [])

  useEffect(() => {
    if (!openActionsMenuId) {
      return
    }

    function handleOutsideClick(event) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setOpenActionsMenuId(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [openActionsMenuId])

  useEffect(() => {
    if (!isModalOpen || !shouldFocusNameAfterDuplicate) {
      return
    }
    const timer = window.setTimeout(() => {
      if (nameInputRef.current) {
        nameInputRef.current.focus()
        nameInputRef.current.select()
      }
      setShouldFocusNameAfterDuplicate(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isModalOpen, shouldFocusNameAfterDuplicate])

  const allDishes = useMemo(() => [...dishes, ...archivedDishes], [dishes, archivedDishes])

  const categoryOptions = useMemo(
    () =>
      [...new Set(allDishes.map((item) => String(item.category_id ?? '')).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'nl')
      ),
    [allDishes]
  )

  const subcategoryOptions = useMemo(
    () =>
      [
        ...new Set(
          allDishes
            .filter((item) => !categoryFilter || String(item.category_id ?? '') === categoryFilter)
            .map((item) => String(item.subcategory_id ?? ''))
            .filter(Boolean)
        )
      ].sort((a, b) => a.localeCompare(b, 'nl')),
    [allDishes, categoryFilter]
  )

  const visibleDishes = useMemo(() => {
    const source = viewMode === 'active' ? dishes : archivedDishes
    const term = searchTerm.trim().toLowerCase()

    return source
      .filter((item) => {
        if (categoryFilter && String(item.category_id ?? '') !== categoryFilter) {
          return false
        }
        if (subcategoryFilter && String(item.subcategory_id ?? '') !== subcategoryFilter) {
          return false
        }
        if (!term) {
          return true
        }
        const haystacks = [
          String(item.name || ''),
          String(item.menu_name || ''),
          String(item.menu_description || '')
        ]
        return haystacks.some((value) => value.toLowerCase().includes(term))
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nl'))
  }, [viewMode, dishes, archivedDishes, searchTerm, categoryFilter, subcategoryFilter])

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

  const filteredSemiFinishedOptions = useMemo(() => {
    const term = semiFinishedSearch.trim().toLowerCase()
    if (!term) {
      return []
    }
    return semiFinishedProducts
      .filter((item) => String(item.name || '').toLowerCase().includes(term))
      .slice(0, 25)
  }, [semiFinishedSearch, semiFinishedProducts])

  function openNewModal() {
    setSelectedDishId(null)
    setIsSelectedArchived(false)
    setFormData(initialForm)
    setDetail(null)
    setSteps([...EMPTY_STEPS])
    setIngredientSearch('')
    setSelectedIngredient(null)
    setRecipeQuantity('')
    setRecipeUnit('gram')
    setSemiFinishedSearch('')
    setSelectedSemiFinishedRecipe(null)
    setSemiFinishedRecipeQuantity('')
    setSemiFinishedRecipeUnit('gram')
    setEditingLineId(null)
    setEditingLineQuantity('')
    setEditingLineUnit('')
    setModalMessage('')
    setErrorMessage('')
    setIsModalDirty(false)
    setIsModalOpen(true)
  }

  async function openEditModal(dish, sourceView = 'active') {
    setSelectedDishId(dish.id)
    setIsSelectedArchived(sourceView === 'archived' || !!dish.is_archived)
    setFormData(mapDishToForm(dish))
    setIngredientSearch('')
    setSelectedIngredient(null)
    setRecipeQuantity('')
    setRecipeUnit('gram')
    setSemiFinishedSearch('')
    setSelectedSemiFinishedRecipe(null)
    setSemiFinishedRecipeQuantity('')
    setSemiFinishedRecipeUnit('gram')
    setEditingLineId(null)
    setEditingLineQuantity('')
    setEditingLineUnit('')
    setModalMessage('')
    setErrorMessage('')
    setIsModalDirty(false)
    setIsModalOpen(true)
    await loadDetail(dish.id)
  }

  function closeModal() {
    if (isSaving) {
      return
    }
    if (isModalDirty) {
      const confirmed = window.confirm(
        'Je hebt niet-opgeslagen wijzigingen. Weet je zeker dat je wilt sluiten?'
      )
      if (!confirmed) {
        return
      }
    }
    setIsModalOpen(false)
  }

  function handleFormChange(field, value) {
    if (isReadOnlyModal) {
      return
    }
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsModalDirty(true)
  }

  function handleStepChange(index, value) {
    if (isReadOnlyModal) {
      return
    }
    setSteps((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    setIsModalDirty(true)
  }

  function startEditLine(line) {
    if (isReadOnlyModal) {
      return
    }
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
    if (!selectedDishId || isReadOnlyModal) {
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
      await apiClient.updateDishRecipeLine(selectedDishId, line.id, {
        quantity,
        unit: editingLineUnit.trim(),
        sort_order: line.sort_order
      })
      await loadDishes()
      await loadArchivedDishes()
      await loadDetail(selectedDishId)
      setModalMessage('Receptregel bijgewerkt.')
      cancelEditLine()
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Receptregel bijwerken mislukt.')
    }
  }

  async function handleDeleteLine(line) {
    if (!selectedDishId || isReadOnlyModal) {
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je deze receptregel wilt verwijderen?')
    if (!confirmed) {
      return
    }

    setErrorMessage('')
    try {
      await apiClient.deleteDishRecipeLine(selectedDishId, line.id)
      await loadDishes()
      await loadArchivedDishes()
      await loadDetail(selectedDishId)
      setModalMessage('Receptregel verwijderd.')
      if (editingLineId === line.id) {
        cancelEditLine()
      }
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Receptregel verwijderen mislukt.')
    }
  }

  async function handleSaveDish() {
    if (isReadOnlyModal) {
      return
    }
    if (!formData.name.trim()) {
      setErrorMessage('Naam is verplicht.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    setModalMessage('')

    try {
      const payload = mapFormToPayload(formData)
      let dishId = selectedDishId

      if (dishId) {
        await apiClient.updateDish(dishId, payload)
      } else {
        const created = await apiClient.createDish(payload)
        dishId = created.id
        setSelectedDishId(created.id)
      }

      const cleanedSteps = steps
        .map((instruction, index) => ({
          step_number: index + 1,
          instruction: instruction.trim()
        }))
        .filter((step) => step.instruction)

      await apiClient.saveDishRecipeSteps(dishId, { steps: cleanedSteps })
      await loadDishes()
      await loadArchivedDishes()
      await loadDetail(dishId)
      setModalMessage('Gerecht opgeslagen.')
      setPageMessage('Gerecht opgeslagen.')
      setIsModalDirty(false)
    } catch {
      setErrorMessage('Opslaan mislukt.')
    } finally {
      setIsSaving(false)
    }
  }

  async function ensureDishExistsBeforeRecipeEdit() {
    if (selectedDishId) {
      return selectedDishId
    }

    if (!formData.name.trim()) {
      setErrorMessage('Vul eerst een naam in voordat je receptregels toevoegt.')
      return null
    }

    const created = await apiClient.createDish(mapFormToPayload(formData))
    setSelectedDishId(created.id)
    return created.id
  }

  async function handleAddIngredientLine() {
    if (isReadOnlyModal) {
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
      const dishId = await ensureDishExistsBeforeRecipeEdit()
      if (!dishId) {
        return
      }
      const selectedUnit =
        recipeUnit || selectedIngredient.calculation_unit || selectedIngredient.base_unit || 'gram'
      await apiClient.addDishRecipeLine(dishId, {
        item_type: 'ingredient',
        item_id: selectedIngredient.id,
        quantity,
        unit: selectedUnit
      })
      await loadDishes()
      await loadArchivedDishes()
      await loadDetail(dishId)
      setIngredientSearch('')
      setSelectedIngredient(null)
      setRecipeQuantity('')
      setRecipeUnit('gram')
      setModalMessage('Ingrediënt toegevoegd aan recept.')
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Ingrediënt toevoegen mislukt.')
    }
  }

  async function handleAddSemiFinishedLine() {
    if (isReadOnlyModal) {
      return
    }
    if (!selectedSemiFinishedRecipe) {
      setErrorMessage('Kies eerst een halffabricaat.')
      return
    }

    const quantity = Number(semiFinishedRecipeQuantity)
    if (!semiFinishedRecipeQuantity || Number.isNaN(quantity) || quantity <= 0) {
      setErrorMessage('Vul een geldige hoeveelheid in.')
      return
    }
    if (!semiFinishedRecipeUnit.trim()) {
      setErrorMessage('Vul een eenheid in.')
      return
    }

    setErrorMessage('')
    try {
      const dishId = await ensureDishExistsBeforeRecipeEdit()
      if (!dishId) {
        return
      }
      await apiClient.addDishRecipeLine(dishId, {
        item_type: 'semi_finished_product',
        item_id: selectedSemiFinishedRecipe.id,
        quantity,
        unit: semiFinishedRecipeUnit.trim()
      })
      await loadDishes()
      await loadArchivedDishes()
      await loadDetail(dishId)
      setSemiFinishedSearch('')
      setSelectedSemiFinishedRecipe(null)
      setSemiFinishedRecipeQuantity('')
      setSemiFinishedRecipeUnit('gram')
      setModalMessage('Halffabricaat toegevoegd aan recept.')
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Halffabricaat toevoegen mislukt.')
    }
  }

  async function handleArchiveById(dishId, options = {}) {
    if (!dishId) {
      return
    }
    const confirmed = window.confirm('Weet je zeker dat je dit gerecht wilt archiveren?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.archiveDish(dishId)
      await loadDishes()
      await loadArchivedDishes()
      setOpenActionsMenuId(null)
      if (options.closeModalAfter) {
        setIsModalOpen(false)
        setViewMode('active')
      }
      setPageMessage('Gerecht gearchiveerd.')
    } catch {
      setErrorMessage('Archiveren mislukt.')
    }
  }

  async function handleArchiveDish() {
    await handleArchiveById(selectedDishId, { closeModalAfter: true })
  }

  async function handleRestoreById(dishId) {
    if (!dishId) {
      return
    }

    try {
      await apiClient.restoreDish(dishId)
      await loadDishes()
      await loadArchivedDishes()
      setOpenActionsMenuId(null)
      setPageMessage('Gerecht hersteld uit archief.')
    } catch {
      setErrorMessage('Herstellen mislukt.')
    }
  }

  async function handleRestoreDish() {
    if (!selectedDishId) {
      return
    }

    try {
      await apiClient.restoreDish(selectedDishId)
      await loadDishes()
      await loadArchivedDishes()
      setIsModalOpen(false)
      setViewMode('active')
      setPageMessage('Gerecht hersteld uit archief.')
    } catch {
      setErrorMessage('Herstellen mislukt.')
    }
  }

  async function handleDeleteById(dishId) {
    if (!dishId) {
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je dit gerecht definitief wilt verwijderen?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteDish(dishId)
      await loadArchivedDishes()
      setOpenActionsMenuId(null)
      setPageMessage('Gerecht verwijderd.')
    } catch {
      setErrorMessage('Verwijderen mislukt.')
    }
  }

  async function handleDeleteDish() {
    if (!selectedDishId || !isSelectedArchived) {
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je dit gerecht definitief wilt verwijderen?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteDish(selectedDishId)
      await loadArchivedDishes()
      setIsModalOpen(false)
      setPageMessage('Gerecht verwijderd.')
    } catch {
      setErrorMessage('Verwijderen mislukt.')
    }
  }

  async function handleDuplicateDish(item) {
    try {
      const duplicate = await apiClient.duplicateDish(item.id)
      await loadDishes()
      await loadArchivedDishes()
      setOpenActionsMenuId(null)
      setViewMode('active')
      setPageMessage('Gerecht gedupliceerd.')
      setShouldFocusNameAfterDuplicate(true)
      await openEditModal(duplicate, 'active')
    } catch {
      setErrorMessage('Dupliceren mislukt.')
    }
  }

  const allergensText = detail?.allergens_total || 'Geen brondata allergenen beschikbaar'

  return (
    <div>
      <header className="page-header">
        <h2>Gerechten</h2>
        <p>Beheer eindgerechten bovenop halffabricaten, met receptregels en basisgegevens.</p>
      </header>

      <section className="card">
        <div style={uiStyles.viewModeSwitch}>
          <button
            type="button"
            className="table-action-btn"
            style={viewMode === 'active' ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
            onClick={() => setViewMode('active')}
          >
            Actief
          </button>
          <button
            type="button"
            className="table-action-btn"
            style={viewMode === 'archived' ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
            onClick={() => setViewMode('archived')}
          >
            Archief
          </button>
        </div>

        <div className="sfp-toolbar">
          <input
            type="text"
            placeholder="Zoek op naam of menukaartnaam"
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
            {subcategoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button type="button" className="sfp-new-btn" onClick={openNewModal}>
            Nieuw gerecht
          </button>
        </div>

        {pageMessage ? <p className="form-info inline-message">{pageMessage}</p> : null}

        {visibleDishes.length === 0 ? (
          <p>Nog geen gerechten gevonden.</p>
        ) : (
          <div className="table-scroll">
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Categorie</th>
                  <th>Subcategorie</th>
                  <th style={{ minWidth: '95px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    Kostprijs
                  </th>
                  <th style={{ minWidth: '120px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    Verkoopprijs incl BTW
                  </th>
                  <th style={{ minWidth: '90px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    Marge %
                  </th>
                  <th>Allergenen</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {visibleDishes.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{formatCategoryValue(item.category_id)}</td>
                    <td>{formatCategoryValue(item.subcategory_id)}</td>
                    <td style={{ minWidth: '95px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatCurrency(item.estimated_cost_total)}
                    </td>
                    <td style={{ minWidth: '120px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatCurrency(item.sale_price_incl_vat)}
                    </td>
                    <td style={{ minWidth: '90px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatPercent(item.gross_margin_percent)}
                    </td>
                    <td>{item.allergens_total || 'Geen brondata allergenen beschikbaar'}</td>
                    <td style={uiStyles.actionCell}>
                      <div style={uiStyles.rowActionsWrap} ref={openActionsMenuId === item.id ? actionsMenuRef : null}>
                        <button
                          type="button"
                          className="table-action-btn"
                          style={uiStyles.rowActionButton}
                          onClick={() => openEditModal(item, viewMode)}
                        >
                          Openen
                        </button>
                        <button
                          type="button"
                          className="table-action-btn"
                          aria-label="Meer acties"
                          style={uiStyles.rowMenuButton}
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenActionsMenuId((prev) => (prev === item.id ? null : item.id))
                          }}
                        >
                          ⋯
                        </button>
                        {openActionsMenuId === item.id ? (
                          <div style={uiStyles.rowMenu} onClick={(event) => event.stopPropagation()}>
                            {viewMode === 'active' ? (
                              <>
                                <button
                                  type="button"
                                  style={uiStyles.rowMenuItem}
                                  onClick={() => handleDuplicateDish(item)}
                                >
                                  ⧉ Dupliceren
                                </button>
                                <button
                                  type="button"
                                  style={uiStyles.rowMenuItem}
                                  onClick={() => handleArchiveById(item.id)}
                                >
                                  <span style={{ color: '#d97706' }}>🗄</span> Archiveren
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  style={uiStyles.rowMenuItem}
                                  onClick={() => handleRestoreById(item.id)}
                                >
                                  ♻️ Herstellen
                                </button>
                                <button
                                  type="button"
                                  style={uiStyles.rowMenuItem}
                                  onClick={() => handleDeleteById(item.id)}
                                >
                                  🗑 Verwijderen
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
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
              <h3>{selectedDishId ? 'Gerecht bewerken' : 'Nieuw gerecht'}</h3>
            </div>

            <div className="modal-body">
              {errorMessage ? <div className="modal-validation-banner">{errorMessage}</div> : null}
              {modalMessage ? <p className="form-info inline-message">{modalMessage}</p> : null}

              <section className="modal-section">
                <h4>Algemeen</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Naam
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={formData.name}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('name', event.target.value)}
                    />
                  </label>
                  <label>
                    BTW %
                    <input
                      type="number"
                      step="any"
                      value={formData.vat_rate}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('vat_rate', event.target.value)}
                    />
                  </label>
                  <label>
                    Categorie
                    <input
                      type="number"
                      step="1"
                      value={formData.category_id}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('category_id', event.target.value)}
                    />
                    <span style={uiStyles.idFieldHint}>Tijdelijk categorie-ID tot categoriebeheer is toegevoegd.</span>
                  </label>
                  <label>
                    Subcategorie
                    <input
                      type="number"
                      step="1"
                      value={formData.subcategory_id}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('subcategory_id', event.target.value)}
                    />
                    <span style={uiStyles.idFieldHint}>Tijdelijk subcategorie-ID tot categoriebeheer is toegevoegd.</span>
                  </label>
                  <label>
                    Verkoopprijs incl BTW
                    <input
                      type="number"
                      step="any"
                      value={formData.sale_price_incl_vat}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('sale_price_incl_vat', event.target.value)}
                    />
                  </label>
                  <label>
                    Menukaartnaam
                    <input
                      type="text"
                      value={formData.menu_name}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('menu_name', event.target.value)}
                    />
                  </label>
                  <label className="full-width">
                    Menukaartomschrijving
                    <textarea
                      value={formData.menu_description}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('menu_description', event.target.value)}
                    />
                  </label>
                  <label className="full-width">
                    Keukenopmerking
                    <textarea
                      value={formData.kitchen_note}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('kitchen_note', event.target.value)}
                    />
                  </label>
                  <label className="full-width">
                    Opmaakadvies
                    <textarea
                      value={formData.plating_advice}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('plating_advice', event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Recept</h4>
                <div className="sfp-ingredient-add" style={uiStyles.recipeAddBlock}>
                  <input
                    type="text"
                    placeholder="Zoek op naam, merk of artikelnummer"
                    value={ingredientSearch}
                    readOnly={isReadOnlyModal}
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
                              if (isReadOnlyModal) {
                                return
                              }
                              setSelectedIngredient(ingredient)
                              const options = getIngredientUnitOptions(ingredient)
                              setRecipeUnit(options[0] || 'gram')
                              setIsModalDirty(true)
                            }}
                            disabled={isReadOnlyModal}
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
                      readOnly={isReadOnlyModal}
                      onChange={(event) => {
                        setRecipeQuantity(event.target.value)
                        setIsModalDirty(true)
                      }}
                    />
                    <select
                      value={recipeUnit}
                      onChange={(event) => {
                        setRecipeUnit(event.target.value)
                        setIsModalDirty(true)
                      }}
                      disabled={!selectedIngredient || selectedIngredientUnitOptions.length === 0 || isReadOnlyModal}
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
                    </p>
                  ) : null}

                  <button type="button" onClick={handleAddIngredientLine} disabled={isReadOnlyModal}>
                    Toevoegen aan recept
                  </button>
                </div>

                <div className="sfp-ingredient-add" style={uiStyles.recipeAddBlockSpaced}>
                  <input
                    type="text"
                    placeholder="Zoek halffabricaat op naam"
                    value={semiFinishedSearch}
                    readOnly={isReadOnlyModal}
                    onChange={(event) => setSemiFinishedSearch(event.target.value)}
                  />

                  {semiFinishedSearch.trim() ? (
                    filteredSemiFinishedOptions.length > 0 ? (
                      <div className="ingredient-picker">
                        {filteredSemiFinishedOptions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`ingredient-picker-item${selectedSemiFinishedRecipe?.id === item.id ? ' is-active' : ''}`}
                            onClick={() => {
                              if (isReadOnlyModal) {
                                return
                              }
                              setSelectedSemiFinishedRecipe(item)
                              setSemiFinishedRecipeUnit(item.final_yield_unit || 'gram')
                              setIsModalDirty(true)
                            }}
                            disabled={isReadOnlyModal}
                          >
                            <strong>{item.name}</strong>
                            <span className="ingredient-picker-meta">
                              Kostprijs: {formatCurrency(item.estimated_cost_total)} | Allergenen:{' '}
                              {item.allergens_total || '-'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>Geen halffabricaten gevonden.</p>
                    )
                  ) : null}

                  <div className="recipe-line-inline">
                    <input
                      type="number"
                      step="any"
                      placeholder="Hoeveelheid"
                      value={semiFinishedRecipeQuantity}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => {
                        setSemiFinishedRecipeQuantity(event.target.value)
                        setIsModalDirty(true)
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Eenheid"
                      value={semiFinishedRecipeUnit}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => {
                        setSemiFinishedRecipeUnit(event.target.value)
                        setIsModalDirty(true)
                      }}
                    />
                  </div>

                  {selectedSemiFinishedRecipe ? (
                    <p className="ingredient-selected-info">
                      Gekozen halffabricaat: <strong>{selectedSemiFinishedRecipe.name}</strong> | Eenheid:{' '}
                      {selectedSemiFinishedRecipe.final_yield_unit || '-'}
                    </p>
                  ) : null}

                  <button type="button" onClick={handleAddSemiFinishedLine} disabled={isReadOnlyModal}>
                    Halffabricaat toevoegen aan recept
                  </button>
                </div>

                {detail?.recipe_lines?.length ? (
                  <div className="table-scroll">
                    <table className="recipe-lines-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Merk</th>
                          <th>Hoeveelheid</th>
                          <th>Eenheid</th>
                          <th>Regelprijs</th>
                          <th>% van kostprijs</th>
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
                                  readOnly={isReadOnlyModal}
                                  onChange={(event) => {
                                    setEditingLineQuantity(event.target.value)
                                    setIsModalDirty(true)
                                  }}
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
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => handleSaveEditedLine(line)}
                                      disabled={isReadOnlyModal}
                                    >
                                      Opslaan
                                    </button>
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={cancelEditLine}
                                      disabled={isReadOnlyModal}
                                    >
                                      Annuleren
                                    </button>
                                  </>
                                ) : !isReadOnlyModal ? (
                                  <>
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => startEditLine(line)}
                                    >
                                      Bewerken
                                    </button>
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => handleDeleteLine(line)}
                                    >
                                      Verwijderen
                                    </button>
                                  </>
                                ) : (
                                  <span>-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Nog geen receptregels.</p>
                )}
              </section>

              <section className="modal-section">
                <h4>Receptstappen</h4>
                <div className="modal-grid one-col calm-grid">
                  {steps.map((step, index) => (
                    <label key={`step-${index + 1}`}>
                      Stap {index + 1}
                      <textarea
                        value={step}
                        readOnly={isReadOnlyModal}
                        onChange={(event) => handleStepChange(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="modal-section">
                <h4>Allergenen broninformatie</h4>
                <p>{allergensText}</p>
              </section>
            </div>

            <div className="modal-actions sfp-actions">
              <div style={uiStyles.modalActionsRight}>
                {!isSelectedArchived ? (
                  <>
                    {selectedDishId ? (
                      <button type="button" className="table-action-btn" onClick={handleArchiveDish}>
                        Archiveren
                      </button>
                    ) : null}
                    <button type="button" className="primary-btn" onClick={handleSaveDish} disabled={isSaving}>
                      {isSaving ? 'Opslaan...' : 'Opslaan'}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="primary-btn" onClick={handleRestoreDish}>
                      Herstellen
                    </button>
                    <button type="button" className="table-action-btn" onClick={handleDeleteDish}>
                      Verwijderen
                    </button>
                  </>
                )}
                <button type="button" className="secondary-btn" onClick={closeModal}>
                  Sluiten
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
