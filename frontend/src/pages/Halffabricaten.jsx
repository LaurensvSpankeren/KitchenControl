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
const PRINT_BASE_URL_RAW =
  import.meta.env.VITE_PRINT_BASE_URL || 'https://kitchencontrol-frontend.onrender.com'

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return 'https://kitchencontrol-frontend.onrender.com'
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/$/, '')
  }
  return `https://${trimmed.replace(/\/$/, '')}`
}

const PRINT_BASE_URL = normalizeBaseUrl(PRINT_BASE_URL_RAW)

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

function formatYield(value, unit) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  return `${value} ${unit || ''}`.trim()
}

function formatPrintNumber(value, unit) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return '-'
  }
  const normalizedUnit = normalizeUnit(unit)
  const fractionDigitsByUnit = {
    gram: 0,
    ml: 0,
    stuk: 0,
    kg: 2,
    liter: 2
  }
  const maximumFractionDigits = fractionDigitsByUnit[normalizedUnit] ?? 2
  return number.toLocaleString('nl-NL', {
    useGrouping: false,
    maximumFractionDigits
  })
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

function buildSemiFinishedDetailUrl(id) {
  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : PRINT_BASE_URL
  if (!id) {
    return `${baseUrl}/halffabricaten`
  }
  return `${baseUrl}/halffabricaten?id=${id}`
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
  const [permissions, setPermissions] = useState(defaultPermissions)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [products, setProducts] = useState([])
  const [archivedProducts, setArchivedProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [semiFinishedCategories, setSemiFinishedCategories] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [subcategoryFilter, setSubcategoryFilter] = useState('')
  const [viewMode, setViewMode] = useState('active')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [steps, setSteps] = useState(EMPTY_STEPS)
  const [detail, setDetail] = useState(null)

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
  const [isEditingPhotoUrl, setIsEditingPhotoUrl] = useState(true)
  const [isSelectedArchived, setIsSelectedArchived] = useState(false)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewSubcategoryInput, setShowNewSubcategoryInput] = useState(false)
  const [newSubcategoryName, setNewSubcategoryName] = useState('')

  const [pageMessage, setPageMessage] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false)
  const [isPurchaseListPrintModalOpen, setIsPurchaseListPrintModalOpen] = useState(false)
  const [purchaseListTargetQuantity, setPurchaseListTargetQuantity] = useState('')
  const [purchaseListTargetUnit, setPurchaseListTargetUnit] = useState('')
  const [purchaseListPrintError, setPurchaseListPrintError] = useState('')
  const [isGeneratingPurchaseListPrint, setIsGeneratingPurchaseListPrint] = useState(false)
  const [labelProductionDate, setLabelProductionDate] = useState(formatDateForInput(new Date()))
  const [labelUseFridge, setLabelUseFridge] = useState(true)
  const [labelUseFreezer, setLabelUseFreezer] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalDirty, setIsModalDirty] = useState(false)
  const [openActionsMenuId, setOpenActionsMenuId] = useState(null)
  const [shouldFocusNameAfterDuplicate, setShouldFocusNameAfterDuplicate] = useState(false)
  const actionsMenuRef = useRef(null)
  const nameInputRef = useRef(null)
  const hasHandledDeepLinkRef = useRef(false)
  const isReadOnlyModal = isSelectedArchived
  const currentUser = getCurrentUser()
  const role = currentUser?.role
  const currentUserRole = useMemo(() => getCurrentUserRole(), [])
  const canManageSupervisorProductActions = currentUserRole === 'Supervisor'
  const canViewProducts = !isLoadingPermissions && hasPermission(permissions, 'halffabricaten', 'bekijken', role)
  const canCreateProducts = !isLoadingPermissions && hasPermission(permissions, 'halffabricaten', 'aanmaken', role)
  const canEditProducts = !isLoadingPermissions && hasPermission(permissions, 'halffabricaten', 'wijzigen', role)
  const uiStyles = {
    viewModeSwitch: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' },
    photoPreviewWrap: { marginTop: '0.5rem' },
    photoLink: { display: 'block', wordBreak: 'break-all', marginBottom: '0.5rem' },
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
    labelForm: { display: 'grid', gap: '0.75rem' },
    labelFieldRow: {
      display: 'grid',
      gridTemplateColumns: '140px minmax(0, 1fr)',
      alignItems: 'center',
      gap: '0.75rem'
    },
    labelFieldCaption: { fontWeight: 600, color: '#111827' },
    labelCheckboxRow: {
      display: 'grid',
      gridTemplateColumns: '140px minmax(0, 1fr)',
      alignItems: 'center',
      gap: '0.75rem'
    },
    labelCheckboxWrap: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
    labelActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', flexWrap: 'wrap' },
    modalActionsLeft: { display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginRight: 'auto' },
    modalActionsRight: { display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }
  }

  async function loadProducts() {
    try {
      const data = await apiClient.getSemiFinishedProducts()
      setProducts(Array.isArray(data) ? data.filter((item) => !item?.is_archived) : [])
    } catch {
      setProducts([])
    }
  }

  async function loadArchivedProducts() {
    try {
      const data = await apiClient.getArchivedSemiFinishedProducts()
      setArchivedProducts(Array.isArray(data) ? data : [])
    } catch {
      setArchivedProducts([])
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
    loadProducts()
    loadArchivedProducts()
    loadIngredients()
    loadSemiFinishedCategories()
  }, [])

  useEffect(() => {
    if (hasHandledDeepLinkRef.current || typeof window === 'undefined') {
      return
    }

    const searchParams = new URLSearchParams(window.location.search)
    const idParam = searchParams.get('id')
    if (!idParam) {
      hasHandledDeepLinkRef.current = true
      return
    }

    const targetId = Number(idParam)
    if (!Number.isFinite(targetId)) {
      hasHandledDeepLinkRef.current = true
      return
    }

    const match =
      products.find((item) => Number(item.id) === targetId) ||
      archivedProducts.find((item) => Number(item.id) === targetId)

    if (!match) {
      return
    }

    hasHandledDeepLinkRef.current = true
    const sourceView = match.is_archived ? 'archived' : 'active'
    void openEditModal(match, sourceView)
  }, [products, archivedProducts])

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

  const filteredArchivedProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return archivedProducts
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
  }, [archivedProducts, searchTerm, categoryFilter, subcategoryFilter])

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
    return products
      .filter((item) => !item?.is_archived)
      .filter((item) => item.id !== selectedProductId)
      .filter((item) => String(item.name || '').toLowerCase().includes(term))
      .slice(0, 25)
  }, [semiFinishedSearch, products, selectedProductId])

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
    setSemiFinishedSearch('')
    setSelectedSemiFinishedRecipe(null)
    setSemiFinishedRecipeQuantity('')
    setSemiFinishedRecipeUnit('gram')
    setEditingLineId(null)
    setEditingLineQuantity('')
    setEditingLineUnit('')
    setIsEditingPhotoUrl(true)
    setIsSelectedArchived(false)
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setShowNewSubcategoryInput(false)
    setNewSubcategoryName('')
    setModalMessage('')
    setErrorMessage('')
    setIsModalDirty(false)
    setIsModalOpen(true)
  }

  async function openEditModal(product, sourceView = 'active') {
    setSelectedProductId(product.id)
    setFormData(mapProductToForm(product))
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
    setIsEditingPhotoUrl(!String(product.photo_url || '').trim())
    setIsSelectedArchived(sourceView === 'archived' || !!product.is_archived)
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setShowNewSubcategoryInput(false)
    setNewSubcategoryName('')
    setModalMessage('')
    setErrorMessage('')
    setIsModalDirty(false)
    setIsModalOpen(true)
    await loadDetail(product.id)
  }

  async function handleArchiveProduct() {
    await handleArchiveById(selectedProductId, { closeModalAfter: true })
  }

  async function handleRestoreProduct() {
    if (!selectedProductId) {
      return
    }
    if (!canManageSupervisorProductActions) {
      setErrorMessage('Je hebt geen rechten om dit halffabricaat te herstellen.')
      return
    }

    try {
      await apiClient.restoreSemiFinishedProduct(selectedProductId)
      await loadProducts()
      await loadArchivedProducts()
      setIsModalOpen(false)
      setViewMode('active')
      setPageMessage('Halffabricaat hersteld uit archief.')
    } catch {
      setErrorMessage('Herstellen mislukt.')
    }
  }

  async function handleRestoreById(productId) {
    if (!productId) {
      return
    }
    if (!canManageSupervisorProductActions) {
      setErrorMessage('Je hebt geen rechten om dit halffabricaat te herstellen.')
      return
    }

    try {
      await apiClient.restoreSemiFinishedProduct(productId)
      await loadProducts()
      await loadArchivedProducts()
      setOpenActionsMenuId(null)
      setPageMessage('Halffabricaat hersteld uit archief.')
    } catch {
      setErrorMessage('Herstellen mislukt.')
    }
  }

  async function handleDeleteProduct() {
    if (!selectedProductId || !isSelectedArchived) {
      return
    }
    if (!canManageSupervisorProductActions) {
      setErrorMessage('Je hebt geen rechten om dit halffabricaat te verwijderen.')
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je dit halffabricaat definitief wilt verwijderen?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteSemiFinishedProduct(selectedProductId)
      await loadArchivedProducts()
      setIsModalOpen(false)
      setPageMessage('Halffabricaat verwijderd.')
    } catch {
      setErrorMessage('Verwijderen mislukt.')
    }
  }

  async function handleDeleteById(productId) {
    if (!productId) {
      return
    }
    if (!canManageSupervisorProductActions) {
      setErrorMessage('Je hebt geen rechten om dit halffabricaat te verwijderen.')
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je dit halffabricaat definitief wilt verwijderen?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteSemiFinishedProduct(productId)
      await loadArchivedProducts()
      setOpenActionsMenuId(null)
      setPageMessage('Halffabricaat verwijderd.')
    } catch {
      setErrorMessage('Verwijderen mislukt.')
    }
  }

  async function handleArchiveById(productId, options = {}) {
    if (!productId) {
      return
    }
    if (!canManageSupervisorProductActions) {
      setErrorMessage('Je hebt geen rechten om dit halffabricaat te archiveren.')
      return
    }

    const archiveCheck = await apiClient.archiveSemiFinishedProductCheck(productId)
    if (!archiveCheck?.can_archive) {
      setErrorMessage(archiveCheck?.reason || 'Archiveren mislukt.')
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je dit halffabricaat wilt archiveren?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.archiveSemiFinishedProduct(productId)
      await loadProducts()
      await loadArchivedProducts()
      setOpenActionsMenuId(null)
      if (options.closeModalAfter) {
        setIsModalOpen(false)
        setViewMode('active')
      }
      setPageMessage('Halffabricaat gearchiveerd.')
    } catch {
      setErrorMessage('Archiveren mislukt.')
    }
  }

  async function handleDuplicateProduct(item) {
    if (!canManageSupervisorProductActions) {
      setErrorMessage('Je hebt geen rechten om dit halffabricaat te dupliceren.')
      return
    }
    try {
      const duplicate = await apiClient.duplicateSemiFinishedProduct(item.id)
      await loadProducts()
      await loadArchivedProducts()
      setOpenActionsMenuId(null)
      setViewMode('active')
      setPageMessage('Halffabricaat gedupliceerd.')
      setShouldFocusNameAfterDuplicate(true)
      await openEditModal(duplicate, 'active')
    } catch {
      setErrorMessage('Dupliceren mislukt.')
    }
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
      category: value,
      subcategory: ''
    }))
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
    if (!selectedProductId || isReadOnlyModal) {
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
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Receptregel bijwerken mislukt.')
    }
  }

  async function handleDeleteLine(line) {
    if (!selectedProductId || isReadOnlyModal) {
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
      setIsModalDirty(true)
    } catch {
      setErrorMessage('Receptregel verwijderen mislukt.')
    }
  }

  async function handleSaveProduct() {
    if (isReadOnlyModal) {
      return
    }
    const name = formData.name.trim()
    const finalYieldAmount = Number(formData.final_yield_amount)
    const hasFinalYieldAmount =
      formData.final_yield_amount !== '' && !Number.isNaN(finalYieldAmount) && finalYieldAmount > 0
    if (!name) {
      setErrorMessage('Naam is verplicht.')
      return
    }
    if (!hasFinalYieldAmount) {
      const confirmed = window.confirm(
        'Let op: zonder eindgewicht of eindinhoud kun je dit halffabricaat nog niet gebruiken in gerechten. Weet je zeker dat je nu al wilt opslaan?'
      )
      if (!confirmed) {
        return
      }
    }
    if (hasFinalYieldAmount && !formData.final_yield_unit.trim()) {
      setErrorMessage('Kies eerst een eenheid voor het eindproduct.')
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
      await loadArchivedProducts()
      await loadDetail(productId)
      setModalMessage('Halffabricaat opgeslagen.')
      setPageMessage('Halffabricaat opgeslagen.')
      setIsModalDirty(false)
    } catch {
      setErrorMessage('Opslaan mislukt.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddIngredientLine() {
    if (isReadOnlyModal) {
      return
    }
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
      await loadArchivedProducts()
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
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op voordat je ingrediënten toevoegt.')
      return
    }
    if (!selectedSemiFinishedRecipe) {
      setErrorMessage('Kies eerst een halffabricaat.')
      return
    }
    if (selectedSemiFinishedRecipe.id === selectedProductId) {
      setErrorMessage('Je kunt een halffabricaat niet aan zichzelf toevoegen.')
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
      await apiClient.addSemiFinishedProductRecipeLine(selectedProductId, {
        item_type: 'semi_finished_product',
        item_id: selectedSemiFinishedRecipe.id,
        quantity,
        unit: semiFinishedRecipeUnit.trim()
      })
      await loadDetail(selectedProductId)
      await loadProducts()
      await loadArchivedProducts()
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

  async function handleCreateCategory() {
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
    if (isReadOnlyModal) {
      return
    }
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
      setIsModalDirty(true)
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

  async function openLabelModalForProduct(product, sourceView = 'active') {
    setSelectedProductId(product.id)
    setFormData(mapProductToForm(product))
    setIsSelectedArchived(sourceView === 'archived' || !!product.is_archived)
    setLabelProductionDate(formatDateForInput(new Date()))
    setLabelUseFridge(true)
    setLabelUseFreezer(false)
    setErrorMessage('')
    setModalMessage('')
    setOpenActionsMenuId(null)
    setIsLabelModalOpen(true)
    await loadDetail(product.id)
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

    const allergensLabel = detail?.allergens_total || 'Geen brondata allergenen beschikbaar'
    const qrTargetUrl = buildSemiFinishedDetailUrl(selectedProductId)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(
      qrTargetUrl
    )}`

    const printMarkup = `
      <html>
        <head>
          <title>Dagetiket - ${productName}</title>
          <style>
            @page { size: 89mm 36mm; margin: 0; }
            html, body {
              width: 89mm;
              height: 36mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
              background: #fff;
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-fallback-wrap { padding: 3mm 2mm 1mm; text-align: center; }
            .print-fallback-btn {
              border: 1px solid #222;
              background: #fff;
              color: #111;
              font-size: 10px;
              padding: 1.5mm 2.5mm;
              cursor: pointer;
            }
            .label {
              width: 89mm;
              height: 36mm;
              border: 1px solid #000;
              box-sizing: border-box;
              padding: 1.8mm 2.6mm 1.8mm 2.2mm;
              display: grid;
              grid-template-columns: minmax(0, 1fr) 17.2mm;
              column-gap: 2mm;
              align-items: stretch;
              background: #fff;
              overflow: hidden;
            }
            .content {
              min-width: 0;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }
            .title {
              font-size: 13.5px;
              font-weight: 700;
              margin: 0 0 1mm;
              text-transform: uppercase;
              line-height: 1.1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .line {
              font-size: 10.5px;
              margin: 0 0 0.7mm;
              line-height: 1.18;
            }
            .allergens {
              font-size: 8.6px;
              line-height: 1.18;
              margin-top: 0.6mm;
              max-height: 8.4mm;
              overflow: hidden;
            }
            .qr-wrap {
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
              padding: 0.4mm 0.8mm 0.4mm 0.2mm;
              overflow: hidden;
            }
            .qr-wrap img {
              display: block;
              width: 16.2mm;
              height: 16.2mm;
              object-fit: contain;
            }
            @media print {
              .print-fallback-wrap { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-fallback-wrap">
            <button id="manual-print-btn" class="print-fallback-btn" type="button">
              Klik hier als printen niet automatisch start
            </button>
          </div>
          <div class="label">
            <div class="content">
              <div class="title">${escapeHtml(productName || '-')}</div>
              <div class="line"><strong>Productiedatum:</strong> ${escapeHtml(
                formatDateNl(labelProductionDate)
              )}</div>
              ${
                labelUseFridge
                  ? `<div class="line"><strong>Koelkast t/m:</strong> ${escapeHtml(formatDateNl(fridgeDate))}</div>`
                  : ''
              }
              ${
                labelUseFreezer
                  ? `<div class="line"><strong>Vriezer t/m:</strong> ${escapeHtml(formatDateNl(freezerDate))}</div>`
                  : ''
              }
              <div class="allergens"><strong>Allergenen:</strong> ${escapeHtml(allergensLabel)}</div>
            </div>
            <div class="qr-wrap">
              <img src="${qrCodeUrl}" alt="QR code" />
            </div>
          </div>
          ${getPrintBootstrapScript()}
        </body>
      </html>
    `

    setIsLabelModalOpen(false)
    void printHtml(printMarkup, {
      windowFeatures: 'width=420,height=620',
      waitForImages: true
    }).then((didStartPrint) => {
      if (!didStartPrint) {
        setErrorMessage('Printvenster kon niet worden geopend.')
      }
    })
  }

  async function handlePrintRecipe() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op.')
      return
    }

    try {
      const payload = detail || (await apiClient.getSemiFinishedProductDetail(selectedProductId))
      const chefName = getCurrentChefName()
      const printDateTime = new Date().toLocaleString('nl-NL')

      const lines = (payload.recipe_lines || [])
        .map(
          (line) =>
            `<tr>
              <td>${escapeHtml(line.item_name || '-')}</td>
              <td>${escapeHtml(line.item_brand || '-')}</td>
              <td>${escapeHtml(
                ingredients.find((ingredient) => ingredient.id === line.item_id)?.supplier_product_code || '-'
              )}</td>
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
      const photoHtml = payload.photo_url
        ? `<img src="${escapeHtml(payload.photo_url)}" alt="Productfoto" />`
        : ''

      const printMarkup = `
        <html>
          <head>
            <title>Keukenrecept - ${payload.name}</title>
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
              .meta-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 4px 14px;
                font-size: 12px;
              }
              .meta-grid .full { grid-column: 1 / -1; }
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
              .allergens {
                margin-top: 14px;
                padding-top: 8px;
                border-top: 1px solid #ccc;
                font-size: 12px;
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
                  <div class="meta-grid">
                    <div><strong>Categorie:</strong> ${escapeHtml(payload.category || '-')}</div>
                    <div><strong>Subcategorie:</strong> ${escapeHtml(payload.subcategory || '-')}</div>
                    <div><strong>Chef:</strong> ${escapeHtml(chefName)}</div>
                    <div><strong>Printdatum:</strong> ${escapeHtml(printDateTime)}</div>
                    <div><strong>Batch opbrengst:</strong> ${escapeHtml(
                      formatYield(payload.final_yield_amount, payload.final_yield_unit)
                    )}</div>
                    <div><strong>Kostprijs batch:</strong> ${escapeHtml(
                      formatCurrency(payload.estimated_cost_total)
                    )}</div>
                    <div class="full"><strong>Kostprijs per eenheid:</strong> ${escapeHtml(
                      payload.cost_per_final_unit !== null &&
                        payload.cost_per_final_unit !== undefined &&
                        payload.final_yield_unit
                        ? `${formatCurrency(payload.cost_per_final_unit, 4)} per ${payload.final_yield_unit}`
                        : '-'
                    )}</div>
                  </div>
                </div>
                <div class="photo">${photoHtml || ''}</div>
              </div>
              <h2>Ingrediënten</h2>
              <table>
                <thead>
                  <tr>
                    <th>Ingrediënt</th>
                    <th>Merk</th>
                    <th>Artikel</th>
                    <th>Hoeveelheid</th>
                    <th>Eenheid</th>
                    <th>Regelprijs</th>
                    <th>% inslag</th>
                  </tr>
                </thead>
                <tbody>${lines || '<tr><td colspan="7">Geen ingrediëntenregels</td></tr>'}</tbody>
              </table>
              <h2>Receptstappen</h2>
              <ol>${stepsHtml || '<li>-</li>'}</ol>
              <div class="allergens">
                <strong>Allergenen:</strong> ${escapeHtml(
                  payload.allergens_total || 'Geen brondata allergenen beschikbaar'
                )}
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

  function openPurchaseListPrintModal() {
    if (!selectedProductId) {
      setErrorMessage('Sla eerst het halffabricaat op.')
      return
    }

    const hasCurrentDetail = detail?.id === selectedProductId
    const finalYieldAmount = hasCurrentDetail
      ? detail.final_yield_amount
      : formData.final_yield_amount
    const parsedFinalYieldAmount = Number(finalYieldAmount)
    if (
      finalYieldAmount === null ||
      finalYieldAmount === undefined ||
      finalYieldAmount === '' ||
      !Number.isFinite(parsedFinalYieldAmount) ||
      parsedFinalYieldAmount <= 0
    ) {
      setErrorMessage('Vul eerst een eindgewicht in bij dit halffabricaat.')
      return
    }

    setPurchaseListTargetQuantity(String(finalYieldAmount))
    setPurchaseListTargetUnit(
      (hasCurrentDetail ? detail.final_yield_unit : formData.final_yield_unit) || ''
    )
    setPurchaseListPrintError('')
    setErrorMessage('')
    setIsPurchaseListPrintModalOpen(true)
  }

  function closePurchaseListPrintModal() {
    if (isGeneratingPurchaseListPrint) {
      return
    }
    setIsPurchaseListPrintModalOpen(false)
    setPurchaseListPrintError('')
  }

  async function handlePrintRecipeWithPurchaseList(event) {
    event.preventDefault()

    const rawTargetQuantity = String(purchaseListTargetQuantity).trim()
    if (!rawTargetQuantity) {
      setPurchaseListPrintError('Vul een gewenst eindgewicht in.')
      return
    }

    const targetQuantity = Number(rawTargetQuantity)
    if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) {
      setPurchaseListPrintError('Gewenst eindgewicht moet groter zijn dan 0.')
      return
    }
    if (!selectedProductId) {
      setPurchaseListPrintError('Sla eerst het halffabricaat op.')
      return
    }

    setPurchaseListPrintError('')
    setIsGeneratingPurchaseListPrint(true)
    try {
      const payload = await apiClient.getSemiFinishedProductPurchaseListPrintData(
        selectedProductId,
        targetQuantity,
        purchaseListTargetUnit
      )
      const printDateTime = new Date().toLocaleString('nl-NL')

      const recipeLinesHtml = (payload.scaled_recipe_lines || [])
        .map(
          (line) =>
            `<tr>
              <td>${escapeHtml(line.name || '-')}</td>
              <td>${escapeHtml(
                `${formatPrintNumber(line.quantity, line.unit)} ${line.unit || ''}`.trim()
              )}</td>
            </tr>`
        )
        .join('')

      const recipeStepsHtml = (payload.recipe_steps || [])
        .map((step) => `<li>${escapeHtml(step.instruction || '')}</li>`)
        .join('')

      const purchaseBlocksHtml = (payload.purchase_blocks || [])
        .map((block) => {
          const rowsHtml = (block.rows || [])
            .map((row) => {
              const required = `${formatPrintNumber(row.required_quantity, row.required_unit)} ${
                row.required_unit || ''
              }`.trim()
              const order =
                row.order_quantity === null || row.order_quantity === undefined
                  ? row.order_unit_label || 'Niet berekenbaar'
                  : `${formatPrintNumber(row.order_quantity, 'stuk')} ${
                      row.order_unit_label || ''
                    }`.trim()
              return `<tr>
                <td>${escapeHtml(row.name || '-')}</td>
                <td>${escapeHtml(required)}</td>
                <td>${escapeHtml(row.package_label || '-')}</td>
                <td>${escapeHtml(order)}</td>
              </tr>`
            })
            .join('')

          return `<section class="purchase-block">
            <h2>${escapeHtml(block.title || 'Inkoop')}</h2>
            <table>
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th>Benodigd</th>
                  <th>Verpakking</th>
                  <th>Bestellen</th>
                </tr>
              </thead>
              <tbody>${rowsHtml || '<tr><td colspan="4">Geen inkoopregels</td></tr>'}</tbody>
            </table>
          </section>`
        })
        .join('')

      const warningsHtml = (payload.warnings || [])
        .map((warning) => `<li>${escapeHtml(warning)}</li>`)
        .join('')

      const printMarkup = `
        <html>
          <head>
            <title>Recept met inkooplijst - ${escapeHtml(payload.title || '')}</title>
            <style>
              @page { size: A4; margin: 14mm; }
              body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
              .sheet { width: 100%; }
              .header { margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #bdbdbd; }
              h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.15; }
              h2 { margin: 18px 0 7px; font-size: 16px; }
              .meta { color: #444; line-height: 1.5; }
              table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 11px; }
              th, td { border: 1px solid #cfcfcf; padding: 6px; text-align: left; vertical-align: top; }
              th { background: #f2f2f2; font-weight: 700; }
              ol, ul { margin: 7px 0 0 20px; padding: 0; }
              li { margin-bottom: 4px; line-height: 1.4; }
              .purchase-block { break-inside: avoid; page-break-inside: avoid; }
              .warnings {
                margin-top: 18px;
                padding: 9px 11px;
                border: 1px solid #999;
                background: #fafafa;
                break-inside: avoid;
                page-break-inside: avoid;
              }
              .warnings h2 { margin-top: 0; }
            </style>
          </head>
          <body>
            <div class="sheet">
              <div class="header">
                <h1>${escapeHtml(payload.title || '')}</h1>
                <div class="meta">
                  <div><strong>Schaal:</strong> ${escapeHtml(payload.scale_label || '-')}</div>
                  <div><strong>Printdatum:</strong> ${escapeHtml(printDateTime)}</div>
                </div>
              </div>
              <h2>Recept</h2>
              <table>
                <thead>
                  <tr>
                    <th>Regel</th>
                    <th>Hoeveelheid</th>
                  </tr>
                </thead>
                <tbody>${recipeLinesHtml || '<tr><td colspan="2">Geen receptregels</td></tr>'}</tbody>
              </table>
              ${
                recipeStepsHtml
                  ? `<section>
                      <h2>Bereidingswijze</h2>
                      <ol>${recipeStepsHtml}</ol>
                    </section>`
                  : ''
              }
              ${purchaseBlocksHtml}
              ${
                warningsHtml
                  ? `<section class="warnings">
                      <h2>Waarschuwingen</h2>
                      <ul>${warningsHtml}</ul>
                    </section>`
                  : ''
              }
            </div>
          </body>
        </html>
      `

      const didStartPrint = await printHtml(printMarkup, { windowFeatures: 'width=900,height=700' })
      if (!didStartPrint) {
        setPurchaseListPrintError('Printvenster kon niet worden geopend.')
        return
      }
      setIsPurchaseListPrintModalOpen(false)
    } catch (error) {
      setPurchaseListPrintError(error?.message || 'Inkooplijst genereren mislukt.')
    } finally {
      setIsGeneratingPurchaseListPrint(false)
    }
  }

  const allergensText = detail?.allergens_total || 'Geen brondata allergenen beschikbaar'
  const visibleProducts = viewMode === 'archived' ? filteredArchivedProducts : filteredProducts

  return (
    <div>
      <header className="page-header">
        <h2>Halffabricaten</h2>
        <p>Beheer eigen recepturen zoals soepen, sauzen, dressings en toppings.</p>
      </header>

      <section className="dish-search-card">
        <div className="dish-view-toggle" style={uiStyles.viewModeSwitch}>
          <button
            type="button"
            className="table-action-btn"
            onClick={() => setViewMode('active')}
            style={viewMode === 'active' ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
          >
            Actief
          </button>
          <button
            type="button"
            className="table-action-btn"
            onClick={() => setViewMode('archived')}
            style={viewMode === 'archived' ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
          >
            Archief
          </button>
        </div>

        <div className="dish-search-grid">
          <label className="dish-search-field dish-search-field-wide">
            <span>Zoek op naam</span>
            <input
              type="text"
              placeholder="Typ een halffabricaatnaam..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="dish-search-field">
            <span>Categorie</span>
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
          </label>
          <label className="dish-search-field">
            <span>Subcategorie</span>
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
          </label>
        </div>
      </section>

      <div className="dish-create-action-row">
        {viewMode === 'active' && canCreateProducts ? (
          <button type="button" className="sfp-new-btn dish-create-btn" onClick={openNewModal}>
            + Nieuw halffabricaat
          </button>
        ) : null}
      </div>

      {pageMessage ? <p className="form-info inline-message">{pageMessage}</p> : null}
      {errorMessage ? <div style={{ color: 'red' }}>{errorMessage}</div> : null}

      {visibleProducts.length === 0 ? (
        <section className="dish-empty-state dish-empty-state-compact">
          <p>
            {viewMode === 'archived'
              ? 'Nog geen gearchiveerde halffabricaten gevonden.'
              : 'Nog geen halffabricaten gevonden.'}
          </p>
        </section>
      ) : (
        <section className="card">
          <div className="table-scroll">
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th className="text-left">Naam</th>
                  <th className="text-center">Categorie</th>
                  <th className="text-center">Subcategorie</th>
                  <th className="text-center">Eindgewicht/eindinhoud</th>
                  <th className="text-center">Actie</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((item) => (
                  <tr key={item.id}>
                    <td className="text-left">{item.name}</td>
                    <td className="text-center">{item.category || '-'}</td>
                    <td className="text-center">{item.subcategory || '-'}</td>
                    <td className="text-center">{formatYield(item.final_yield_amount, item.final_yield_unit)}</td>
                    <td className="text-center" style={uiStyles.actionCell}>
                      <div style={uiStyles.rowActionsWrap} ref={openActionsMenuId === item.id ? actionsMenuRef : null}>
                        {canViewProducts ? (
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
                                {hasPermission(permissions, 'halffabricaten', 'dupliceren', role) ? (
                                  <button
                                    type="button"
                                    style={uiStyles.rowMenuItem}
                                    onClick={() => handleDuplicateProduct(item)}
                                  >
                                    ⧉ Dupliceren
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  style={uiStyles.rowMenuItem}
                                  onClick={() => openLabelModalForProduct(item, viewMode)}
                                >
                                  🏷 Dagetiket
                                </button>
                                {hasPermission(permissions, 'halffabricaten', 'archiveren', role) ? (
                                  <button
                                    type="button"
                                    style={uiStyles.rowMenuItem}
                                    onClick={() => handleArchiveById(item.id)}
                                  >
                                    <span style={{ color: '#d97706' }}>🗄</span> Archiveren
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <>
                                  <>
                                    {!isLoadingPermissions && hasPermission(permissions, 'halffabricaten', 'herstellen', role) ? (
                                    <button
                                      type="button"
                                      style={uiStyles.rowMenuItem}
                                      onClick={() => handleRestoreById(item.id)}
                                    >
                                      ♻️ Herstellen
                                    </button>
                                    ) : null}
                                    {hasPermission(permissions, 'halffabricaten', 'verwijderen', role) ? (
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
        </section>
      )}

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
                    {!formData.photo_url.trim() || isEditingPhotoUrl ? (
                      <input
                        type="text"
                        placeholder="https://..."
                        value={formData.photo_url}
                        readOnly={isReadOnlyModal}
                        onChange={(event) => handleFormChange('photo_url', event.target.value)}
                      />
                    ) : (
                      <div style={uiStyles.photoPreviewWrap}>
                        <a
                          href={formData.photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={uiStyles.photoLink}
                        >
                          {formData.photo_url}
                        </a>
                        <img
                          src={formData.photo_url}
                          alt="Foto preview"
                          style={uiStyles.photoPreview}
                        />
                        {canEditProducts ? (
                          <button
                            type="button"
                            className="table-action-btn"
                            disabled={isReadOnlyModal}
                            onClick={() => setIsEditingPhotoUrl(true)}
                          >
                            ✏️ Bewerken
                          </button>
                        ) : null}
                      </div>
                    )}
                  </label>
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
                    Categorie
                    <select
                      value={formData.category}
                      disabled={isReadOnlyModal}
                      onChange={(event) => handleCategoryChange(event.target.value)}
                    >
                      <option value="">Kies een categorie</option>
                      {modalCategoryOptions.map((categoryName) => (
                        <option key={categoryName} value={categoryName}>
                          {categoryName}
                        </option>
                      ))}
                    </select>
                    {canEditProducts ? (
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={isReadOnlyModal}
                        onClick={() => setShowNewCategoryInput((prev) => !prev)}
                      >
                        Nieuwe categorie
                      </button>
                    ) : null}
                    {showNewCategoryInput ? (
                      <div className="recipe-line-inline">
                        <input
                          type="text"
                          placeholder="Nieuwe categorie"
                          value={newCategoryName}
                          readOnly={isReadOnlyModal}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                        />
                        <button type="button" onClick={handleCreateCategory} disabled={isReadOnlyModal}>
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
                      disabled={!formData.category || isReadOnlyModal}
                    >
                      <option value="">Kies een subcategorie</option>
                      {modalSubcategoryOptions.map((subcategoryName) => (
                        <option key={subcategoryName} value={subcategoryName}>
                          {subcategoryName}
                        </option>
                      ))}
                    </select>
                    {canEditProducts ? (
                      <button
                        type="button"
                        className="table-action-btn"
                        onClick={() => setShowNewSubcategoryInput((prev) => !prev)}
                        disabled={!formData.category || isReadOnlyModal}
                      >
                        Nieuwe subcategorie
                      </button>
                    ) : null}
                    {showNewSubcategoryInput ? (
                      <div className="recipe-line-inline">
                        <input
                          type="text"
                          placeholder="Nieuwe subcategorie"
                          value={newSubcategoryName}
                          readOnly={isReadOnlyModal}
                          onChange={(event) => setNewSubcategoryName(event.target.value)}
                        />
                        <button type="button" onClick={handleCreateSubcategory} disabled={isReadOnlyModal}>
                          Opslaan
                        </button>
                      </div>
                    ) : null}
                  </label>
                </div>
              </section>

              <section className="modal-section">
                <h4>Ingrediënten</h4>
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
                      {formatCalculationContentLabel(selectedIngredient)
                        ? ` | Inhoud: ${formatCalculationContentLabel(selectedIngredient)}`
                        : ''}
                      {formatPackageVolumeLabel(selectedIngredient)
                        ? ` | Volume: ${formatPackageVolumeLabel(selectedIngredient)}`
                        : ''}
                      {' | '}Keuze: {selectedIngredientUnitOptions.join(' / ') || '-'}
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
                              Categorie: {item.category || '-'} | Subcategorie: {item.subcategory || '-'}
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
                                ) : (
                                  <>
                                    {!isReadOnlyModal && canEditProducts ? (
                                      <>
                                        <button type="button" className="table-action-btn" onClick={() => startEditLine(line)}>
                                          Bewerken
                                        </button>
                                        <button type="button" className="table-action-btn" onClick={() => handleDeleteLine(line)}>
                                          Verwijderen
                                        </button>
                                      </>
                                    ) : (
                                      <span>-</span>
                                    )}
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
                    : 'eindgewicht of eindinhoud ontbreekt'}
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
                        readOnly={isReadOnlyModal}
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
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('final_yield_amount', event.target.value)}
                    />
                  </label>
                  <label>
                    Eenheid eindproduct
                    <select
                      value={formData.final_yield_unit}
                      disabled={isReadOnlyModal}
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
                      readOnly={isReadOnlyModal}
                      onChange={(event) => handleFormChange('storage_notes', event.target.value)}
                    />
                  </label>
                  <label>
                    Koelkast houdbaar (dagen)
                    <input
                      type="number"
                      step="1"
                      value={formData.storage_fridge_days}
                      readOnly={isReadOnlyModal}
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
                      readOnly={isReadOnlyModal}
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
              <div style={uiStyles.modalActionsLeft}>
                <button type="button" className="table-action-btn" onClick={handlePrintRecipe}>Print keukenrecept</button>
                {selectedProductId ? (
                  <button type="button" className="table-action-btn" onClick={openPurchaseListPrintModal}>
                    Print recept met inkooplijst
                  </button>
                ) : null}
                <button type="button" className="table-action-btn" onClick={openLabelModal}>Print dagetiket</button>
              </div>
              <div style={uiStyles.modalActionsRight}>
                {selectedProductId &&
                !isSelectedArchived &&
                hasPermission(permissions, 'halffabricaten', 'archiveren', role) ? (
                  <button type="button" className="table-action-btn" onClick={handleArchiveProduct}>
                    Archiveren
                  </button>
                ) : null}
                {!isSelectedArchived ? (
                  canEditProducts ? (
                    <button type="button" className="primary-btn" onClick={handleSaveProduct} disabled={isSaving}>
                      {isSaving ? 'Opslaan...' : 'Opslaan'}
                    </button>
                  ) : null
                ) : (
                  <>
                    {!isLoadingPermissions && hasPermission(permissions, 'halffabricaten', 'herstellen', role) ? (
                      <>
                        <button type="button" className="primary-btn" onClick={handleRestoreProduct}>
                          Herstellen
                        </button>
                        {hasPermission(permissions, 'halffabricaten', 'verwijderen', role) ? (
                          <button type="button" className="table-action-btn" onClick={handleDeleteProduct}>
                            Verwijderen
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}
                <button type="button" className="secondary-btn" onClick={closeModal}>Sluiten</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isPurchaseListPrintModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ zIndex: 60 }}>
          <form
            className="modal-card"
            style={{ width: 'min(460px, 100%)' }}
            onSubmit={handlePrintRecipeWithPurchaseList}
          >
            <div className="modal-header">
              <h3>Print recept met inkooplijst</h3>
            </div>
            <div className="modal-body">
              {purchaseListPrintError ? (
                <div className="modal-validation-banner">{purchaseListPrintError}</div>
              ) : null}
              <div className="modal-grid one-col calm-grid">
                <label>
                  Gewenst eindgewicht
                  <input
                    type="number"
                    step="any"
                    value={purchaseListTargetQuantity}
                    disabled={isGeneratingPurchaseListPrint}
                    autoFocus
                    onChange={(event) => {
                      setPurchaseListTargetQuantity(event.target.value)
                      setPurchaseListPrintError('')
                    }}
                  />
                </label>
                <p className="form-info inline-message">
                  Eenheid: {purchaseListTargetUnit || '-'}
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={isGeneratingPurchaseListPrint}
                onClick={closePurchaseListPrintModal}
              >
                Annuleren
              </button>
              <button type="submit" className="primary-btn" disabled={isGeneratingPurchaseListPrint}>
                {isGeneratingPurchaseListPrint ? 'Genereren...' : 'Genereren'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {isLabelModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Print dagetiket</h3>
            </div>
            <div className="modal-body">
              <div style={uiStyles.labelForm}>
                <div style={uiStyles.labelFieldRow}>
                  <div style={uiStyles.labelFieldCaption}>Productnaam</div>
                  <input type="text" value={formData.name || detail?.name || ''} readOnly />
                </div>
                <div style={uiStyles.labelFieldRow}>
                  <div style={uiStyles.labelFieldCaption}>Productiedatum</div>
                  <input
                    type="date"
                    value={labelProductionDate}
                    onChange={(event) => setLabelProductionDate(event.target.value)}
                  />
                </div>
                <div style={uiStyles.labelCheckboxRow}>
                  <div style={uiStyles.labelFieldCaption}>Bewaaradvies</div>
                  <label style={uiStyles.labelCheckboxWrap}>
                    <input
                      type="checkbox"
                      checked={labelUseFridge}
                      onChange={(event) => setLabelUseFridge(event.target.checked)}
                    />
                    <span>Opslaan in koelkast</span>
                  </label>
                </div>
                <div style={uiStyles.labelCheckboxRow}>
                  <div />
                  <label style={uiStyles.labelCheckboxWrap}>
                    <input
                      type="checkbox"
                      checked={labelUseFreezer}
                      onChange={(event) => setLabelUseFreezer(event.target.checked)}
                    />
                    <span>Opslaan in vriezer</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-actions" style={uiStyles.labelActions}>
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
