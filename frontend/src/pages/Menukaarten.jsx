import React, { useEffect, useMemo, useRef, useState } from 'react'

import { apiClient, API_BASE_URL } from '../api/client'
import { getCurrentUser } from '../utils/currentUser'

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

function hasPermission(permissions, domain, action, role) {
  return permissions?.[domain]?.[action]?.includes(role)
}

function formatDate(value) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString('nl-NL')
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '-'
  }
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR'
  }).format(Number(value))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const ALLERGEN_ASSET_BASE = import.meta.env.BASE_URL || '/'

const ALLERGEN_ICON_MAP = [
  {
    key: 'gluten',
    file: `${ALLERGEN_ASSET_BASE}allergenen/2gluten.png`,
    label: 'Gluten',
    matches: ['gluten', 'tarwe', 'rogge', 'gerst', 'haver', 'spelt', 'kamut']
  },
  {
    key: 'schaaldieren',
    file: `${ALLERGEN_ASSET_BASE}allergenen/2schaald.png`,
    label: 'Schaaldieren',
    matches: ['schaaldieren']
  },
  { key: 'ei', file: `${ALLERGEN_ASSET_BASE}allergenen/2ei.png`, label: 'Ei', matches: ['ei'] },
  { key: 'vis', file: `${ALLERGEN_ASSET_BASE}allergenen/2vis.png`, label: 'Vis', matches: ['vis'] },
  { key: 'pinda', file: `${ALLERGEN_ASSET_BASE}allergenen/2pindas.png`, label: 'Pinda', matches: ['pinda'] },
  { key: 'soja', file: `${ALLERGEN_ASSET_BASE}allergenen/2soja.png`, label: 'Soja', matches: ['soja'] },
  { key: 'melk', file: `${ALLERGEN_ASSET_BASE}allergenen/2melk.png`, label: 'Melk', matches: ['melk', 'lactose'] },
  {
    key: 'noten',
    file: `${ALLERGEN_ASSET_BASE}allergenen/2noten.png`,
    label: 'Noten',
    matches: [
      'noten',
      'boomnoten',
      'hazelnoten',
      'walnoten',
      'pecannoten',
      'paranoten',
      'macadamianoten',
      'pistachenoten',
      'amandelen',
      'cashewnoten'
    ]
  },
  { key: 'selderij', file: `${ALLERGEN_ASSET_BASE}allergenen/2selderij.png`, label: 'Selderij', matches: ['selderij'] },
  { key: 'mosterd', file: `${ALLERGEN_ASSET_BASE}allergenen/2mosterd.png`, label: 'Mosterd', matches: ['mosterd'] },
  { key: 'sesam', file: `${ALLERGEN_ASSET_BASE}allergenen/2sesamsaad.png`, label: 'Sesam', matches: ['sesam'] },
  {
    key: 'sulfiet',
    file: `${ALLERGEN_ASSET_BASE}allergenen/2zwaveldioxid.png`,
    label: 'Sulfiet',
    matches: ['sulfiet', 'sulfieten', 'zwaveldioxide en sulfieten']
  },
  { key: 'lupine', file: `${ALLERGEN_ASSET_BASE}allergenen/2lupine.png`, label: 'Lupine', matches: ['lupine'] },
  {
    key: 'weekdieren',
    file: `${ALLERGEN_ASSET_BASE}allergenen/2weekdieren.png`,
    label: 'Weekdieren',
    matches: ['weekdieren']
  }
]

function normalizeAllergenValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function parseAllergenString(value) {
  if (!value) {
    return new Set()
  }
  return new Set(
    String(value)
      .split(/[,\n;|]/)
      .map((item) => normalizeAllergenValue(item))
      .filter(Boolean)
  )
}

function hasAllergenMatch(allergens, column) {
  return column.matches.some((match) => allergens.has(match))
}

function getAllergenIcons(allergensTotal) {
  const allergens = parseAllergenString(allergensTotal)

  return ALLERGEN_ICON_MAP.filter((item) => hasAllergenMatch(allergens, item))
}

function waitForPrintImages(printWindow, timeoutMs = 2000) {
  const images = Array.from(printWindow.document.images || [])
  if (images.length === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let resolved = false
    let remaining = images.length

    const finish = () => {
      if (resolved) {
        return
      }
      resolved = true
      resolve()
    }

    const markDone = () => {
      remaining -= 1
      if (remaining <= 0) {
        finish()
      }
    }

    const timer = window.setTimeout(finish, timeoutMs)

    images.forEach((image) => {
      if (image.complete) {
        markDone()
        return
      }

      const handleSettled = () => {
        image.removeEventListener('load', handleSettled)
        image.removeEventListener('error', handleSettled)
        markDone()
        if (remaining <= 0) {
          window.clearTimeout(timer)
        }
      }

      image.addEventListener('load', handleSettled, { once: true })
      image.addEventListener('error', handleSettled, { once: true })
    })
  })
}

function statusLabel(status) {
  return status === 'active' ? 'Actief' : 'Concept'
}

function dateLabel(item) {
  if (item.status === 'active') {
    return item.activated_at ? `Actief sinds ${formatDate(item.activated_at)}` : 'Actief'
  }
  return 'Concept'
}

function renderDateCell(item) {
  if (item.status === 'active') {
    return (
      <div style={{ display: 'grid', gap: '0.1rem' }}>
        <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Actief sinds</div>
        <div>{item.activated_at ? formatDate(item.activated_at) : '-'}</div>
        {item.active_days != null ? (
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{item.active_days} dagen</div>
        ) : null}
      </div>
    )
  }

  return <span style={{ color: '#6b7280' }}>{dateLabel(item)}</span>
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '-'
  }
  return `${Number(value).toFixed(1)}%`
}

function getMarginDotColor(status) {
  if (status === 'green') {
    return '#16a34a'
  }
  if (status === 'orange') {
    return '#f59e0b'
  }
  if (status === 'red') {
    return '#dc2626'
  }
  return null
}

function getMarginRowBackground(status) {
  if (status === 'red') {
    return '#fef2f2'
  }
  if (status === 'orange') {
    return '#fff7ed'
  }
  if (status === 'green') {
    return '#f8fafc'
  }
  return 'transparent'
}

function getSectionAverageMargin(sectie) {
  const values = (sectie.gerechten || [])
    .map((gerecht) => gerecht.gross_margin_percent)
    .filter((value) => value != null && !Number.isNaN(Number(value)))
    .map((value) => Number(value))

  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getToolActionButtonStyle(variant = 'default') {
  if (variant === 'danger') {
    return {
      padding: '0.35rem 0.65rem',
      minHeight: '2rem',
      borderRadius: '0.6rem',
      border: '1px solid #e5e7eb',
      background: '#f9fafb',
      color: '#6b7280',
      fontSize: '0.9rem',
      lineHeight: 1.2
    }
  }

  return {
    padding: '0.35rem 0.65rem',
    minHeight: '2rem',
    borderRadius: '0.6rem',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    fontSize: '0.9rem',
    lineHeight: 1.2
  }
}

function splitSectionsSummary(value) {
  if (!value) {
    return []
  }
  return String(value)
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean)
}

