import React, { useEffect, useMemo, useRef, useState } from 'react'

import { apiClient, API_BASE_URL } from '../api/client'
import { printHtml } from '../utils/browserPrint'
import { getCurrentUser, getCurrentUserRole } from '../utils/currentUser'

const defaultPermissions = {
  gerechten: {
    bekijken: ['Supervisor', 'Chef', 'Kok', 'Keukenhulp', 'Bediening'],
    aanmaken: ['Supervisor', 'Chef', 'Kok'],
    wijzigen: ['Supervisor', 'Chef', 'Kok'],
    archiveren: ['Supervisor'],
    verwijderen: ['Supervisor'],
    herstellen: ['Supervisor'],
    dupliceren: ['Supervisor', 'Chef', 'Kok']
  },
  halffabricaten: {
    bekijken: ['Supervisor', 'Chef', 'Kok', 'Keukenhulp', 'Bediening'],
    aanmaken: ['Supervisor', 'Chef', 'Kok'],
    wijzigen: ['Supervisor', 'Chef', 'Kok'],
    archiveren: ['Supervisor'],
    verwijderen: ['Supervisor'],
    herstellen: ['Supervisor'],
    dupliceren: ['Supervisor', 'Chef', 'Kok']
  },
  menukaarten: {
    bekijken: ['Supervisor', 'Chef', 'Kok', 'Keukenhulp', 'Bediening'],
    aanmaken: ['Supervisor', 'Chef', 'Kok'],
    wijzigen: ['Supervisor', 'Chef', 'Kok'],
    archiveren: ['Supervisor'],
    verwijderen: ['Supervisor'],
    herstellen: ['Supervisor'],
    dupliceren: ['Supervisor', 'Chef', 'Kok']
  }
}

function unflattenPermissions(flat) {
  const nested = {}

  Object.entries(flat || {}).forEach(([key, roles]) => {
    const [domain, action] = String(key).split('.')
    if (!domain || !action) {
      return
    }

    if (!nested[domain]) {
      nested[domain] = {}
    }

    nested[domain][action] = roles
  })

  return nested
}

function readStoredPermissions() {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = localStorage.getItem('permissions')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storePermissionsLocally(nextPermissions) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    localStorage.setItem('permissions', JSON.stringify(nextPermissions))
  } catch {
    // Ignore storage errors and keep defaults as fallback.
  }
}

const initialForm = {
  name: '',
  photo_path: '',
  category_id: '',
  subcategory_id: '',
  vat_rate: '9',
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

function hasPermission(permissions, domain, action, role) {
  return permissions?.[domain]?.[action]?.includes(role)
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

function formatCalculationContentLabel(ingredient) {
  if (!ingredient) {
    return null
  }
  const amount = Number(ingredient.calculation_quantity_per_package)
  const unit = normalizeUnit(ingredient.calculation_unit)
  if (Number.isNaN(amount) || !unit) {
    return null
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

function resolvePhotoUrl(path) {
  const value = String(path || '').trim()
  if (!value) {
    return ''
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }
  return `${apiClient.getStatus().baseUrl}${value.startsWith('/') ? value : `/${value}`}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getCurrentChefName() {
  if (typeof window === 'undefined') {
    return '-'
  }

  const candidateKeys = ['currentUser', 'user', 'kc_user', 'kitchencontrol_user']
  for (const key of candidateKeys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      continue
    }
    try {
      const parsed = JSON.parse(raw)
      const name =
        parsed?.name ||
        parsed?.full_name ||
        parsed?.fullName ||
        parsed?.username ||
        parsed?.email
      if (name) {
        return String(name)
      }
    } catch {
      // Ignore malformed storage content and continue fallback chain.
    }
  }

  return '-'
}

function getPrintBootstrapScript() {
  return `
    <script>
      (function () {
        let hasPrinted = false;
        function triggerPrint() {
          if (hasPrinted) {
            return;
          }
          hasPrinted = true;
          try { window.focus(); } catch (error) {}
          window.print();
        }

        window.addEventListener('load', function () {
          setTimeout(triggerPrint, 350);
        });

        setTimeout(triggerPrint, 1400);

        const fallbackButton = document.getElementById('manual-print-btn');
        if (fallbackButton) {
          fallbackButton.addEventListener('click', triggerPrint);
        }
      })();
    </script>
  `
}

function mapDishToForm(dish) {
  return {
    name: dish.name || '',
    photo_path: dish.photo_path || '',
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
    photo_path: form.photo_path || null,
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
  const [permissions, setPermissions] = useState(defaultPermissions)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [dishes, setDishes] = useState([])
  const [archivedDishes, setArchivedDishes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [semiFinishedProducts, setSemiFinishedProducts] = useState([])
  const [dishCategories, setDishCategories] = useState([])
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
  const [salePriceInput, setSalePriceInput] = useState('')
  const [photoCacheBuster, setPhotoCacheBuster] = useState(Date.now())

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
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewSubcategoryInput, setShowNewSubcategoryInput] = useState(false)
  const [newSubcategoryName, setNewSubcategoryName] = useState('')

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
  const currentUser = getCurrentUser()
  const role = currentUser?.role
  const currentUserRole = useMemo(() => getCurrentUserRole(), [])
  const canManageSupervisorDishActions = currentUserRole === 'Supervisor'
  const canViewDishes = !isLoadingPermissions && hasPermission(permissions, 'gerechten', 'bekijken', role)
  const canCreateDishes = !isLoadingPermissions && hasPermission(permissions, 'gerechten', 'aanmaken', role)
  const canEditDishes = !isLoadingPermissions && hasPermission(permissions, 'gerechten', 'wijzigen', role)

  const uiStyles = {
    viewModeSwitch: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' },
    photoPreviewWrap: { marginTop: '0.5rem' },
    photoPreview: {
      display: 'block',
      width: '100%',
      maxWidth: '220px',
      maxHeight: '140px',
      objectFit: 'cover',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      marginBottom: '0.5rem'
    },
    photoPlaceholder: {
      width: '100%',
      maxWidth: '220px',
      height: '140px',
      border: '1px dashed #d1d5db',
      borderRadius: '8px',
      background: '#f9fafb',
      color: '#6b7280',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '0.75rem',
      boxSizing: 'border-box',
      marginBottom: '0.5rem'
    },
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
    modalActionsRight: { display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }
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
      setIngredients(Array.isArray(data) ? data.filter((item) => !item?.is_archived) : [])
    } catch {
      setIngredients([])
    }
  }

  async function loadSemiFinishedProducts() {
    try {
      const data = await apiClient.getSemiFinishedProducts()
      setSemiFinishedProducts(
        Array.isArray(data) ? data.filter((item) => !item?.is_archived) : []
      )
    } catch {
      setSemiFinishedProducts([])
    }
  }

  async function loadDishCategories() {
    try {
      const data = await apiClient.getDishCategories()
      setDishCategories(Array.isArray(data) ? data : [])
    } catch {
      setDishCategories([])
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
    let isCancelled = false

    async function loadPermissions() {
      setIsLoadingPermissions(true)
      try {
        const token = apiClient.getAuthToken()
        const response = await fetch(`${API_BASE_URL}/api/permissions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch permissions: ${response.status}`)
        }

        const data = await response.json()
        const nextPermissions =
          data?.permissions && typeof data.permissions === 'object'
            ? unflattenPermissions(data.permissions)
            : defaultPermissions
        const resolvedPermissions =
          nextPermissions && Object.keys(nextPermissions).length > 0 ? nextPermissions : defaultPermissions

        if (!isCancelled) {
          setPermissions(resolvedPermissions)
          storePermissionsLocally(resolvedPermissions)
        }
      } catch {
        const fallbackPermissions = readStoredPermissions()
        if (!isCancelled) {
          setPermissions(
            fallbackPermissions && typeof fallbackPermissions === 'object'
              ? fallbackPermissions
              : defaultPermissions
          )
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPermissions(false)
        }
      }
    }

    loadPermissions()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    loadDishes()
    loadArchivedDishes()
    loadIngredients()
    loadSemiFinishedProducts()
    loadDishCategories()
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

  useEffect(() => {
    setSalePriceInput(
      formData.sale_price_incl_vat === null || formData.sale_price_incl_vat === undefined
        ? ''
        : String(formData.sale_price_incl_vat)
    )
  }, [formData.sale_price_incl_vat])

  const categoryNameById = useMemo(() => {
    const next = new Map()
    dishCategories.forEach((category) => {
      next.set(String(category.id), category.name)
    })
    return next
  }, [dishCategories])

  const subcategoryNameById = useMemo(() => {
    const next = new Map()
    dishCategories.forEach((category) => {
      ;(category.subcategories || []).forEach((subcategory) => {
        next.set(String(subcategory.id), subcategory.name)
      })
    })
    return next
  }, [dishCategories])

  const categoryOptions = useMemo(
    () =>
      dishCategories
        .map((category) => category.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'nl')),
    [dishCategories]
  )

  const filterSubcategoryOptions = useMemo(() => {
    if (!categoryFilter) {
      return []
    }
    const categoryRecord = dishCategories.find((category) => category.name === categoryFilter) || null
    return (categoryRecord?.subcategories || [])
      .map((subcategory) => subcategory.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl'))
  }, [dishCategories, categoryFilter])

  const selectedCategoryRecord = useMemo(
    () =>
      dishCategories.find((category) => String(category.id) === String(formData.category_id || '')) ||
      null,
    [dishCategories, formData.category_id]
  )

  const modalCategoryOptions = useMemo(() => dishCategories, [dishCategories])

  const modalSubcategoryOptions = useMemo(
    () => selectedCategoryRecord?.subcategories || [],
    [selectedCategoryRecord]
  )

  const liveCalculation = useMemo(() => {
    const estimatedCostTotal = Number(detail?.estimated_cost_total)
    const vatRate = Number(formData.vat_rate)
    const currentSalePriceInput =
      salePriceInput.trim() !== ''
        ? salePriceInput.trim()
        : String(formData.sale_price_incl_vat ?? '').trim()

    if (currentSalePriceInput === '') {
      return null
    }

    const salePriceIncl = Number(currentSalePriceInput)

    if (
      Number.isNaN(estimatedCostTotal) ||
      Number.isNaN(vatRate) ||
      Number.isNaN(salePriceIncl)
    ) {
      return null
    }

    const vatMultiplier = 1 + vatRate / 100
    if (!Number.isFinite(vatMultiplier) || vatMultiplier <= 0) {
      return null
    }

    const salePriceExcl = salePriceIncl / vatMultiplier
    if (!Number.isFinite(salePriceExcl) || salePriceExcl <= 0) {
      return null
    }

    const grossProfit = salePriceExcl - estimatedCostTotal
    const grossMarginPercent = (grossProfit / salePriceExcl) * 100
    const foodCostPercent = (estimatedCostTotal / salePriceExcl) * 100

    if (
      !Number.isFinite(grossProfit) ||
      !Number.isFinite(grossMarginPercent) ||
      !Number.isFinite(foodCostPercent)
    ) {
      return null
    }

    return {
      sale_price_excl_vat: salePriceExcl,
      gross_profit: grossProfit,
      gross_margin_percent: grossMarginPercent,
      food_cost_percent: foodCostPercent
    }
  }, [detail?.estimated_cost_total, formData.sale_price_incl_vat, formData.vat_rate, salePriceInput])

  function getCategoryNameById(categoryId) {
    if (categoryId === null || categoryId === undefined || categoryId === '') {
      return '-'
    }
    return categoryNameById.get(String(categoryId)) || String(categoryId)
  }

  function getSubcategoryNameById(subcategoryId) {
    if (subcategoryId === null || subcategoryId === undefined || subcategoryId === '') {
      return '-'
    }
    return subcategoryNameById.get(String(subcategoryId)) || String(subcategoryId)
  }

  const visibleDishes = useMemo(() => {
    const source = viewMode === 'active' ? dishes : archivedDishes
    const term = searchTerm.trim().toLowerCase()

    return source
      .filter((item) => {
        const categoryName = getCategoryNameById(item.category_id)
        const subcategoryName = getSubcategoryNameById(item.subcategory_id)

        if (categoryFilter && categoryName !== categoryFilter) {
          return false
        }
        if (subcategoryFilter && subcategoryName !== subcategoryFilter) {
          return false
        }
        if (!term) {
          return true
        }
        const haystacks = [
          String(item.name || ''),
          String(item.menu_name || ''),
          String(item.menu_description || ''),
          categoryName,
          subcategoryName
        ]
        return haystacks.some((value) => value.toLowerCase().includes(term))
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nl'))
  }, [viewMode, dishes, archivedDishes, searchTerm, categoryFilter, subcategoryFilter, dishCategories])

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
      .filter((item) => !item?.is_archived)
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
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setShowNewSubcategoryInput(false)
    setNewSubcategoryName('')
    setPhotoCacheBuster(Date.now())
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
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setShowNewSubcategoryInput(false)
    setNewSubcategoryName('')
    setPhotoCacheBuster(Date.now())
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

  function handleCategoryChange(value) {
    if (isReadOnlyModal) {
      return
    }
    setFormData((prev) => ({
      ...prev,
      category_id: value,
      subcategory_id: ''
    }))
    setIsModalDirty(true)
  }

  function commitSalePriceInput() {
    if (isReadOnlyModal) {
      return
    }
    const nextValue = salePriceInput.trim()
    const normalizedCurrent =
      formData.sale_price_incl_vat === null || formData.sale_price_incl_vat === undefined
        ? ''
        : String(formData.sale_price_incl_vat)

    if (nextValue === normalizedCurrent) {
      return
    }

    handleFormChange('sale_price_incl_vat', nextValue)
  }

  async function handleCreateDishCategory() {
    if (isReadOnlyModal) {
      return
    }

    const name = newCategoryName.trim()
    if (!name) {
      setErrorMessage('Vul eerst een categorienaam in.')
      return
    }

    setErrorMessage('')
    try {
      const created = await apiClient.createDishCategory({ name })
      await loadDishCategories()
      setFormData((prev) => ({
        ...prev,
        category_id: String(created.id),
        subcategory_id: ''
      }))
      setShowNewCategoryInput(false)
      setNewCategoryName('')
      setShowNewSubcategoryInput(false)
      setNewSubcategoryName('')
      setModalMessage('Categorie aangemaakt.')
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Categorie aanmaken mislukt.')
    }
  }

  async function handleCreateDishSubcategory() {
    if (isReadOnlyModal) {
      return
    }

    if (!formData.category_id) {
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
      const created = await apiClient.createDishSubcategory(formData.category_id, { name })
      await loadDishCategories()
      setFormData((prev) => ({
        ...prev,
        subcategory_id: String(created.id)
      }))
      setShowNewSubcategoryInput(false)
      setNewSubcategoryName('')
      setModalMessage('Subcategorie aangemaakt.')
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Subcategorie aanmaken mislukt.')
    }
  }

  async function handleDishPhotoUpload(event) {
    if (isReadOnlyModal) {
      return
    }

    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (!file) {
      return
    }

    if (!selectedDishId) {
      setErrorMessage('Sla eerst het gerecht op voordat je een foto uploadt.')
      return
    }

    setErrorMessage('')
    try {
      const updatedDish = await apiClient.uploadDishPhoto(selectedDishId, file)
      setFormData((prev) => ({ ...prev, photo_path: updatedDish.photo_path || '' }))
      setPhotoCacheBuster(Date.now())
      await loadDishes()
      await loadArchivedDishes()
      await loadDetail(selectedDishId)
      setModalMessage('Foto geüpload.')
    } catch {
      setErrorMessage('Foto uploaden mislukt.')
    }
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
    if (!canManageSupervisorDishActions) {
      setErrorMessage('Je hebt geen rechten om dit gerecht te archiveren.')
      return
    }

    const archiveCheck = await apiClient.archiveDishCheck(dishId)
    if (!archiveCheck?.can_archive) {
      setErrorMessage(archiveCheck?.reason || 'Archiveren mislukt.')
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
    } catch (error) {
      setErrorMessage(error?.message || 'Archiveren mislukt.')
    }
  }

  async function handleArchiveDish() {
    await handleArchiveById(selectedDishId, { closeModalAfter: true })
  }

  async function handleRestoreById(dishId) {
    if (!dishId) {
      return
    }
    if (!canManageSupervisorDishActions) {
      setErrorMessage('Je hebt geen rechten om dit gerecht te herstellen.')
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
    if (!canManageSupervisorDishActions) {
      setErrorMessage('Je hebt geen rechten om dit gerecht te verwijderen.')
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
    if (!canManageSupervisorDishActions) {
      setErrorMessage('Je hebt geen rechten om dit gerecht te verwijderen.')
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
    if (!canManageSupervisorDishActions) {
      setErrorMessage('Je hebt geen rechten om dit gerecht te dupliceren.')
      return
    }
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

  async function handlePrintRecipe() {
    if (!selectedDishId) {
      setErrorMessage('Sla eerst het gerecht op.')
      return
    }

    try {
      const payload = await apiClient.getDishPrint(selectedDishId)
      const chefName = getCurrentChefName()
      const printDateTime = new Date().toLocaleString('nl-NL')
      const categoryName = getCategoryNameById(payload.category_id)
      const subcategoryName = getSubcategoryNameById(payload.subcategory_id)
      const photoUrl = resolvePhotoUrl(payload.photo_path)

      const lines = (payload.recipe_lines || [])
        .map(
          (line) =>
            `<tr>
              <td>${escapeHtml(line.item_name || '-')}</td>
              <td>${escapeHtml(line.item_brand || '-')}</td>
              <td>${escapeHtml(line.quantity ?? '-')}</td>
              <td>${escapeHtml(line.unit || '-')}</td>
              <td>${escapeHtml(formatCurrency(line.line_cost))}</td>
              <td>${escapeHtml(formatPercent(line.line_cost_share_percent))}</td>
            </tr>`
        )
        .join('')

      const stepsHtml = (payload.recipe_steps || [])
        .map((step) => `<li>${escapeHtml(step.instruction || '')}</li>`)
        .join('')

      const photoHtml = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Gerechtfoto" />` : ''
      const photoBlockHtml = photoHtml ? `<div class="photo">${photoHtml}</div>` : ''

      const printMarkup = `
        <html>
          <head>
            <title>Keukenrecept - ${escapeHtml(payload.name || '')}</title>
            <style>
              @page { size: A4; margin: 14mm; }
              body { font-family: Arial, sans-serif; color: #111; margin: 0; }
              .sheet { width: 100%; }
              .header {
                display: grid;
                grid-template-columns: 1fr 130px;
                gap: 14px;
                align-items: start;
                margin-bottom: 14px;
              }
              .title { font-size: 30px; font-weight: 700; margin: 0 0 8px; line-height: 1.1; }
              .subtitle { font-size: 15px; margin: 0 0 10px; color: #333; }
              .meta-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 4px 14px;
                font-size: 12px;
              }
              .photo {
                width: 130px;
                height: 95px;
                border: 1px solid #222;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
              }
              .photo img { width: 100%; height: 100%; object-fit: cover; }
              h2 { margin: 16px 0 8px; font-size: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
              th, td { border: 1px solid #d0d0d0; padding: 6px; text-align: left; vertical-align: top; }
              th { background: #f5f5f5; font-weight: 600; }
              ol { margin: 8px 0 0 20px; padding: 0; }
              li { margin-bottom: 4px; line-height: 1.4; }
              .note-block {
                margin-top: 14px;
                padding-top: 8px;
                border-top: 1px solid #ccc;
                font-size: 12px;
                line-height: 1.5;
              }
              .print-fallback-wrap {
                margin: 0 0 10px;
                text-align: right;
              }
              .print-fallback-btn {
                border: 1px solid #222;
                background: #fff;
                color: #111;
                font-size: 12px;
                padding: 5px 8px;
                cursor: pointer;
              }
              @media print {
                .print-fallback-wrap { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="sheet">
              <div class="print-fallback-wrap">
                <button id="manual-print-btn" class="print-fallback-btn" type="button">
                  Klik hier als printen niet automatisch start
                </button>
              </div>
              <div class="header">
                <div>
                  <h1 class="title">${escapeHtml(payload.name || '')}</h1>
                  ${
                    payload.menu_name
                      ? `<div class="subtitle">${escapeHtml(payload.menu_name)}</div>`
                      : ''
                  }
                  <div class="meta-grid">
                    <div><strong>Categorie:</strong> ${escapeHtml(categoryName)}</div>
                    <div><strong>Subcategorie:</strong> ${escapeHtml(subcategoryName)}</div>
                    <div><strong>Chef:</strong> ${escapeHtml(chefName)}</div>
                    <div><strong>Printdatum:</strong> ${escapeHtml(printDateTime)}</div>
                    <div><strong>Kostprijs gerecht:</strong> ${escapeHtml(
                      formatCurrency(payload.estimated_cost_total)
                    )}</div>
                    <div><strong>Verkoopprijs incl btw:</strong> ${escapeHtml(
                      formatCurrency(payload.sale_price_incl_vat)
                    )}</div>
                    <div><strong>Verkoopprijs excl btw:</strong> ${escapeHtml(
                      formatCurrency(payload.sale_price_excl_vat)
                    )}</div>
                    <div><strong>Brutowinst:</strong> ${escapeHtml(
                      formatCurrency(payload.gross_profit)
                    )}</div>
                    <div><strong>Brutowinst %:</strong> ${escapeHtml(
                      formatPercent(payload.gross_margin_percent)
                    )}</div>
                    <div><strong>Foodcost %:</strong> ${escapeHtml(
                      formatPercent(payload.food_cost_percent)
                    )}</div>
                  </div>
                </div>
              ${photoBlockHtml}
            </div>
              <h2>Ingrediënten / receptregels</h2>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Merk</th>
                    <th>Hoeveelheid</th>
                    <th>Eenheid</th>
                    <th>Regelprijs</th>
                    <th>% van kostprijs</th>
                  </tr>
                </thead>
                <tbody>${lines || '<tr><td colspan="6">Geen receptregels</td></tr>'}</tbody>
              </table>
              <h2>Receptstappen</h2>
              <ol>${stepsHtml || '<li>-</li>'}</ol>
              <div class="note-block">
                <strong>Allergenen:</strong> ${escapeHtml(
                  payload.allergens_total || 'Geen brondata allergenen beschikbaar'
                )}
              </div>
              <div class="note-block">
                <strong>Keukenopmerking:</strong> ${escapeHtml(payload.kitchen_note || '-')}
              </div>
              <div class="note-block">
                <strong>Opmaakadvies:</strong> ${escapeHtml(payload.plating_advice || '-')}
              </div>
            </div>
            ${getPrintBootstrapScript()}
          </body>
        </html>
      `

      const didStartPrint = await printHtml(printMarkup, { windowFeatures: 'width=900,height=700' })
      if (!didStartPrint) {
        setErrorMessage('Printvenster kon niet worden geopend.')
      }
    } catch {
      setErrorMessage('Printen mislukt.')
    }
  }

  const allergensText = detail?.allergens_total || 'Geen brondata allergenen beschikbaar'
  const resolvedPhotoPreviewUrl = resolvePhotoUrl(detail?.photo_path || formData.photo_path)
  const photoPreviewUrl = resolvedPhotoPreviewUrl
    ? `${resolvedPhotoPreviewUrl}?v=${photoCacheBuster}`
    : ''

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
            {filterSubcategoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {canCreateDishes ? (
            <button type="button" className="sfp-new-btn" onClick={openNewModal}>
              Nieuw gerecht
            </button>
          ) : null}
        </div>

        {pageMessage ? <p className="form-info inline-message">{pageMessage}</p> : null}
        {errorMessage ? <div style={{ color: 'red' }}>{errorMessage}</div> : null}

        {visibleDishes.length === 0 ? (
          <p>Nog geen gerechten gevonden.</p>
        ) : (
          <div className="table-scroll">
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th className="text-left">Naam</th>
                  <th className="text-center">Categorie</th>
                  <th className="text-center">Subcategorie</th>
                  <th className="text-center" style={{ minWidth: '95px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    Kostprijs
                  </th>
                  <th className="text-center" style={{ minWidth: '120px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    Verkoopprijs incl BTW
                  </th>
                  <th className="text-center" style={{ minWidth: '90px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    Marge %
                  </th>
                  <th className="text-left">Allergenen</th>
                  <th className="text-center">Actie</th>
                </tr>
              </thead>
              <tbody>
                {visibleDishes.map((item) => (
                  <tr key={item.id}>
                    <td className="text-left">{item.name}</td>
                    <td className="text-center">{getCategoryNameById(item.category_id)}</td>
                    <td className="text-center">{getSubcategoryNameById(item.subcategory_id)}</td>
                    <td className="text-right" style={{ minWidth: '95px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatCurrency(item.estimated_cost_total)}
                    </td>
                    <td className="text-right" style={{ minWidth: '120px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatCurrency(item.sale_price_incl_vat)}
                    </td>
                    <td className="text-right" style={{ minWidth: '90px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatPercent(item.gross_margin_percent)}
                    </td>
                    <td className="text-left">{item.allergens_total || 'Geen brondata allergenen beschikbaar'}</td>
                    <td className="text-center" style={uiStyles.actionCell}>
                      <div style={uiStyles.rowActionsWrap} ref={openActionsMenuId === item.id ? actionsMenuRef : null}>
                        {canViewDishes ? (
                          <button
                            type="button"
                            className="table-action-btn"
                            style={uiStyles.rowActionButton}
                            onClick={() => openEditModal(item, viewMode)}
                          >
                            Openen
                          </button>
                        ) : null}
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
                                <>
                                    {hasPermission(permissions, 'gerechten', 'dupliceren', role) ? (
                                    <button
                                      type="button"
                                      style={uiStyles.rowMenuItem}
                                      onClick={() => handleDuplicateDish(item)}
                                    >
                                      ⧉ Dupliceren
                                    </button>
                                    ) : null}
                                    {hasPermission(permissions, 'gerechten', 'archiveren', role) ? (
                                    <button
                                      type="button"
                                      style={uiStyles.rowMenuItem}
                                      onClick={() => handleArchiveById(item.id)}
                                    >
                                      <span style={{ color: '#d97706' }}>🗄</span> Archiveren
                                    </button>
                                    ) : null}
                                  </>
                              </>
                            ) : (
                              <>
                                  <>
                                    {!isLoadingPermissions && hasPermission(permissions, 'gerechten', 'herstellen', role) ? (
                                    <button
                                      type="button"
                                      style={uiStyles.rowMenuItem}
                                      onClick={() => handleRestoreById(item.id)}
                                    >
                                      ♻️ Herstellen
                                    </button>
                                    ) : null}
                                    {hasPermission(permissions, 'gerechten', 'verwijderen', role) ? (
                                      <button
                                        type="button"
                                        style={uiStyles.rowMenuItem}
                                        onClick={() => handleDeleteById(item.id)}
                                      >
                                        🗑 Verwijderen
                                      </button>
                                    ) : null}
                                  </>
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
                    Foto
                    {photoPreviewUrl ? (
                      <div style={uiStyles.photoPreviewWrap}>
                        <img src={photoPreviewUrl} alt="Gerechtfoto preview" style={uiStyles.photoPreview} />
                      </div>
                    ) : (
                      <div style={uiStyles.photoPlaceholder}>Nog geen foto geüpload</div>
                    )}
                    {canEditDishes ? (
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isReadOnlyModal}
                        onChange={handleDishPhotoUpload}
                      />
                    ) : null}
                  </label>
                  <div className="modal-grid one-col calm-grid">
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
                      Menukaartnaam
                      <input
                        type="text"
                        value={formData.menu_name}
                        readOnly={isReadOnlyModal}
                        onChange={(event) => handleFormChange('menu_name', event.target.value)}
                      />
                    </label>
                    <label>
                      Menukaartomschrijving
                      <textarea
                        value={formData.menu_description}
                        readOnly={isReadOnlyModal}
                        onChange={(event) => handleFormChange('menu_description', event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="modal-section">
                <h4>Indeling</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Categorie
                    <select
                      value={formData.category_id}
                      disabled={isReadOnlyModal}
                      onChange={(event) => handleCategoryChange(event.target.value)}
                    >
                      <option value="">Kies een categorie</option>
                      {modalCategoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="table-action-btn"
                      disabled={isReadOnlyModal}
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
                          readOnly={isReadOnlyModal}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                        />
                        <button
                          type="button"
                          onClick={handleCreateDishCategory}
                          disabled={isReadOnlyModal}
                        >
                          Opslaan
                        </button>
                      </div>
                    ) : null}
                  </label>
                  <label>
                    Subcategorie
                    <select
                      value={formData.subcategory_id}
                      onChange={(event) => handleFormChange('subcategory_id', event.target.value)}
                      disabled={!formData.category_id || isReadOnlyModal}
                    >
                      <option value="">Kies een subcategorie</option>
                      {modalSubcategoryOptions.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.id}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="table-action-btn"
                      onClick={() => setShowNewSubcategoryInput((prev) => !prev)}
                      disabled={!formData.category_id || isReadOnlyModal}
                    >
                      Nieuwe subcategorie
                    </button>
                    {showNewSubcategoryInput ? (
                      <div className="recipe-line-inline">
                        <input
                          type="text"
                          placeholder="Nieuwe subcategorie"
                          value={newSubcategoryName}
                          readOnly={isReadOnlyModal}
                          onChange={(event) => setNewSubcategoryName(event.target.value)}
                        />
                        <button
                          type="button"
                          onClick={handleCreateDishSubcategory}
                          disabled={!formData.category_id || isReadOnlyModal}
                        >
                          Opslaan
                        </button>
                      </div>
                    ) : null}
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Receptuur</h4>
                <div className="modal-grid one-col calm-grid">
                  <div>
                    <h5>Receptregels</h5>
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
                                  {formatCalculationContentLabel(ingredient)
                                    ? ` | Inhoud: ${formatCalculationContentLabel(ingredient)}`
                                    : ''}
                                  {formatPackageVolumeLabel(ingredient)
                                    ? ` | Volume: ${formatPackageVolumeLabel(ingredient)}`
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
                                    ) : !isReadOnlyModal && canEditDishes ? (
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
                  </div>

                  <div>
                    <h5>Receptstappen</h5>
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
                  </div>
                </div>
              </section>

              <section className="modal-section">
                <h4>Calculatie</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    BTW %
                    <select
                      value={formData.vat_rate}
                      disabled={isReadOnlyModal}
                      onChange={(event) => handleFormChange('vat_rate', event.target.value)}
                    >
                      <option value="9">9</option>
                      <option value="21">21</option>
                      <option value="0">0</option>
                    </select>
                  </label>
                  <label>
                    Kostprijs gerecht
                    <input type="text" value={formatCurrency(detail?.estimated_cost_total)} readOnly />
                  </label>
                  <label>
                    Advies verkoopprijs incl BTW
                    <input type="text" value={formatCurrency(detail?.suggested_price_incl_vat)} readOnly />
                  </label>
                  <label>
                    Definitieve verkoopprijs incl BTW
                    <input
                      type="number"
                      step="any"
                      value={salePriceInput}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => setSalePriceInput(event.target.value)}
                      onBlur={commitSalePriceInput}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitSalePriceInput()
                        }
                      }}
                    />
                  </label>
                  <label>
                    Advies verkoopprijs excl BTW
                    <input type="text" value={formatCurrency(detail?.suggested_price_excl_vat)} readOnly />
                  </label>
                  <label>
                    Verkoopprijs excl BTW
                    <input
                      type="text"
                      value={formatCurrency(
                        liveCalculation?.sale_price_excl_vat ?? detail?.sale_price_excl_vat
                      )}
                      readOnly
                    />
                  </label>
                  <label>
                    Brutowinst
                    <input
                      type="text"
                      value={formatCurrency(
                        liveCalculation?.gross_profit ?? detail?.gross_profit
                      )}
                      readOnly
                    />
                  </label>
                  <label>
                    Brutowinst %
                    <input
                      type="text"
                      value={formatPercent(
                        liveCalculation?.gross_margin_percent ?? detail?.gross_margin_percent
                      )}
                      readOnly
                    />
                  </label>
                  <label>
                    Foodcost %
                    <input
                      type="text"
                      value={formatPercent(
                        liveCalculation?.food_cost_percent ?? detail?.food_cost_percent
                      )}
                      readOnly
                    />
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Notities</h4>
                <div className="modal-grid one-col calm-grid">
                  <label>
                    Keukenopmerking
                    <textarea
                      value={formData.kitchen_note}
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('kitchen_note', event.target.value)}
                    />
                  </label>
                  <label>
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
                <h4>Allergenen</h4>
                <p>{allergensText}</p>
              </section>
            </div>

            <div className="modal-actions sfp-actions">
              <div style={uiStyles.modalActionsRight}>
                {selectedDishId ? (
                  <button type="button" className="table-action-btn" onClick={handlePrintRecipe}>
                    Print keukenrecept
                  </button>
                ) : null}
                {!isSelectedArchived ? (
                  <>
                    {selectedDishId && hasPermission(permissions, 'gerechten', 'archiveren', role) ? (
                      <button type="button" className="table-action-btn" onClick={handleArchiveDish}>
                        Archiveren
                      </button>
                    ) : null}
                    {canEditDishes ? (
                      <button type="button" className="primary-btn" onClick={handleSaveDish} disabled={isSaving}>
                        {isSaving ? 'Opslaan...' : 'Opslaan'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    {!isLoadingPermissions && hasPermission(permissions, 'gerechten', 'herstellen', role) ? (
                      <>
                        <button type="button" className="primary-btn" onClick={handleRestoreDish}>
                          Herstellen
                        </button>
                        {hasPermission(permissions, 'gerechten', 'verwijderen', role) ? (
                          <button type="button" className="table-action-btn" onClick={handleDeleteDish}>
                            Verwijderen
                          </button>
                        ) : null}
                      </>
                    ) : null}
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