export default function Menukaarten() {
  const [permissions, setPermissions] = useState(defaultPermissions)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const currentUser = getCurrentUser()
  const role = currentUser?.role
  const [activeTab, setActiveTab] = useState('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [menukaarten, setMenukaarten] = useState([])
  const [archivedMenukaarten, setArchivedMenukaarten] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreatingNewMenukaart, setIsCreatingNewMenukaart] = useState(false)
  const [newMenukaartName, setNewMenukaartName] = useState('')
  const [menukaartNameInput, setMenukaartNameInput] = useState('')
  const [isSavingMenukaartName, setIsSavingMenukaartName] = useState(false)
  const [menukaartCategories, setMenukaartCategories] = useState([])
  const [isLoadingMenukaartCategories, setIsLoadingMenukaartCategories] = useState(false)
  const [dishCategories, setDishCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedMenukaartId, setSelectedMenukaartId] = useState(null)
  const [selectedMenukaart, setSelectedMenukaart] = useState(null)
  const [availableDishes, setAvailableDishes] = useState([])
  const [selectedDishId, setSelectedDishId] = useState('')
  const [selectedSectieId, setSelectedSectieId] = useState('')
  const [dishSearchTerm, setDishSearchTerm] = useState('')
  const [dishCategoryFilter, setDishCategoryFilter] = useState('')
  const [dishSubcategoryFilter, setDishSubcategoryFilter] = useState('')
  const [hasSearchedDishes, setHasSearchedDishes] = useState(false)
  const [appliedDishSearch, setAppliedDishSearch] = useState({
    term: '',
    categoryId: '',
    subcategoryId: ''
  })
  const [editingSectieId, setEditingSectieId] = useState(null)
  const [editingSectieTitle, setEditingSectieTitle] = useState('')
  const [moveDishState, setMoveDishState] = useState(null)
  const [dragDishState, setDragDishState] = useState(null)
  const [dragOverDishState, setDragOverDishState] = useState(null)
  const [openActionsMenuId, setOpenActionsMenuId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSubmittingDetailAction, setIsSubmittingDetailAction] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const actionsMenuRef = useRef(null)
  const modalBodyRef = useRef(null)
  const modalScrollRestoreRef = useRef(null)
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const activeMenukaarten = useMemo(
    () =>
      menukaarten
        .filter((item) => item.status === 'active')
        .slice()
        .sort((left, right) => {
          if (!left.activated_at && !right.activated_at) {
            return 0
          }
          if (!left.activated_at) {
            return 1
          }
          if (!right.activated_at) {
            return -1
          }

          const leftTime = new Date(left.activated_at).getTime()
          const rightTime = new Date(right.activated_at).getTime()
          return leftTime - rightTime
        }),
    [menukaarten]
  )
  const conceptMenukaarten = useMemo(
    () => menukaarten.filter((item) => item.status !== 'active'),
    [menukaarten]
  )
  const filteredActiveMenukaarten = useMemo(
    () =>
      activeMenukaarten.filter((item) =>
        !normalizedSearchTerm ? true : String(item.name || '').toLowerCase().includes(normalizedSearchTerm)
      ),
    [activeMenukaarten, normalizedSearchTerm]
  )
  const filteredConceptMenukaarten = useMemo(
    () =>
      conceptMenukaarten.filter((item) =>
        !normalizedSearchTerm ? true : String(item.name || '').toLowerCase().includes(normalizedSearchTerm)
      ),
    [conceptMenukaarten, normalizedSearchTerm]
  )
  const filteredArchivedMenukaarten = useMemo(
    () =>
      archivedMenukaarten.filter((item) =>
        !normalizedSearchTerm ? true : String(item.name || '').toLowerCase().includes(normalizedSearchTerm)
      ),
    [archivedMenukaarten, normalizedSearchTerm]
  )
  const editableSecties = useMemo(
    () => (selectedMenukaart?.secties || []).filter((sectie) => sectie.id != null),
    [selectedMenukaart]
  )
  const linkedDishSectieById = useMemo(() => {
    const next = new Map()
    ;(selectedMenukaart?.secties || []).forEach((sectie) => {
      ;(sectie.gerechten || []).forEach((gerecht) => {
        next.set(gerecht.id, sectie)
      })
    })
    return next
  }, [selectedMenukaart])
  const selectedBeheerSectie = useMemo(
    () => editableSecties.find((sectie) => String(sectie.id) === String(selectedSectieId)) || null,
    [editableSecties, selectedSectieId]
  )

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
  const availableDishOptions = useMemo(
    () => availableDishes.filter((dish) => !dish?.is_archived),
    [availableDishes]
  )
  const availableDishById = useMemo(() => {
    const next = new Map()
    availableDishes.forEach((dish) => {
      next.set(dish.id, dish)
    })
    return next
  }, [availableDishes])
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
  const subcategoryOptions = useMemo(() => {
    if (!dishCategoryFilter) {
      return []
    }
    const categoryRecord =
      dishCategories.find((category) => String(category.id) === String(dishCategoryFilter)) || null
    return categoryRecord?.subcategories || []
  }, [dishCategories, dishCategoryFilter])
  const filteredDishSearchResults = useMemo(() => {
    const normalizedTerm = appliedDishSearch.term.trim().toLowerCase()

    return availableDishOptions.filter((dish) => {
      const categoryId = String(dish.category_id ?? '')
      const subcategoryId = String(dish.subcategory_id ?? '')
      const categoryName = categoryNameById.get(categoryId) || ''
      const subcategoryName = subcategoryNameById.get(subcategoryId) || ''
      const matchesTerm =
        !normalizedTerm ||
        [String(dish.name || ''), String(dish.menu_name || '')]
          .some((value) => value.toLowerCase().includes(normalizedTerm))

      if (!matchesTerm) {
        return false
      }
      if (appliedDishSearch.categoryId && categoryId !== String(appliedDishSearch.categoryId)) {
        return false
      }
      if (appliedDishSearch.subcategoryId && subcategoryId !== String(appliedDishSearch.subcategoryId)) {
        return false
      }

      return Boolean(categoryName || subcategoryName || matchesTerm)
    })
  }, [availableDishOptions, appliedDishSearch, categoryNameById, subcategoryNameById])
  const isSelectedArchived = !!selectedMenukaart?.is_archived
  const menukaartToolbarStyles = {
    viewModeSwitch: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' },
    toolbar: {
      display: 'grid',
      gridTemplateColumns: 'minmax(180px, 1fr) minmax(150px, 220px) minmax(150px, 220px) auto',
      gap: '0.75rem',
      alignItems: 'center'
    },
    control: {
      width: '100%',
      height: '40px',
      minHeight: '40px',
      marginTop: 0,
      padding: '0 0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      font: 'inherit',
      fontSize: '0.95rem',
      lineHeight: 1.2,
      background: '#fff',
      boxSizing: 'border-box'
    },
    newButton: {
      width: 'auto',
      minWidth: '180px',
      height: '40px',
      minHeight: '40px',
      marginTop: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 1rem',
      boxSizing: 'border-box'
    }
  }
  const archivedActionUiStyles = {
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
    }
  }
  const generalInfoStyles = {
    layout: {
      display: 'grid',
      gap: '1rem',
      gridTemplateColumns: 'minmax(0, 1.3fr) minmax(260px, 0.9fr)',
      alignItems: 'start'
    },
    leftColumn: {
      display: 'grid',
      gap: '1rem'
    },
    infoBox: {
      display: 'grid',
      gap: '0.8rem',
      padding: '1rem',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      background: '#f3f4f6'
    },
    infoRow: {
      display: 'grid',
      gap: '0.2rem'
    },
    infoLabel: {
      fontSize: '0.85rem',
      color: '#6b7280'
    },
    hint: {
      margin: 0,
      fontSize: '0.85rem',
      color: '#6b7280',
      lineHeight: 1.4
    }
  }
  const sectieBlockStyles = {
    summaryCard: {
      display: 'grid',
      gap: '0.9rem',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      padding: '0.9rem 1rem',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      background: '#fafafa'
    },
    titleInput: {
      marginTop: '0.35rem',
      maxWidth: '420px'
    },
    actionsWrap: {
      display: 'grid',
      gridTemplateColumns: 'auto auto auto',
      alignItems: 'end',
      columnGap: '0.6rem',
      flexWrap: 'wrap',
      justifyContent: 'flex-end'
    },
    orderWrap: {
      display: 'grid',
      gap: '0.18rem',
      justifyItems: 'center'
    },
    orderLabel: {
      fontSize: '0.75rem',
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.04em'
    },
    orderButtons: {
      display: 'flex',
      gap: '0.35rem'
    },
    iconButton: {
      width: '2rem',
      minWidth: '2rem',
      height: '2rem',
      minHeight: '2rem',
      marginTop: 0,
      padding: 0,
      borderRadius: '0.65rem',
      border: '1px solid #d1d5db',
      background: '#fff',
      color: '#374151',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.95rem',
      lineHeight: 1
    },
    iconButtonDanger: {
      width: '2rem',
      minWidth: '2rem',
      height: '2rem',
      minHeight: '2rem',
      marginTop: 0,
      padding: 0,
      borderRadius: '0.65rem',
      border: '1px solid #e5e7eb',
      background: '#fff',
      color: '#6b7280',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.95rem',
      lineHeight: 1
    },
    actionPair: {
      display: 'flex',
      gap: '0.35rem',
      alignItems: 'center'
    },
    beheerSection: {
      display: 'grid',
      gap: '1rem'
    },
    beheerCard: {
      display: 'grid',
      gap: '0.9rem',
      padding: '1rem',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      background: '#fafafa'
    },
    beheerGrid: {
      display: 'grid',
      gap: '0.9rem',
      gridTemplateColumns: 'minmax(240px, 1.5fr) minmax(200px, 1fr) minmax(200px, 1fr) auto',
      alignItems: 'end'
    },
    beheerHint: {
      margin: 0,
      color: '#6b7280'
    },
    chooserRow: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)',
      gap: '1rem',
      alignItems: 'center'
    },
    chooserIntro: {
      display: 'grid',
      gap: '0.2rem'
    },
    chooserLabel: {
      fontSize: '0.85rem',
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.04em'
    },
    chooserText: {
      margin: 0,
      color: '#374151'
    },
    largeControl: {
      width: '100%',
      minHeight: '44px',
      height: '44px',
      marginTop: 0,
      padding: '0 0.85rem',
      border: '1px solid #d1d5db',
      borderRadius: '10px',
      font: 'inherit',
      fontSize: '0.95rem',
      lineHeight: 1.2,
      background: '#fff',
      boxSizing: 'border-box'
    },
    searchButton: {
      minWidth: '140px',
      minHeight: '44px',
      marginTop: 0
    },
    resultMeta: {
      marginTop: '0.2rem',
      fontSize: '0.85rem',
      color: '#6b7280'
    },
    addedStatus: {
      fontSize: '0.85rem',
      color: '#6b7280',
      whiteSpace: 'nowrap'
    },
    centeredCell: {
      textAlign: 'center',
      whiteSpace: 'nowrap'
    },
    contentTableActions: {
      display: 'flex',
      gap: '0.35rem',
      alignItems: 'center',
      justifyContent: 'flex-end'
    },
    contentActionCell: {
      width: '118px',
      textAlign: 'right'
    }
  }
  const menukaartCategoryOptions = useMemo(() => menukaartCategories, [menukaartCategories])
  const supportsMenukaartCategories = true

  async function loadMenukaarten() {
    setIsLoading(true)
    setError('')
    try {
      const [activeData, archivedData] = await Promise.all([
        apiClient.getMenukaarten(),
        apiClient.getArchivedMenukaarten()
      ])
      setMenukaarten(Array.isArray(activeData) ? activeData : [])
      setArchivedMenukaarten(Array.isArray(archivedData) ? archivedData : [])
    } catch {
      setError('Menukaarten laden mislukt.')
      setMenukaarten([])
      setArchivedMenukaarten([])
    } finally {
      setIsLoading(false)
    }
  }

  async function loadMenukaartDetail(menukaartId) {
    setIsLoadingDetail(true)
    try {
      const detail = await apiClient.getMenukaart(menukaartId)
      setSelectedMenukaart(detail)
      setSelectedDishId('')
      setMoveDishState(null)
      setDragDishState(null)
      setDragOverDishState(null)
      setSelectedSectieId((currentValue) => {
        const hasCurrent = (detail.secties || []).some((sectie) => String(sectie.id) === String(currentValue))
        if (hasCurrent) {
          return currentValue
        }
        return ''
      })
    } catch {
      setError('Menukaartdetail laden mislukt.')
      setSelectedMenukaart(null)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function loadAvailableDishes() {
    try {
      const data = await apiClient.getDishes()
      setAvailableDishes(Array.isArray(data) ? data.filter((item) => !item?.is_archived) : [])
    } catch {
      setAvailableDishes([])
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

  async function loadMenukaartCategories() {
    setIsLoadingMenukaartCategories(true)
    try {
      const data = await apiClient.getMenukaartCategories()
      setMenukaartCategories(Array.isArray(data) ? data : [])
    } catch {
      setMenukaartCategories([])
    } finally {
      setIsLoadingMenukaartCategories(false)
    }
  }

  useEffect(() => {
    loadMenukaarten()
    loadAvailableDishes()
    loadMenukaartCategories()
    loadDishCategories()
  }, [])

  useEffect(() => {
    if (!selectedMenukaartId) {
      setSelectedMenukaart(null)
      setSelectedSectieId('')
      setSelectedDishId('')
      setDishSearchTerm('')
      setDishCategoryFilter('')
      setDishSubcategoryFilter('')
      setHasSearchedDishes(false)
      setAppliedDishSearch({
        term: '',
        categoryId: '',
        subcategoryId: ''
      })
      setEditingSectieId(null)
      setEditingSectieTitle('')
      setMoveDishState(null)
      setDragDishState(null)
      setDragOverDishState(null)
      return
    }
    loadMenukaartDetail(selectedMenukaartId)
  }, [selectedMenukaartId])

  useEffect(() => {
    setMenukaartNameInput(selectedMenukaart?.name || '')
    setSelectedCategoryId(selectedMenukaart?.category_id != null ? String(selectedMenukaart.category_id) : '')
    setShowNewCategoryInput(false)
    setNewCategoryName('')
    setSelectedDishId('')
    setDishSearchTerm('')
    setDishCategoryFilter('')
    setDishSubcategoryFilter('')
    setHasSearchedDishes(false)
    setAppliedDishSearch({
      term: '',
      categoryId: '',
      subcategoryId: ''
    })
    setEditingSectieId(null)
    setEditingSectieTitle('')
  }, [selectedMenukaart])

  function openMenukaartModal(menukaartId) {
    setIsCreatingNewMenukaart(false)
    setNewMenukaartName('')
    setIsModalOpen(true)
    setSelectedMenukaartId(menukaartId)
  }

  function openNewMenukaartModal() {
    setSelectedMenukaartId(null)
    setSelectedMenukaart(null)
    setSelectedSectieId('')
    setMoveDishState(null)
    setDragDishState(null)
    setDragOverDishState(null)
    setIsCreatingNewMenukaart(true)
    setNewMenukaartName('')
    setError('')
    setMessage('')
    setIsModalOpen(true)
  }

  function closeMenukaartModal() {
    if (isSubmittingDetailAction) {
      return
    }
    setIsModalOpen(false)
    setIsCreatingNewMenukaart(false)
    setNewMenukaartName('')
    setSelectedMenukaart(null)
    setSelectedMenukaartId(null)
  }

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

  function captureModalBodyScroll() {
    if (!modalBodyRef.current) {
      return
    }
    modalScrollRestoreRef.current = modalBodyRef.current.scrollTop
  }

  function restoreModalBodyScroll() {
    if (modalScrollRestoreRef.current == null) {
      return
    }
    const targetScrollTop = modalScrollRestoreRef.current
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (modalBodyRef.current) {
          modalBodyRef.current.scrollTop = targetScrollTop
        }
        modalScrollRestoreRef.current = null
      })
    })
  }

  async function refreshAfterDetailMutation(menukaartId, successMessage) {
    captureModalBodyScroll()
    await Promise.all([loadMenukaartDetail(menukaartId), loadMenukaarten()])
    restoreModalBodyScroll()
    setMessage(successMessage)
  }

  async function applyDetailResponse(detail, successMessage = '') {
    captureModalBodyScroll()
    setSelectedMenukaart(detail)
    await loadMenukaarten()
    restoreModalBodyScroll()
    if (successMessage) {
      setMessage(successMessage)
    }
  }

  async function handleCreate() {
    const name = newMenukaartName.trim()
    if (!name) {
      return
    }
    try {
      setError('')
      setMessage('')
      const created = await apiClient.createMenukaart({ name })
      setMessage('Menukaart aangemaakt.')
      await loadMenukaarten()
      setIsCreatingNewMenukaart(false)
      setNewMenukaartName('')
      setSelectedMenukaartId(created.id)
    } catch {
      setError('Menukaart aanmaken mislukt.')
    }
  }

  async function handleRename(item) {
    const name = window.prompt('Nieuwe naam voor menukaart', item.name || '')
    if (!name || !name.trim() || name.trim() === item.name) {
      return
    }
    try {
      setError('')
      setMessage('')
      await apiClient.updateMenukaart(item.id, { name: name.trim() })
      setMessage('Menukaart bijgewerkt.')
      await loadMenukaarten()
      if (selectedMenukaartId === item.id) {
        await loadMenukaartDetail(item.id)
      }
    } catch {
      setError('Menukaart bijwerken mislukt.')
    }
  }

  async function handleSaveMenukaartName() {
    if (!selectedMenukaart || isSelectedArchived || isSavingMenukaartName) {
      return
    }

    const trimmedName = menukaartNameInput.trim()
    if (!trimmedName) {
      setMenukaartNameInput(selectedMenukaart.name || '')
      setError('Naam mag niet leeg zijn.')
      return
    }

    if (trimmedName === selectedMenukaart.name) {
      return
    }

    try {
      setIsSavingMenukaartName(true)
      setError('')
      setMessage('')
      await apiClient.updateMenukaart(selectedMenukaart.id, { name: trimmedName })
      setMessage('Menukaartnaam bijgewerkt.')
      await loadMenukaarten()
      await loadMenukaartDetail(selectedMenukaart.id)
    } catch {
      setError('Menukaartnaam bijwerken mislukt.')
    } finally {
      setIsSavingMenukaartName(false)
    }
  }

  function handleMenukaartNameKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }

    if (event.key === 'Escape') {
      setMenukaartNameInput(selectedMenukaart?.name || '')
      event.currentTarget.blur()
    }
  }

  async function handleCategoryChange(value) {
    if (!selectedMenukaart || isSelectedArchived) {
      return
    }

    if (String(selectedMenukaart.category_id ?? '') === String(value || '')) {
      setSelectedCategoryId(value)
      return
    }

    try {
      setError('')
      setMessage('')
      setSelectedCategoryId(value)
      await apiClient.updateMenukaart(selectedMenukaart.id, {
        category_id: value === '' ? null : Number(value)
      })
      setMessage('Categorie bijgewerkt.')
      await loadMenukaarten()
      await loadMenukaartDetail(selectedMenukaart.id)
    } catch {
      setError('Categorie bijwerken mislukt.')
      setSelectedCategoryId(selectedMenukaart.category_id != null ? String(selectedMenukaart.category_id) : '')
    }
  }

  async function handleCreateMenukaartCategory() {
    if (isSelectedArchived || !selectedMenukaart) {
      return
    }

    const name = newCategoryName.trim()
    if (!name) {
      setError('Vul eerst een categorienaam in.')
      return
    }

    try {
      setError('')
      setMessage('')
      const created = await apiClient.createMenukaartCategory({ name })
      await loadMenukaartCategories()
      setShowNewCategoryInput(false)
      setNewCategoryName('')
      setSelectedCategoryId(String(created.id))
      await apiClient.updateMenukaart(selectedMenukaart.id, { category_id: created.id })
      setMessage('Categorie aangemaakt.')
      await loadMenukaarten()
      await loadMenukaartDetail(selectedMenukaart.id)
    } catch {
      setError('Categorie aanmaken mislukt.')
    }
  }

  async function handleSetStatus(item, nextStatus) {
    try {
      setError('')
      setMessage('')
      setOpenActionsMenuId(null)
      await apiClient.updateMenukaart(item.id, { status: nextStatus })
      setMessage(
        nextStatus === 'active' ? 'Menukaart geactiveerd.' : 'Menukaart teruggezet naar concept.'
      )
      await loadMenukaarten()
      if (selectedMenukaartId === item.id) {
        await loadMenukaartDetail(item.id)
      }
    } catch {
      setError(
        nextStatus === 'active'
          ? 'Menukaart activeren mislukt.'
          : 'Menukaart terugzetten naar concept mislukt.'
      )
    }
  }

  async function handleArchive(item) {
    try {
      setError('')
      setMessage('')
      setOpenActionsMenuId(null)
      await apiClient.archiveMenukaart(item.id)
      setMessage('Menukaart gearchiveerd.')
      await loadMenukaarten()
      if (selectedMenukaartId === item.id) {
        setIsModalOpen(false)
        setSelectedMenukaartId(null)
      }
    } catch {
      setError('Menukaart archiveren mislukt.')
    }
  }

  async function handleRestore(item) {
    if (!item?.id) {
      return
    }

    try {
      setError('')
      setMessage('')
      await apiClient.restoreMenukaart(item.id)
      await loadMenukaarten()
      setOpenActionsMenuId(null)
      setActiveTab('active')
      setIsModalOpen(true)
      setSelectedMenukaartId(item.id)
      await loadMenukaartDetail(item.id)
      setMessage('Menukaart hersteld uit archief.')
    } catch {
      setError('Herstellen mislukt.')
    }
  }

  async function handleDeleteArchived(item) {
    if (!item?.id) {
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je deze menukaart definitief wilt verwijderen?')
    if (!confirmed) {
      return
    }

    try {
      setError('')
      setMessage('')
      await apiClient.deleteMenukaart(item.id)
      await loadMenukaarten()
      setOpenActionsMenuId(null)
      if (selectedMenukaartId === item.id) {
        setIsModalOpen(false)
        setSelectedMenukaartId(null)
      }
      setMessage('Menukaart verwijderd.')
    } catch {
      setError('Verwijderen mislukt.')
    }
  }

  async function handleDuplicate(item) {
    try {
      setError('')
      setMessage('')
      setOpenActionsMenuId(null)
      const duplicated = await apiClient.duplicateMenukaart(item.id)
      setMessage('Menukaart gedupliceerd.')
      await loadMenukaarten()
      setIsModalOpen(true)
      setSelectedMenukaartId(duplicated.id)
    } catch {
      setError('Menukaart dupliceren mislukt.')
    }
  }

  async function handleCreateSectie() {
    if (!selectedMenukaart || isSubmittingDetailAction) {
      return
    }
    const title = window.prompt('Naam van de sectie')
    if (!title || !title.trim()) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.createMenukaartSectie(selectedMenukaart.id, { title: title.trim() })
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie toegevoegd.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie toevoegen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleRenameSectie(sectie) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    const title = window.prompt('Nieuwe sectienaam', sectie.title || '')
    if (!title || !title.trim() || title.trim() === sectie.title) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.updateMenukaartSectie(selectedMenukaart.id, sectie.id, { title: title.trim() })
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie bijwerken mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function handleStartInlineSectieEdit(sectie) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }

    setEditingSectieId(sectie.id)
    setEditingSectieTitle(sectie.title || '')
  }

  function handleCancelInlineSectieEdit() {
    setEditingSectieId(null)
    setEditingSectieTitle('')
  }

  async function handleSaveInlineSectieTitle(sectie) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }

    const title = editingSectieTitle.trim()
    if (!title) {
      setEditingSectieTitle(sectie.title || '')
      setError('Sectienaam mag niet leeg zijn.')
      return
    }

    if (title === sectie.title) {
      handleCancelInlineSectieEdit()
      return
    }

    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.updateMenukaartSectie(selectedMenukaart.id, sectie.id, { title })
      handleCancelInlineSectieEdit()
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie bijwerken mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function handleInlineSectieTitleKeyDown(event, sectie) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSaveInlineSectieTitle(sectie)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelInlineSectieEdit()
    }
  }

  async function handleDeleteSectie(sectie) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.deleteMenukaartSectie(selectedMenukaart.id, sectie.id)
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie verwijderd.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie verwijderen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleAddDish() {
    if (!selectedMenukaart || !selectedDishId || !selectedSectieId || isSubmittingDetailAction) {
      return
    }
    return handleAddDishToSectie(selectedDishId, selectedSectieId)
  }

  async function handleAddDishToSectie(dishId, sectieId) {
    if (!selectedMenukaart || !dishId || !sectieId || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.addGerechtToMenukaart(selectedMenukaart.id, Number(dishId), Number(sectieId))
      setSelectedDishId('')
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Gerecht toegevoegd aan menukaart.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht toevoegen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleRemoveDish(gerechtId) {
    if (!selectedMenukaart || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.removeGerechtFromMenukaart(selectedMenukaart.id, gerechtId)
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Gerecht verwijderd uit menukaart.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht verwijderen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function applyDishSearchFilters() {
    setHasSearchedDishes(true)
    setAppliedDishSearch({
      term: dishSearchTerm,
      categoryId: dishCategoryFilter,
      subcategoryId: dishSubcategoryFilter
    })
  }

  async function handleMoveSectie(sectie, direction) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      const detail =
        direction === 'up'
          ? await apiClient.moveMenukaartSectieUp(selectedMenukaart.id, sectie.id)
          : await apiClient.moveMenukaartSectieDown(selectedMenukaart.id, sectie.id)
      await applyDetailResponse(detail, 'Sectievolgorde bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie verplaatsen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleMoveDish(sectie, gerechtId, direction) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      const detail =
        direction === 'up'
          ? await apiClient.moveMenukaartGerechtUp(selectedMenukaart.id, sectie.id, gerechtId)
          : await apiClient.moveMenukaartGerechtDown(selectedMenukaart.id, sectie.id, gerechtId)
      await applyDetailResponse(detail, 'Gerechtvolgorde bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht verplaatsen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function handleDishDragStart(sectie, gerecht, index) {
    if (sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setDragDishState({
      sectieId: sectie.id,
      gerechtId: gerecht.id,
      index
    })
    setDragOverDishState(null)
  }

  function handleDishDragOver(event, sectie, gerecht, index) {
    if (
      dragDishState == null ||
      sectie.id == null ||
      dragDishState.sectieId !== sectie.id ||
      dragDishState.gerechtId === gerecht.id
    ) {
      return
    }
    event.preventDefault()
    if (
      dragOverDishState?.sectieId === sectie.id &&
      dragOverDishState?.gerechtId === gerecht.id &&
      dragOverDishState?.index === index
    ) {
      return
    }
    setDragOverDishState({
      sectieId: sectie.id,
      gerechtId: gerecht.id,
      index
    })
  }

  async function handleDishDrop(event, sectie, index) {
    event.preventDefault()
    if (
      dragDishState == null ||
      sectie.id == null ||
      dragDishState.sectieId !== sectie.id ||
      dragDishState.index === index ||
      isSubmittingDetailAction
    ) {
      setDragOverDishState(null)
      return
    }

    const dishId = dragDishState.gerechtId
    const fromIndex = dragDishState.index
    const toIndex = index

    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      let detail = null
      if (fromIndex < toIndex) {
        for (let currentIndex = fromIndex; currentIndex < toIndex; currentIndex += 1) {
          detail = await apiClient.moveMenukaartGerechtDown(selectedMenukaart.id, sectie.id, dishId)
        }
      } else {
        for (let currentIndex = fromIndex; currentIndex > toIndex; currentIndex -= 1) {
          detail = await apiClient.moveMenukaartGerechtUp(selectedMenukaart.id, sectie.id, dishId)
        }
      }
      if (detail) {
        await applyDetailResponse(detail, 'Gerechtvolgorde bijgewerkt.')
      }
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht slepen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
      setDragDishState(null)
      setDragOverDishState(null)
    }
  }

  function handleDishDragEnd() {
    setDragDishState(null)
    setDragOverDishState(null)
  }

  async function handleMoveDishToSectie(sectie, gerecht) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    const targetSecties = editableSecties.filter((item) => item.id !== sectie.id)
    if (targetSecties.length === 0) {
      return
    }
    setMoveDishState({
      gerechtId: gerecht.id,
      fromSectieId: sectie.id,
      targetSectieId: ''
    })
  }

  function handleCancelMoveDishToSectie() {
    setMoveDishState(null)
  }

  async function handleConfirmMoveDishToSectie() {
    if (!selectedMenukaart || !moveDishState?.targetSectieId || isSubmittingDetailAction) {
      return
    }

    const targetSectieId = Number(moveDishState.targetSectieId)
    const targetExists = editableSecties.some(
      (item) => item.id === targetSectieId && item.id !== moveDishState.fromSectieId
    )
    if (!targetExists) {
      setError('Ongeldige sectiekeuze voor verplaatsen.')
      return
    }

    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      const detail = await apiClient.moveMenukaartGerechtToSectie(
        selectedMenukaart.id,
        moveDishState.gerechtId,
        targetSectieId
      )
      setMoveDishState(null)
      await applyDetailResponse(detail, 'Gerecht verplaatst naar andere sectie.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht verplaatsen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function handlePrintMenukaart() {
    if (!selectedMenukaart) {
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      setError('Printweergave openen mislukt.')
      return
    }

    const sectionsHtml = (selectedMenukaart.secties || [])
      .map((sectie) => {
        const dishesHtml = (sectie.gerechten || [])
          .map((gerecht) => {
            const dishRecord = availableDishById.get(gerecht.id)
            const displayName = dishRecord?.menu_name?.trim()
            const description = dishRecord?.menu_description?.trim()

            return `
              <div class="print-row">
                <div class="print-main-line">
                  <span class="print-name">${escapeHtml(displayName || '')}</span>
                  <span class="print-dots"></span>
                  <span class="print-price">${escapeHtml(formatCurrency(gerecht.sale_price_incl_vat))}</span>
                </div>
                ${
                  description
                    ? `<div class="print-description">${escapeHtml(description)}</div>`
                    : ''
                }
              </div>
            `
          })
          .join('')

        return `
          <section class="print-section">
            <h2>${escapeHtml(sectie.title)}</h2>
            ${dishesHtml || '<p class="print-empty">Geen gerechten in deze sectie.</p>'}
          </section>
        `
      })
      .join('')

    printWindow.document.write(`
      <!doctype html>
      <html lang="nl">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(selectedMenukaart.name)}</title>
          <style>
            body {
              font-family: Georgia, "Times New Roman", serif;
              color: #111;
              background: #fff;
              margin: 32px;
            }
            h1 {
              margin: 0 0 24px;
              font-size: 28px;
              letter-spacing: 0.03em;
            }
            h2 {
              margin: 24px 0 12px;
              font-size: 18px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .print-section {
              margin-top: 20px;
              page-break-inside: avoid;
            }
            .print-row {
              display: grid;
              gap: 2px;
              margin: 8px 0;
              font-size: 17px;
            }
            .print-main-line {
              display: flex;
              align-items: baseline;
              gap: 10px;
            }
            .print-name {
              white-space: nowrap;
            }
            .print-description {
              font-size: 0.85em;
              color: #6b7280;
              white-space: normal;
              padding-right: 110px;
            }
            .print-dots {
              flex: 1;
              border-bottom: 1px dotted #666;
              transform: translateY(-2px);
            }
            .print-price {
              min-width: 90px;
              text-align: right;
              white-space: nowrap;
            }
            .print-empty {
              margin: 0;
              font-style: italic;
            }
            @media print {
              body {
                margin: 18px;
              }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(selectedMenukaart.name)}</h1>
          ${sectionsHtml || '<p>Geen secties of gerechten beschikbaar.</p>'}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  async function handlePrintAllergenenkaart() {
    if (!selectedMenukaart) {
      return
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) {
      setError('Printweergave openen mislukt.')
      return
    }

    setError('')
    setMessage('')

    try {
      const sectionsHtml = (selectedMenukaart.secties || [])
        .map((sectie) => {
          if (!(sectie.gerechten || []).length) {
            return ''
          }

          const rowsHtml = (sectie.gerechten || [])
            .map((gerecht) => {
              const dishRecord = availableDishById.get(gerecht.id)
              const displayName = dishRecord?.menu_name?.trim()
              const iconEntries = getAllergenIcons(gerecht.allergens_total)
              const iconsHtml = iconEntries
                .map(
                  (item) => `
                    <img
                      class="allergen-icon"
                      src="${escapeHtml(item.file)}"
                      alt="${escapeHtml(item.label)}"
                      title="${escapeHtml(item.label)}"
                    />
                  `
                )
                .join('')

              return `
                <div class="allergen-row">
                  <div class="allergen-dish">
                    <div class="allergen-dish-name">${escapeHtml(displayName || '')}</div>
                  </div>
                  <div class="allergen-icons">
                    ${iconsHtml}
                  </div>
                </div>
              `
            })
            .join('')

          return `
            <section class="allergen-section">
              <h2>${escapeHtml(sectie.title)}</h2>
              <div class="allergen-list">
                ${rowsHtml}
              </div>
            </section>
          `
        })
        .filter(Boolean)
        .join('')

      printWindow.document.write(`
        <!doctype html>
        <html lang="nl">
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(selectedMenukaart.name)} - Allergenenkaart</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                color: #1f2937;
                background: #fff;
                margin: 24px;
              }
              h1 {
                margin: 0 0 22px;
                font-size: 24px;
                font-weight: 700;
              }
              h2 {
                margin: 0 0 10px;
                font-size: 17px;
                font-weight: 700;
              }
              .allergen-section {
                margin-top: 22px;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              .allergen-list {
                border: 1px solid #d1d5db;
                border-radius: 0;
                overflow: hidden;
              }
              .allergen-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 18px;
                align-items: center;
                padding: 10px 14px;
                border-top: 1px solid #e5e7eb;
              }
              .allergen-row:first-child {
                border-top: 0;
              }
              .allergen-dish {
                min-width: 0;
              }
              .allergen-dish-name {
                font-weight: 600;
                font-size: 14px;
                line-height: 1.25;
                color: #111827;
              }
              .allergen-dish-description {
                margin-top: 3px;
                font-size: 12px;
                line-height: 1.35;
                color: #6b7280;
              }
              .allergen-icons {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 6px;
                max-width: 320px;
              }
              .allergen-icon {
                width: 32px;
                height: 32px;
                object-fit: contain;
              }
              @media print {
                body {
                  margin: 10px;
                }
                .allergen-section {
                  page-break-inside: avoid;
                  break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(selectedMenukaart.name)} - Allergenenkaart</h1>
            ${sectionsHtml || '<p>Geen secties met gerechten beschikbaar.</p>'}
          </body>
        </html>
      `)
      printWindow.document.close()
      await waitForPrintImages(printWindow)
      printWindow.focus()
      printWindow.print()
    } catch {
      printWindow.close()
      setError('Allergenenkaart printen mislukt.')
    }
  }

  function renderMenukaartSection(title, items, emptyText) {
    return (
      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>{title}</h3>
        {items.length === 0 ? (
          <p>{emptyText}</p>
        ) : (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '260px' }}>Naam</th>
                  <th>Status</th>
                  <th style={{ minWidth: '260px' }}>Inhoud</th>
                  <th style={{ width: '140px' }}>Aantal gerechten</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Marge</th>
                  <th style={{ width: '160px' }}>Datum</th>
                  <th style={{ width: '120px' }}>Acties</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td>{statusLabel(item.status)}</td>
                    <td>
                      {item.sections_summary ? (
                        <div title={item.sections_summary} style={{ display: 'grid', gap: '0.15rem' }}>
                          {splitSectionsSummary(item.sections_summary).map((part) => (
                            <div
                              key={`${item.id}-${part}`}
                              style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: '#374151'
                              }}
                            >
                              {part}
                            </div>
                          ))}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{item.dish_count ?? 0}</td>
                    <td style={{ textAlign: 'center' }}>
                      {item.margin_status ? (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '0.75rem',
                              height: '0.75rem',
                              borderRadius: '999px',
                              background: getMarginDotColor(item.margin_status)
                            }}
                          />
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{renderDateCell(item)}</td>
                    <td style={archivedActionUiStyles.actionCell}>
                      {item.is_archived ? (
                        <div
                          style={archivedActionUiStyles.rowActionsWrap}
                          ref={openActionsMenuId === item.id ? actionsMenuRef : null}
                        >
                          <button
                            type="button"
                            className="table-action-btn"
                            style={archivedActionUiStyles.rowActionButton}
                            onClick={() => openMenukaartModal(item.id)}
                          >
                            Openen
                          </button>
                          <button
                            type="button"
                            className="table-action-btn"
                            aria-label="Meer acties"
                            style={archivedActionUiStyles.rowMenuButton}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenActionsMenuId((prev) => (prev === item.id ? null : item.id))
                            }}
                          >
                            ⋯
                          </button>
                          {openActionsMenuId === item.id ? (
                            <div
                              style={archivedActionUiStyles.rowMenu}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {!isLoadingPermissions && hasPermission(permissions, 'menukaarten', 'herstellen', role) ? (
                                <button
                                  type="button"
                                  style={archivedActionUiStyles.rowMenuItem}
                                  onClick={() => handleRestore(item)}
                                >
                                  ♻️ Herstellen
                                </button>
                              ) : null}
                              {hasPermission(permissions, 'menukaarten', 'verwijderen', role) ? (
                                <button
                                  type="button"
                                  style={archivedActionUiStyles.rowMenuItem}
                                  onClick={() => handleDeleteArchived(item)}
                                >
                                  🗑 Verwijderen
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div
                          style={archivedActionUiStyles.rowActionsWrap}
                          ref={openActionsMenuId === item.id ? actionsMenuRef : null}
                        >
                          <button
                            type="button"
                            className="table-action-btn"
                            style={archivedActionUiStyles.rowActionButton}
                            onClick={() => openMenukaartModal(item.id)}
                          >
                            Openen
                          </button>
                          <button
                            type="button"
                            className="table-action-btn"
                            aria-label="Meer acties"
                            style={archivedActionUiStyles.rowMenuButton}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenActionsMenuId((prev) => (prev === item.id ? null : item.id))
                            }}
                          >
                            ⋯
                          </button>
                          {openActionsMenuId === item.id ? (
                            <div
                              style={archivedActionUiStyles.rowMenu}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {hasPermission(permissions, 'menukaarten', 'dupliceren', role) ? (
                                <button
                                  type="button"
                                  style={archivedActionUiStyles.rowMenuItem}
                                  onClick={() => handleDuplicate(item)}
                                >
                                  ⧉ Dupliceren
                                </button>
                              ) : null}
                              {item.status === 'active' ? (
                                <button
                                  type="button"
                                  style={archivedActionUiStyles.rowMenuItem}
                                  onClick={() => handleSetStatus(item, 'concept')}
                                >
                                  ↩ Terug naar concept
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  style={archivedActionUiStyles.rowMenuItem}
                                  onClick={() => handleSetStatus(item, 'active')}
                                >
                                  ✅ Actief maken
                                </button>
                              )}
                              {hasPermission(permissions, 'menukaarten', 'archiveren', role) ? (
                                <button
                                  type="button"
                                  style={archivedActionUiStyles.rowMenuItem}
                                  onClick={() => handleArchive(item)}
                                >
                                  <span style={{ color: '#d97706' }}>🗄</span> Archiveren
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }

  return (
    <div>
      <header className="page-header">
        <h2>Menukaarten</h2>
        <p>Beheer hier menukaarten in ontwikkeling, actieve kaarten en archief.</p>
      </header>

      <section className="card">
        <div style={menukaartToolbarStyles.viewModeSwitch}>
          <button
            type="button"
            className="table-action-btn"
            onClick={() => setActiveTab('active')}
            style={activeTab === 'active' ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
          >
            Actief
          </button>
          <button
            type="button"
            className="table-action-btn"
            onClick={() => setActiveTab('archived')}
            style={activeTab === 'archived' ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
          >
            Archief
          </button>
        </div>
        <div className="sfp-toolbar" style={menukaartToolbarStyles.toolbar}>
          <input
            type="text"
            placeholder="Zoek op naam"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            style={menukaartToolbarStyles.control}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            disabled={activeTab === 'archived'}
            style={menukaartToolbarStyles.control}
          >
            <option value="all">Alle</option>
            <option value="active">Actief</option>
            <option value="concept">In ontwikkeling</option>
          </select>
          <div />
          {activeTab === 'active' ? (
            <button
              type="button"
              className="sfp-new-btn"
              onClick={openNewMenukaartModal}
              style={menukaartToolbarStyles.newButton}
            >
              Nieuwe menukaart
            </button>
          ) : (
            <div />
          )}
        </div>
        {message ? <p className="form-info inline-message">{message}</p> : null}
        {error ? <p>{error}</p> : null}
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide sfp-modal">
            <div className="modal-header">
              <h3>
                {isCreatingNewMenukaart && !selectedMenukaartId
                  ? 'Nieuwe menukaart'
                  : isSelectedArchived
                    ? 'Menukaart bekijken'
                    : 'Menukaart bewerken'}
              </h3>
            </div>

            <div className="modal-body" ref={modalBodyRef}>
              {error ? <div className="modal-validation-banner">{error}</div> : null}
              {message ? <p className="form-info inline-message">{message}</p> : null}

              {isCreatingNewMenukaart && !selectedMenukaartId ? (
                <section className="modal-section">
                  <h4>Algemeen</h4>
                  <div className="modal-grid one-col calm-grid">
                    <label>
                      Naam
                      <input
                        type="text"
                        value={newMenukaartName}
                        onChange={(event) => setNewMenukaartName(event.target.value)}
                        placeholder="Naam van de menukaart"
                      />
                    </label>
                  </div>
                  <div className="modal-actions" style={{ padding: '1rem 0 0', borderTop: '0', justifyContent: 'flex-start' }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleCreate}
                      disabled={!newMenukaartName.trim()}
                    >
                      Menukaart aanmaken
                    </button>
                    <button type="button" className="secondary-btn" onClick={closeMenukaartModal}>
                      Sluiten
                    </button>
                  </div>
                </section>
              ) : isLoadingDetail || !selectedMenukaart ? (
                <p>Menukaartdetail laden...</p>
              ) : (
                <>
                  <section className="modal-section">
                    <h4>Algemene info</h4>
                    <div className="modal-grid one-col calm-grid">
                      <div style={generalInfoStyles.layout}>
                        <div style={generalInfoStyles.leftColumn}>
                          <label>
                            Naam
                            <input
                              type="text"
                              value={menukaartNameInput}
                              readOnly={isSelectedArchived || isSavingMenukaartName}
                              onChange={(event) => setMenukaartNameInput(event.target.value)}
                              onBlur={handleSaveMenukaartName}
                              onKeyDown={handleMenukaartNameKeyDown}
                            />
                          </label>

                          <label>
                            Categorie
                            <select
                              value={selectedCategoryId}
                              disabled={isLoadingMenukaartCategories || !supportsMenukaartCategories || isSelectedArchived}
                              onChange={(event) => handleCategoryChange(event.target.value)}
                            >
                              <option value="">Kies een categorie</option>
                              {menukaartCategoryOptions.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="table-action-btn"
                              disabled={isSelectedArchived}
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
                                  readOnly={isSelectedArchived}
                                  onChange={(event) => setNewCategoryName(event.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={handleCreateMenukaartCategory}
                                  disabled={isSelectedArchived || isLoadingMenukaartCategories}
                                >
                                  Opslaan
                                </button>
                              </div>
                            ) : null}
                          </label>
                          {!supportsMenukaartCategories ? (
                            <p style={generalInfoStyles.hint}>
                              Categorie is in deze release alleen frontendmatig voorbereid. Er is nog geen backendkoppeling voor menukaarten.
                            </p>
                          ) : null}
                          {isSelectedArchived ? (
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                              {!isLoadingPermissions && hasPermission(permissions, 'menukaarten', 'herstellen', role) ? (
                                <button
                                  type="button"
                                  onClick={() => handleRestore(selectedMenukaart)}
                                  style={{ maxWidth: '180px' }}
                                >
                                  Herstellen
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => handleDeleteArchived(selectedMenukaart)}
                                style={{ maxWidth: '180px' }}
                              >
                                Verwijderen
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div style={generalInfoStyles.infoBox}>
                          <div style={generalInfoStyles.infoRow}>
                            <div style={generalInfoStyles.infoLabel}>Status</div>
                            <div>{statusLabel(selectedMenukaart.status)}</div>
                          </div>
                          <div style={generalInfoStyles.infoRow}>
                            <div style={generalInfoStyles.infoLabel}>Secties</div>
                            <div>{(selectedMenukaart.secties || []).filter((sectie) => sectie.id != null).length}</div>
                          </div>
                          <div style={generalInfoStyles.infoRow}>
                            <div style={generalInfoStyles.infoLabel}>Gerechten</div>
                            <div>{selectedMenukaart.dish_count ?? 0}</div>
                          </div>
                          <div style={generalInfoStyles.infoRow}>
                            <div style={generalInfoStyles.infoLabel}>Gem. marge</div>
                            <div>{formatPercent(selectedMenukaart.average_margin_percent)}</div>
                          </div>
                          <div style={generalInfoStyles.infoRow}>
                            <div style={generalInfoStyles.infoLabel}>Margestatus</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              {selectedMenukaart.margin_status ? (
                                <>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: '0.75rem',
                                      height: '0.75rem',
                                      borderRadius: '999px',
                                      background: getMarginDotColor(selectedMenukaart.margin_status)
                                    }}
                                  />
                                  <span>{formatPercent(selectedMenukaart.average_margin_percent)}</span>
                                </>
                              ) : (
                                <span>-</span>
                              )}
                            </div>
                          </div>
                          <div style={generalInfoStyles.infoRow}>
                            <div style={generalInfoStyles.infoLabel}>Actief sinds</div>
                            <div>
                              {selectedMenukaart.status === 'active' && selectedMenukaart.activated_at
                                ? formatDate(selectedMenukaart.activated_at)
                                : 'Concept'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="modal-section">
                    <h4>Secties</h4>
                    <div className="modal-grid one-col calm-grid">
                      {!isSelectedArchived ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <p style={{ margin: 0, color: '#4b5563' }}>
                            Verdeel hier de kaart in secties/groepen en zet in de juiste volgorde.
                          </p>
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={handleCreateSectie}
                            disabled={isSubmittingDetailAction}
                            style={{ minWidth: '200px', minHeight: '2.5rem' }}
                          >
                            Sectie toevoegen
                          </button>
                        </div>
                      ) : null}

                      {(selectedMenukaart.secties || []).length === 0 ? (
                        <p>Nog geen secties op deze menukaart.</p>
                      ) : (
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                          {selectedMenukaart.secties.map((sectie) => (
                            <div
                              key={`section-summary-${sectie.id ?? sectie.title}`}
                              style={sectieBlockStyles.summaryCard}
                            >
                              <div>
                                {editingSectieId === sectie.id && !isSelectedArchived ? (
                                  <input
                                    type="text"
                                    value={editingSectieTitle}
                                    autoFocus
                                    style={sectieBlockStyles.titleInput}
                                    onChange={(event) => setEditingSectieTitle(event.target.value)}
                                    onBlur={() => handleSaveInlineSectieTitle(sectie)}
                                    onKeyDown={(event) => handleInlineSectieTitleKeyDown(event, sectie)}
                                  />
                                ) : (
                                  <div style={{ fontWeight: 600 }}>{sectie.title}</div>
                                )}
                                <div style={{ fontSize: '0.88rem', color: '#6b7280' }}>
                                  {sectie.gerechten?.length || 0} gerechten
                                </div>
                              </div>
                              {sectie.id != null && !isSelectedArchived ? (
                                <div style={sectieBlockStyles.actionsWrap}>
                                  <div style={sectieBlockStyles.orderWrap}>
                                    <div style={sectieBlockStyles.orderLabel}>Volgorde</div>
                                    <div style={sectieBlockStyles.orderButtons}>
                                      <button
                                        type="button"
                                        aria-label="Sectie omhoog"
                                        title="Omhoog"
                                        onClick={() => handleMoveSectie(sectie, 'up')}
                                        disabled={isSubmittingDetailAction}
                                        style={sectieBlockStyles.iconButton}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Sectie omlaag"
                                        title="Omlaag"
                                        onClick={() => handleMoveSectie(sectie, 'down')}
                                        disabled={isSubmittingDetailAction}
                                        style={sectieBlockStyles.iconButton}
                                      >
                                        ↓
                                      </button>
                                    </div>
                                  </div>
                                  <div style={sectieBlockStyles.actionPair}>
                                    <button
                                      type="button"
                                      aria-label="Sectienaam bewerken"
                                      title="Bewerken"
                                      onClick={() => handleStartInlineSectieEdit(sectie)}
                                      disabled={isSubmittingDetailAction}
                                      style={sectieBlockStyles.iconButton}
                                    >
                                      ✎
                                    </button>
                                    {hasPermission(permissions, 'menukaarten', 'verwijderen', role) ? (
                                      <button
                                        type="button"
                                        aria-label="Sectie verwijderen"
                                        title="Verwijderen"
                                        onClick={() => handleDeleteSectie(sectie)}
                                        disabled={isSubmittingDetailAction}
                                        style={sectieBlockStyles.iconButtonDanger}
                                      >
                                        🗑
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="modal-section">
                    <h4>Secties beheren</h4>
                    <div style={sectieBlockStyles.beheerSection}>
                      <div style={sectieBlockStyles.beheerCard}>
                        <div style={sectieBlockStyles.chooserRow}>
                          <div style={sectieBlockStyles.chooserIntro}>
                            <div style={sectieBlockStyles.chooserLabel}>Kies een sectie</div>
                            <p style={sectieBlockStyles.chooserText}>
                              Kies eerst welke sectie je wilt vullen en beheren.
                            </p>
                          </div>
                          <select
                            value={selectedSectieId}
                            onChange={(event) => setSelectedSectieId(event.target.value)}
                            disabled={editableSecties.length === 0}
                            style={sectieBlockStyles.largeControl}
                          >
                            <option value="">Kies een sectie</option>
                            {editableSecties.map((sectie) => (
                              <option key={sectie.id} value={sectie.id}>
                                {sectie.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={sectieBlockStyles.beheerCard}>
                        <h5 style={{ margin: 0 }}>Voeg gerechten toe</h5>
                        <div style={sectieBlockStyles.beheerGrid}>
                          <label>
                            Zoeken
                            <input
                              type="text"
                              value={dishSearchTerm}
                              onChange={(event) => setDishSearchTerm(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  applyDishSearchFilters()
                                }
                              }}
                              placeholder="Zoek op gerecht of menukaart"
                              disabled={!selectedBeheerSectie || isSelectedArchived}
                              style={sectieBlockStyles.largeControl}
                            />
                          </label>
                          <label>
                            Categorie
                            <select
                              value={dishCategoryFilter}
                              onChange={(event) => {
                                setDishCategoryFilter(event.target.value)
                                setDishSubcategoryFilter('')
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  applyDishSearchFilters()
                                }
                              }}
                              disabled={!selectedBeheerSectie || isSelectedArchived}
                              style={sectieBlockStyles.largeControl}
                            >
                              <option value="">Alle categorieën</option>
                              {dishCategories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Subcategorie
                            <select
                              value={dishSubcategoryFilter}
                              onChange={(event) => setDishSubcategoryFilter(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  applyDishSearchFilters()
                                }
                              }}
                              disabled={!selectedBeheerSectie || isSelectedArchived || !dishCategoryFilter}
                              style={sectieBlockStyles.largeControl}
                            >
                              <option value="">Alle subcategorieën</option>
                              {subcategoryOptions.map((subcategory) => (
                                <option key={subcategory.id} value={subcategory.id}>
                                  {subcategory.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={applyDishSearchFilters}
                            disabled={!selectedBeheerSectie || isSelectedArchived}
                            style={sectieBlockStyles.searchButton}
                          >
                            Zoek
                          </button>
                        </div>

                        {!selectedBeheerSectie ? (
                          <p style={sectieBlockStyles.beheerHint}>
                            Kies eerst een sectie om gerechten te zoeken en toe te voegen.
                          </p>
                        ) : !hasSearchedDishes ? (
                          <p style={sectieBlockStyles.beheerHint}>
                            Vul filters in en klik op Zoek om gerechten voor deze sectie te vinden.
                          </p>
                        ) : filteredDishSearchResults.length ? (
                          <div className="table-scroll">
                            <table className="ingredients-table">
                              <thead>
                                <tr>
                                  <th>Gerecht</th>
                                  <th>Categorie</th>
                                  <th>Subcategorie</th>
                                  <th>Actie</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredDishSearchResults.map((dish) => {
                                  const linkedSectie = linkedDishSectieById.get(dish.id)
                                  const isAlreadyLinked = Boolean(linkedSectie)
                                  const alreadyInSelectedSectie =
                                    linkedSectie && String(linkedSectie.id) === String(selectedBeheerSectie.id)

                                  return (
                                    <tr key={dish.id}>
                                      <td>
                                        <div style={{ fontWeight: 500 }}>{dish.name}</div>
                                        {dish.menu_name ? (
                                          <div style={sectieBlockStyles.resultMeta}>{dish.menu_name}</div>
                                        ) : null}
                                      </td>
                                      <td>{categoryNameById.get(String(dish.category_id ?? '')) || '-'}</td>
                                      <td>{subcategoryNameById.get(String(dish.subcategory_id ?? '')) || '-'}</td>
                                      <td style={{ textAlign: 'right' }}>
                                        <div
                                          style={{
                                            display: 'grid',
                                            gap: '0.35rem',
                                            justifyItems: 'end'
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => handleAddDishToSectie(dish.id, selectedBeheerSectie.id)}
                                            disabled={
                                              isSelectedArchived ||
                                              isSubmittingDetailAction ||
                                              isAlreadyLinked
                                            }
                                            style={{ maxWidth: '160px', minWidth: '120px' }}
                                          >
                                            Voeg toe
                                          </button>
                                          {isAlreadyLinked ? (
                                            <span style={sectieBlockStyles.addedStatus}>
                                              {alreadyInSelectedSectie
                                                ? 'Al toegevoegd aan deze sectie'
                                                : `Al toegevoegd aan ${linkedSectie.title}`}
                                            </span>
                                          ) : null}
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={sectieBlockStyles.beheerHint}>Geen gerechten gevonden voor deze zoekopdracht.</p>
                        )}
                      </div>

                      <div style={sectieBlockStyles.beheerCard}>
                        <h5 style={{ margin: 0 }}>Inhoud van de sectie</h5>
                        {!selectedBeheerSectie ? (
                          <p style={sectieBlockStyles.beheerHint}>
                            Kies eerst een sectie om de inhoud te bekijken en te beheren.
                          </p>
                        ) : selectedBeheerSectie.gerechten?.length ? (
                          <div className="table-scroll">
                            <table className="ingredients-table">
                              <thead>
                                <tr>
                                  <th>Naam</th>
                                  <th style={{ textAlign: 'center' }}>Prijs</th>
                                  <th style={{ textAlign: 'center' }}>Marge</th>
                                  {!isSelectedArchived ? <th style={{ width: '118px', textAlign: 'right' }}>Acties</th> : null}
                                </tr>
                              </thead>
                              <tbody>
                                {selectedBeheerSectie.gerechten.map((gerecht) => (
                                  <tr key={`${selectedBeheerSectie.id}-${gerecht.id}`}>
                                    <td style={{ fontWeight: 500 }}>{gerecht.name}</td>
                                    <td style={sectieBlockStyles.centeredCell}>
                                      {formatCurrency(gerecht.sale_price_incl_vat)}
                                    </td>
                                    <td style={sectieBlockStyles.centeredCell}>
                                      {gerecht.margin_status ? (
                                        <span
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                            whiteSpace: 'nowrap'
                                          }}
                                        >
                                          <span
                                            style={{
                                              display: 'inline-block',
                                              width: '0.75rem',
                                              height: '0.75rem',
                                              borderRadius: '999px',
                                              background: getMarginDotColor(gerecht.margin_status)
                                            }}
                                          />
                                          <span>{formatPercent(gerecht.gross_margin_percent)}</span>
                                        </span>
                                      ) : (
                                        '-'
                                          )}
                                    </td>
                                    {!isSelectedArchived ? (
                                      <td style={sectieBlockStyles.contentActionCell}>
                                        <div style={sectieBlockStyles.contentTableActions}>
                                          <button
                                            type="button"
                                            aria-label="Gerecht omhoog"
                                            title="Omhoog"
                                            onClick={() => handleMoveDish(selectedBeheerSectie, gerecht.id, 'up')}
                                            disabled={isSubmittingDetailAction || selectedBeheerSectie.id == null}
                                            style={sectieBlockStyles.iconButton}
                                          >
                                            ↑
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Gerecht omlaag"
                                            title="Omlaag"
                                            onClick={() => handleMoveDish(selectedBeheerSectie, gerecht.id, 'down')}
                                            disabled={isSubmittingDetailAction || selectedBeheerSectie.id == null}
                                            style={sectieBlockStyles.iconButton}
                                          >
                                            ↓
                                          </button>
                                          {hasPermission(permissions, 'menukaarten', 'verwijderen', role) ? (
                                            <button
                                              type="button"
                                              aria-label="Gerecht verwijderen"
                                              title="Verwijderen"
                                              onClick={() => handleRemoveDish(gerecht.id)}
                                              disabled={isSubmittingDetailAction}
                                              style={sectieBlockStyles.iconButtonDanger}
                                            >
                                              🗑
                                            </button>
                                          ) : null}
                                        </div>
                                      </td>
                                    ) : null}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={sectieBlockStyles.beheerHint}>Nog geen gerechten in deze sectie.</p>
                        )}
                      </div>
                    </div>
                  </section>

                  <div className="modal-actions">
                    {selectedMenukaartId ? (
                      <>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={handlePrintMenukaart}
                        >
                          Print menukaart
                        </button>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={handlePrintAllergenenkaart}
                        >
                          Print allergenenkaart
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="secondary-btn" onClick={closeMenukaartModal}>
                      Sluiten
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <p>Menukaarten laden...</p>
        </section>
      ) : activeTab === 'active' ? (
        <>
          {statusFilter !== 'concept'
            ? renderMenukaartSection(
                'Actieve menukaarten',
                filteredActiveMenukaarten,
                'Geen actieve menukaarten gevonden.'
              )
            : null}
          {statusFilter !== 'active'
            ? renderMenukaartSection(
                'Menukaarten in ontwikkeling',
                filteredConceptMenukaarten,
                'Geen menukaarten in ontwikkeling gevonden.'
              )
            : null}
        </>
      ) : (
        renderMenukaartSection(
          'Gearchiveerde menukaarten',
          filteredArchivedMenukaarten,
          'Geen gearchiveerde menukaarten gevonden.'
        )
      )}
    </div>
  )
}
