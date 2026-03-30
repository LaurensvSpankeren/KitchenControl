import React, { useEffect, useMemo, useState } from 'react'

import { apiClient, API_BASE_URL } from '../api/client'
import { getCurrentUser, getCurrentUserRole } from '../utils/currentUser'

const TABS = [
  { id: 'gebruikersbeheer', label: 'Gebruikersbeheer' },
  { id: 'rechtenbeheer', label: 'Rechtenbeheer' },
  { id: 'ingredient-categories', label: 'Ingrediënten categorieën' },
  { id: 'semi-finished-categories', label: 'Halffabricaten categorieën' },
  { id: 'dish-categories', label: 'Gerechten categorieën' },
  { id: 'menu-categories', label: 'Menukaarten categorieën' }
]

const PERMISSION_ROLES = ['Supervisor', 'Chef', 'Kok', 'Keukenhulp', 'Bediening']
const PERMISSION_ACTIONS = [
  'bekijken',
  'aanmaken',
  'wijzigen',
  'archiveren',
  'verwijderen',
  'herstellen',
  'dupliceren'
]
const PERMISSION_DOMAIN_LABELS = {
  gerechten: 'Gerechten',
  halffabricaten: 'Halffabricaten',
  ingredienten: 'Ingrediënten',
  menukaarten: 'Menukaarten',
  importbeheer: 'Importbeheer'
}
const INITIAL_PERMISSIONS = {
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
  ingredienten: {
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
  },
  importbeheer: {
    bekijken: ['Supervisor', 'Chef', 'Kok', 'Keukenhulp', 'Bediening'],
    aanmaken: ['Supervisor', 'Chef', 'Kok'],
    wijzigen: ['Supervisor', 'Chef', 'Kok'],
    archiveren: ['Supervisor'],
    verwijderen: ['Supervisor'],
    herstellen: ['Supervisor'],
    dupliceren: ['Supervisor', 'Chef', 'Kok']
  }
}

function flattenPermissions(nested) {
  const flat = {}

  Object.entries(nested || {}).forEach(([domain, actions]) => {
    Object.entries(actions || {}).forEach(([action, roles]) => {
      flat[`${domain}.${action}`] = roles
    })
  })

  return flat
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

export default function Instellingen() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [users, setUsers] = useState([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [usersMessage, setUsersMessage] = useState('')
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [activationCodes, setActivationCodes] = useState([])
  const [isLoadingActivationCodes, setIsLoadingActivationCodes] = useState(false)
  const [activationCodesError, setActivationCodesError] = useState('')
  const [activationCodesMessage, setActivationCodesMessage] = useState('')
  const [isCreateActivationCodeModalOpen, setIsCreateActivationCodeModalOpen] = useState(false)
  const [activationCodeForm, setActivationCodeForm] = useState({ role: 'Kok' })
  const [isCreatingActivationCode, setIsCreatingActivationCode] = useState(false)
  const [activeUserActionId, setActiveUserActionId] = useState(null)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingPasswordUserId, setEditingPasswordUserId] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ password: '' })
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: 'Kok'
  })
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Kok'
  })
  const [createUserMessage, setCreateUserMessage] = useState('')
  const [createUserError, setCreateUserError] = useState('')
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [ingredientCategories, setIngredientCategories] = useState([])
  const [isLoadingIngredientCategories, setIsLoadingIngredientCategories] = useState(false)
  const [ingredientCategoriesError, setIngredientCategoriesError] = useState('')
  const [ingredientCategoriesMessage, setIngredientCategoriesMessage] = useState('')
  const [editingIngredientCategoryName, setEditingIngredientCategoryName] = useState('')
  const [ingredientCategoryForm, setIngredientCategoryForm] = useState({ name: '' })
  const [activeIngredientCategoryActionName, setActiveIngredientCategoryActionName] = useState('')
  const [semiFinishedCategories, setSemiFinishedCategories] = useState([])
  const [isLoadingSemiFinishedCategories, setIsLoadingSemiFinishedCategories] = useState(false)
  const [semiFinishedCategoriesError, setSemiFinishedCategoriesError] = useState('')
  const [semiFinishedCategoriesMessage, setSemiFinishedCategoriesMessage] = useState('')
  const [editingSemiFinishedCategoryId, setEditingSemiFinishedCategoryId] = useState(null)
  const [semiFinishedCategoryForm, setSemiFinishedCategoryForm] = useState({ name: '' })
  const [activeSemiFinishedCategoryActionId, setActiveSemiFinishedCategoryActionId] = useState(null)
  const [editingSemiFinishedSubcategoryId, setEditingSemiFinishedSubcategoryId] = useState(null)
  const [semiFinishedSubcategoryForm, setSemiFinishedSubcategoryForm] = useState({ name: '' })
  const [activeSemiFinishedSubcategoryActionId, setActiveSemiFinishedSubcategoryActionId] =
    useState(null)
  const [dishCategories, setDishCategories] = useState([])
  const [isLoadingDishCategories, setIsLoadingDishCategories] = useState(false)
  const [dishCategoriesError, setDishCategoriesError] = useState('')
  const [dishCategoriesMessage, setDishCategoriesMessage] = useState('')
  const [editingDishCategoryId, setEditingDishCategoryId] = useState(null)
  const [dishCategoryForm, setDishCategoryForm] = useState({ name: '' })
  const [activeDishCategoryActionId, setActiveDishCategoryActionId] = useState(null)
  const [editingDishSubcategoryId, setEditingDishSubcategoryId] = useState(null)
  const [dishSubcategoryForm, setDishSubcategoryForm] = useState({ name: '' })
  const [activeDishSubcategoryActionId, setActiveDishSubcategoryActionId] = useState(null)
  const [menuCategories, setMenuCategories] = useState([])
  const [isLoadingMenuCategories, setIsLoadingMenuCategories] = useState(false)
  const [menuCategoriesError, setMenuCategoriesError] = useState('')
  const [menuCategoriesMessage, setMenuCategoriesMessage] = useState('')
  const [editingMenuCategoryId, setEditingMenuCategoryId] = useState(null)
  const [menuCategoryForm, setMenuCategoryForm] = useState({ name: '' })
  const [activeMenuCategoryActionId, setActiveMenuCategoryActionId] = useState(null)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [permissionsError, setPermissionsError] = useState('')
  const [permissionsMessage, setPermissionsMessage] = useState('')
  const [permissions, setPermissions] = useState(INITIAL_PERMISSIONS)
  const currentUser = useMemo(() => getCurrentUser(), [])
  const role = useMemo(() => getCurrentUserRole(), [])
  const hasAccess = role === 'Supervisor'
  const activeTabRecord = TABS.find((tab) => tab.id === activeTab) || TABS[0]
  const isUsersTab = activeTab === 'gebruikersbeheer'
  const isPermissionsTab = activeTab === 'rechtenbeheer'
  const isIngredientCategoriesTab = activeTab === 'ingredient-categories'
  const isSemiFinishedCategoriesTab = activeTab === 'semi-finished-categories'
  const isDishCategoriesTab = activeTab === 'dish-categories'
  const isMenuCategoriesTab = activeTab === 'menu-categories'
  const currentUserId = Number(currentUser?.id) || null
  const openActivationCodes = useMemo(
    () => activationCodes.filter((item) => !item?.is_used),
    [activationCodes]
  )
  const usedActivationCodes = useMemo(
    () => activationCodes.filter((item) => item?.is_used),
    [activationCodes]
  )

  function formatDateTime(value) {
    if (!value) {
      return '-'
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleString('nl-NL')
  }

  async function activationCodesFetch(path, options = {}) {
    const token = apiClient.getAuthToken()
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    })
    if (response.status === 401) {
      apiClient.clearAuthSession()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new window.Event('kc:auth:unauthorized'))
      }
    }
    return response
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
      // Ignore storage errors and keep backend as primary source.
    }
  }

  async function loadUsers() {
    setIsLoadingUsers(true)
    setUsersError('')
    try {
      const data = await apiClient.getUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch {
      setUsers([])
      setUsersError('Gebruikers laden mislukt.')
    } finally {
      setIsLoadingUsers(false)
    }
  }

  async function loadIngredientCategories() {
    setIsLoadingIngredientCategories(true)
    setIngredientCategoriesError('')
    try {
      const data = await apiClient.getIngredientCategories()
      setIngredientCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      setIngredientCategories([])
      setIngredientCategoriesError(
        error?.message || 'Ingrediëntencategorieën laden mislukt.'
      )
    } finally {
      setIsLoadingIngredientCategories(false)
    }
  }

  async function loadSemiFinishedCategories() {
    setIsLoadingSemiFinishedCategories(true)
    setSemiFinishedCategoriesError('')
    try {
      const data = await apiClient.getSemiFinishedCategories()
      setSemiFinishedCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      setSemiFinishedCategories([])
      setSemiFinishedCategoriesError(
        error?.message || 'Halffabricatencategorieën laden mislukt.'
      )
    } finally {
      setIsLoadingSemiFinishedCategories(false)
    }
  }

  async function loadDishCategories() {
    setIsLoadingDishCategories(true)
    setDishCategoriesError('')
    try {
      const data = await apiClient.getDishCategories()
      setDishCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      setDishCategories([])
      setDishCategoriesError(
        error?.message || 'Gerechtencategorieën laden mislukt.'
      )
    } finally {
      setIsLoadingDishCategories(false)
    }
  }

  async function loadMenuCategories() {
    setIsLoadingMenuCategories(true)
    setMenuCategoriesError('')
    try {
      const data = await apiClient.getMenukaartCategories()
      setMenuCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      setMenuCategories([])
      setMenuCategoriesError(
        error?.message || 'Menukaartcategorieën laden mislukt.'
      )
    } finally {
      setIsLoadingMenuCategories(false)
    }
  }

  async function loadActivationCodes() {
    setIsLoadingActivationCodes(true)
    setActivationCodesError('')
    try {
      const response = await activationCodesFetch('/api/activation-codes')
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail || `Failed to fetch activation codes: ${response.status}`)
      }
      const data = await response.json()
      setActivationCodes(Array.isArray(data) ? data : [])
    } catch (error) {
      setActivationCodes([])
      setActivationCodesError(error?.message || 'Activatiecodes laden mislukt.')
    } finally {
      setIsLoadingActivationCodes(false)
    }
  }

  async function loadPermissions() {
    setIsLoadingPermissions(true)
    setPermissionsError('')
    try {
      const response = await activationCodesFetch('/api/permissions')
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail || `Failed to fetch permissions: ${response.status}`)
      }
      const data = await response.json()
      const nestedPermissions =
        data?.permissions && typeof data.permissions === 'object'
          ? unflattenPermissions(data.permissions)
          : INITIAL_PERMISSIONS
      const nextPermissions =
        nestedPermissions && Object.keys(nestedPermissions).length > 0
          ? nestedPermissions
          : INITIAL_PERMISSIONS
      setPermissions(nextPermissions)
      storePermissionsLocally(nextPermissions)
    } catch (error) {
      const fallbackPermissions = readStoredPermissions()
      setPermissions(
        fallbackPermissions && typeof fallbackPermissions === 'object'
          ? fallbackPermissions
          : INITIAL_PERMISSIONS
      )
      setPermissionsError(error?.message || 'Rechten laden mislukt.')
    } finally {
      setIsLoadingPermissions(false)
    }
  }

  useEffect(() => {
    if (!hasAccess || activeTab !== 'gebruikersbeheer') {
      return
    }

    loadUsers()
    loadActivationCodes()
  }, [activeTab, hasAccess])

  useEffect(() => {
    if (!hasAccess || (activeTab !== 'gebruikersbeheer' && activeTab !== 'rechtenbeheer')) {
      return
    }

    loadPermissions()
  }, [activeTab, hasAccess])

  useEffect(() => {
    if (!hasAccess || activeTab !== 'ingredient-categories') {
      return
    }

    loadIngredientCategories()
  }, [activeTab, hasAccess])

  useEffect(() => {
    if (!hasAccess || activeTab !== 'semi-finished-categories') {
      return
    }

    loadSemiFinishedCategories()
  }, [activeTab, hasAccess])

  useEffect(() => {
    if (!hasAccess || activeTab !== 'dish-categories') {
      return
    }

    loadDishCategories()
  }, [activeTab, hasAccess])

  useEffect(() => {
    if (!hasAccess || activeTab !== 'menu-categories') {
      return
    }

    loadMenuCategories()
  }, [activeTab, hasAccess])

  async function handleCreateUser(event) {
    event.preventDefault()
    if (isCreatingUser) {
      return
    }

    setCreateUserError('')
    setCreateUserMessage('')
    setUsersMessage('')
    setIsCreatingUser(true)

    try {
      await apiClient.createUser(createForm)
      setCreateForm({
        name: '',
        email: '',
        password: '',
        role: 'Kok'
      })
      setCreateUserMessage('Gebruiker aangemaakt.')
      setUsersMessage('')
      await loadUsers()
    } catch (error) {
      setCreateUserError(error?.message || 'Gebruiker aanmaken mislukt.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  function openCreateUserModal() {
    setCreateUserError('')
    setCreateUserMessage('')
    setIsCreateUserModalOpen(true)
  }

  function closeCreateUserModal() {
    if (isCreatingUser) {
      return
    }
    setIsCreateUserModalOpen(false)
    setCreateUserError('')
    setCreateUserMessage('')
  }

  function openCreateActivationCodeModal() {
    setActivationCodesError('')
    setActivationCodesMessage('')
    setIsCreateActivationCodeModalOpen(true)
  }

  function closeCreateActivationCodeModal() {
    if (isCreatingActivationCode) {
      return
    }
    setIsCreateActivationCodeModalOpen(false)
    setActivationCodesError('')
    setActivationCodesMessage('')
  }

  async function handleCreateActivationCode(event) {
    event.preventDefault()
    if (isCreatingActivationCode) {
      return
    }

    setActivationCodesError('')
    setActivationCodesMessage('')
    setIsCreatingActivationCode(true)

    try {
      const response = await activationCodesFetch('/api/activation-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(activationCodeForm)
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail || `Failed to create activation code: ${response.status}`)
      }

      const payload = await response.json()
      setActivationCodesMessage(`Activatiecode gegenereerd: ${payload.code}`)
      setActivationCodeForm({ role: 'Kok' })
      await loadActivationCodes()
      setIsCreateActivationCodeModalOpen(false)
    } catch (error) {
      setActivationCodesError(error?.message || 'Activatiecode genereren mislukt.')
    } finally {
      setIsCreatingActivationCode(false)
    }
  }

  function handlePermissionToggle(domain, action, permissionRole) {
    setPermissions((current) => {
      const currentRoles = current[domain]?.[action] || []
      const hasRole = currentRoles.includes(permissionRole)
      const nextRoles = hasRole
        ? currentRoles.filter((item) => item !== permissionRole)
        : [...currentRoles, permissionRole]

      return {
        ...current,
        [domain]: {
          ...current[domain],
          [action]: nextRoles
        }
      }
    })
  }

  async function handleSavePermissions() {
    setPermissionsError('')
    setPermissionsMessage('')
    console.log(permissions)

    try {
      const response = await activationCodesFetch('/api/permissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permissions: flattenPermissions(permissions) })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail || `Failed to save permissions: ${response.status}`)
      }

      storePermissionsLocally(permissions)
      setPermissionsMessage('Rechten opgeslagen.')
    } catch (error) {
      setPermissionsError(error?.message || 'Rechten opslaan mislukt.')
    }
  }

  async function handleUserStatusAction(user) {
    if (!user?.id || activeUserActionId || editingUserId || editingPasswordUserId) {
      return
    }

    if (user.is_active && currentUserId && user.id === currentUserId) {
      setUsersError('Je kunt je eigen account hier niet deactiveren.')
      setUsersMessage('')
      return
    }

    const confirmMessage = user.is_active
      ? `Weet je zeker dat je ${user.name || 'deze gebruiker'} wilt deactiveren?`
      : `Weet je zeker dat je ${user.name || 'deze gebruiker'} wilt reactiveren?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    setUsersError('')
    setUsersMessage('')
    setActiveUserActionId(user.id)

    try {
      if (user.is_active) {
        await apiClient.deactivateUser(user.id)
        setUsersMessage('Gebruiker gedeactiveerd.')
      } else {
        await apiClient.reactivateUser(user.id)
        setUsersMessage('Gebruiker gereactiveerd.')
      }
      await loadUsers()
    } catch (error) {
      setUsersError(error?.message || 'Gebruikersstatus wijzigen mislukt.')
    } finally {
      setActiveUserActionId(null)
    }
  }

  function startEditingUser(user) {
    if (!user?.id || activeUserActionId || editingPasswordUserId) {
      return
    }

    setUsersError('')
    setUsersMessage('')
    setEditingUserId(user.id)
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'Kok'
    })
  }

  function cancelEditingUser() {
    setEditingUserId(null)
    setEditForm({
      name: '',
      email: '',
      role: 'Kok'
    })
  }

  function startEditingPassword(user) {
    if (!user?.id || activeUserActionId || editingUserId) {
      return
    }

    setUsersError('')
    setUsersMessage('')
    setEditingPasswordUserId(user.id)
    setPasswordForm({ password: '' })
  }

  function cancelEditingPassword() {
    setEditingPasswordUserId(null)
    setPasswordForm({ password: '' })
  }

  async function handleSaveUserEdit(userId) {
    if (!userId || activeUserActionId || editingPasswordUserId) {
      return
    }

    setUsersError('')
    setUsersMessage('')
    setActiveUserActionId(userId)

    try {
      await apiClient.updateUser(userId, editForm)
      setUsersMessage('Gebruiker bijgewerkt.')
      cancelEditingUser()
      await loadUsers()
    } catch (error) {
      setUsersError(error?.message || 'Gebruiker bijwerken mislukt.')
    } finally {
      setActiveUserActionId(null)
    }
  }

  async function handleSaveUserPassword(userId) {
    if (!userId || activeUserActionId || editingUserId) {
      return
    }

    const targetUser = users.find((user) => user.id === userId)
    const isOwnAccount = Boolean(currentUserId) && userId === currentUserId
    const confirmMessage = isOwnAccount
      ? 'Weet je zeker dat je je eigen wachtwoord wilt wijzigen? Je huidige sessie wordt daarna ongeldig en je moet opnieuw inloggen.'
      : `Weet je zeker dat je een nieuw wachtwoord wilt instellen voor ${targetUser?.name || 'deze gebruiker'}?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    setUsersError('')
    setUsersMessage('')
    setActiveUserActionId(userId)

    try {
      await apiClient.updateUserPassword(userId, passwordForm.password)
      setUsersMessage('Wachtwoord bijgewerkt.')
      cancelEditingPassword()
    } catch (error) {
      setUsersError(error?.message || 'Wachtwoord bijwerken mislukt.')
    } finally {
      setActiveUserActionId(null)
    }
  }

  function startEditingIngredientCategory(category) {
    setIngredientCategoriesError('')
    setIngredientCategoriesMessage('')
    setEditingIngredientCategoryName(category.name || '')
    setIngredientCategoryForm({ name: category.name || '' })
  }

  function cancelEditingIngredientCategory() {
    setEditingIngredientCategoryName('')
    setIngredientCategoryForm({ name: '' })
  }

  async function handleSaveIngredientCategory(currentName) {
    if (!currentName || activeIngredientCategoryActionName) {
      return
    }

    setIngredientCategoriesError('')
    setIngredientCategoriesMessage('')
    setActiveIngredientCategoryActionName(currentName)

    try {
      await apiClient.renameIngredientCategory(currentName, ingredientCategoryForm.name)
      setIngredientCategoriesMessage('Ingrediëntencategorie hernoemd.')
      cancelEditingIngredientCategory()
      await loadIngredientCategories()
    } catch (error) {
      setIngredientCategoriesError(
        error?.message || 'Ingrediëntencategorie hernoemen mislukt.'
      )
    } finally {
      setActiveIngredientCategoryActionName('')
    }
  }

  function startEditingSemiFinishedCategory(category) {
    setSemiFinishedCategoriesError('')
    setSemiFinishedCategoriesMessage('')
    setEditingSemiFinishedCategoryId(category.id || null)
    setSemiFinishedCategoryForm({ name: category.name || '' })
  }

  function cancelEditingSemiFinishedCategory() {
    setEditingSemiFinishedCategoryId(null)
    setSemiFinishedCategoryForm({ name: '' })
  }

  async function handleSaveSemiFinishedCategory(categoryId) {
    if (!categoryId || activeSemiFinishedCategoryActionId) {
      return
    }

    setSemiFinishedCategoriesError('')
    setSemiFinishedCategoriesMessage('')
    setActiveSemiFinishedCategoryActionId(categoryId)

    try {
      await apiClient.updateSemiFinishedCategory(categoryId, {
        name: semiFinishedCategoryForm.name,
      })
      setSemiFinishedCategoriesMessage('Halffabricatencategorie hernoemd.')
      cancelEditingSemiFinishedCategory()
      await loadSemiFinishedCategories()
    } catch (error) {
      setSemiFinishedCategoriesError(
        error?.message || 'Halffabricatencategorie hernoemen mislukt.'
      )
    } finally {
      setActiveSemiFinishedCategoryActionId(null)
    }
  }

  function startEditingSemiFinishedSubcategory(subcategory) {
    setSemiFinishedCategoriesError('')
    setSemiFinishedCategoriesMessage('')
    setEditingSemiFinishedSubcategoryId(subcategory.id || null)
    setSemiFinishedSubcategoryForm({ name: subcategory.name || '' })
  }

  function cancelEditingSemiFinishedSubcategory() {
    setEditingSemiFinishedSubcategoryId(null)
    setSemiFinishedSubcategoryForm({ name: '' })
  }

  async function handleSaveSemiFinishedSubcategory(subcategoryId) {
    if (!subcategoryId || activeSemiFinishedSubcategoryActionId) {
      return
    }

    setSemiFinishedCategoriesError('')
    setSemiFinishedCategoriesMessage('')
    setActiveSemiFinishedSubcategoryActionId(subcategoryId)

    try {
      await apiClient.updateSemiFinishedSubcategory(subcategoryId, {
        name: semiFinishedSubcategoryForm.name,
      })
      setSemiFinishedCategoriesMessage('Halffabricatensubcategorie hernoemd.')
      cancelEditingSemiFinishedSubcategory()
      await loadSemiFinishedCategories()
    } catch (error) {
      setSemiFinishedCategoriesError(
        error?.message || 'Halffabricatensubcategorie hernoemen mislukt.'
      )
    } finally {
      setActiveSemiFinishedSubcategoryActionId(null)
    }
  }

  function startEditingDishCategory(category) {
    setDishCategoriesError('')
    setDishCategoriesMessage('')
    setEditingDishCategoryId(category.id || null)
    setDishCategoryForm({ name: category.name || '' })
  }

  function cancelEditingDishCategory() {
    setEditingDishCategoryId(null)
    setDishCategoryForm({ name: '' })
  }

  async function handleSaveDishCategory(categoryId) {
    if (!categoryId || activeDishCategoryActionId) {
      return
    }

    setDishCategoriesError('')
    setDishCategoriesMessage('')
    setActiveDishCategoryActionId(categoryId)

    try {
      await apiClient.updateDishCategory(categoryId, {
        name: dishCategoryForm.name,
      })
      setDishCategoriesMessage('Gerechtencategorie hernoemd.')
      cancelEditingDishCategory()
      await loadDishCategories()
    } catch (error) {
      setDishCategoriesError(
        error?.message || 'Gerechtencategorie hernoemen mislukt.'
      )
    } finally {
      setActiveDishCategoryActionId(null)
    }
  }

  function startEditingDishSubcategory(subcategory) {
    setDishCategoriesError('')
    setDishCategoriesMessage('')
    setEditingDishSubcategoryId(subcategory.id || null)
    setDishSubcategoryForm({ name: subcategory.name || '' })
  }

  function cancelEditingDishSubcategory() {
    setEditingDishSubcategoryId(null)
    setDishSubcategoryForm({ name: '' })
  }

  async function handleSaveDishSubcategory(subcategoryId) {
    if (!subcategoryId || activeDishSubcategoryActionId) {
      return
    }

    setDishCategoriesError('')
    setDishCategoriesMessage('')
    setActiveDishSubcategoryActionId(subcategoryId)

    try {
      await apiClient.updateDishSubcategory(subcategoryId, {
        name: dishSubcategoryForm.name,
      })
      setDishCategoriesMessage('Gerechtensubcategorie hernoemd.')
      cancelEditingDishSubcategory()
      await loadDishCategories()
    } catch (error) {
      setDishCategoriesError(
        error?.message || 'Gerechtensubcategorie hernoemen mislukt.'
      )
    } finally {
      setActiveDishSubcategoryActionId(null)
    }
  }

  function startEditingMenuCategory(category) {
    setMenuCategoriesError('')
    setMenuCategoriesMessage('')
    setEditingMenuCategoryId(category.id || null)
    setMenuCategoryForm({ name: category.name || '' })
  }

  function cancelEditingMenuCategory() {
    setEditingMenuCategoryId(null)
    setMenuCategoryForm({ name: '' })
  }

  async function handleSaveMenuCategory(categoryId) {
    if (!categoryId || activeMenuCategoryActionId) {
      return
    }

    setMenuCategoriesError('')
    setMenuCategoriesMessage('')
    setActiveMenuCategoryActionId(categoryId)

    try {
      await apiClient.updateMenukaartCategory(categoryId, {
        name: menuCategoryForm.name,
      })
      setMenuCategoriesMessage('Menukaartcategorie hernoemd.')
      cancelEditingMenuCategory()
      await loadMenuCategories()
    } catch (error) {
      setMenuCategoriesError(
        error?.message || 'Menukaartcategorie hernoemen mislukt.'
      )
    } finally {
      setActiveMenuCategoryActionId(null)
    }
  }

  return (
    <div>
      <header className="page-header">
        <h2>Instellingen</h2>
        <p>Beheer hier de instellingen van KitchenControl per onderdeel.</p>
      </header>

      {!hasAccess ? (
        <section className="card">
          <h3>Instellingen</h3>
          <p>Je hebt geen toegang tot deze pagina.</p>
        </section>
      ) : (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="table-action-btn"
                onClick={() => setActiveTab(tab.id)}
                style={activeTab === tab.id ? { background: '#e5eefc', borderColor: '#93c5fd' } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              background: '#fafafa',
              padding: '1rem'
            }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>{activeTabRecord.label}</h3>
            {isUsersTab ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gap: '0.75rem',
                    padding: '1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    background: '#fff'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      <h4 style={{ margin: 0 }}>Gebruikersbeheer</h4>
                      <p style={{ margin: 0, color: '#6b7280' }}>
                        Beheer medewerkers en accountacties vanuit een centraal overzicht.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button type="button" className="primary-btn" onClick={openCreateUserModal}>
                        Nieuwe medewerker aanmaken
                      </button>
                      <button type="button" className="table-action-btn" onClick={openCreateActivationCodeModal}>
                        Activatiecode genereren
                      </button>
                    </div>
                  </div>
                </div>
                {usersMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {usersMessage}
                  </p>
                ) : null}
                {usersError ? <p style={{ margin: 0, color: '#b91c1c' }}>{usersError}</p> : null}
                <h4 style={{ margin: 0 }}>Gebruikersoverzicht</h4>
                {isLoadingUsers ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>Gebruikers laden...</p>
                ) : users.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>Nog geen gebruikers gevonden.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Naam</th>
                          <th>E-mail</th>
                          <th>Rol</th>
                          <th>Status</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => {
                          const isEditing = editingUserId === user.id
                          const isEditingPassword = editingPasswordUserId === user.id
                          const isBusy = activeUserActionId === user.id

                          return (
                            <tr key={user.id}>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(event) =>
                                      setEditForm((current) => ({ ...current, name: event.target.value }))
                                    }
                                    disabled={isBusy}
                                  />
                                ) : (
                                  user.name || '-'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={(event) =>
                                      setEditForm((current) => ({ ...current, email: event.target.value }))
                                    }
                                    disabled={isBusy}
                                  />
                                ) : (
                                  user.email || '-'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <select
                                    value={editForm.role}
                                    onChange={(event) =>
                                      setEditForm((current) => ({ ...current, role: event.target.value }))
                                    }
                                    disabled={isBusy}
                                  >
                                    <option value="Supervisor">Supervisor</option>
                                    <option value="Chef">Chef</option>
                                    <option value="Kok">Kok</option>
                                    <option value="Keukenhulp">Keukenhulp</option>
                                    <option value="Bediening">Bediening</option>
                                  </select>
                                ) : (
                                  user.role || '-'
                                )}
                              </td>
                              <td>{user.is_active ? 'Actief' : 'Inactief'}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleSaveUserEdit(user.id)}
                                        disabled={isBusy}
                                      >
                                        {isBusy ? 'Opslaan...' : 'Opslaan'}
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={cancelEditingUser}
                                        disabled={isBusy}
                                      >
                                        Annuleren
                                      </button>
                                    </>
                                  ) : isEditingPassword ? (
                                    <>
                                      <input
                                        type="password"
                                        value={passwordForm.password}
                                        onChange={(event) => setPasswordForm({ password: event.target.value })}
                                        disabled={isBusy}
                                        placeholder="Nieuw wachtwoord"
                                      />
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleSaveUserPassword(user.id)}
                                        disabled={isBusy}
                                      >
                                        {isBusy ? 'Opslaan...' : 'Opslaan'}
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={cancelEditingPassword}
                                        disabled={isBusy}
                                      >
                                        Annuleren
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={() => startEditingUser(user)}
                                        title="Gebruiker bewerken"
                                        aria-label={`Bewerk ${user.name || 'gebruiker'}`}
                                        disabled={
                                          isLoadingUsers ||
                                          Boolean(activeUserActionId) ||
                                          Boolean(editingPasswordUserId)
                                        }
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={() => startEditingPassword(user)}
                                        title="Nieuw wachtwoord instellen"
                                        aria-label={`Nieuw wachtwoord voor ${user.name || 'gebruiker'}`}
                                        disabled={
                                          isLoadingUsers ||
                                          Boolean(activeUserActionId) ||
                                          Boolean(editingUserId)
                                        }
                                      >
                                        🔑
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={() => handleUserStatusAction(user)}
                                        title={user.is_active ? 'Gebruiker deactiveren' : 'Gebruiker reactiveren'}
                                        aria-label={
                                          user.is_active
                                            ? `Deactiveer ${user.name || 'gebruiker'}`
                                            : `Reactiveer ${user.name || 'gebruiker'}`
                                        }
                                        disabled={
                                          isLoadingUsers ||
                                          Boolean(activeUserActionId) ||
                                          Boolean(editingUserId) ||
                                          Boolean(editingPasswordUserId)
                                        }
                                      >
                                        {isBusy
                                          ? 'Bezig...'
                                          : user.is_active
                                            ? '⛔'
                                            : '♻️'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {activationCodesMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {activationCodesMessage}
                  </p>
                ) : null}
                {activationCodesError ? (
                  <p style={{ margin: 0, color: '#b91c1c' }}>{activationCodesError}</p>
                ) : null}
                <h4 style={{ margin: 0 }}>Open activatiecodes</h4>
                {isLoadingActivationCodes ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>Activatiecodes laden...</p>
                ) : openActivationCodes.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>Nog geen open activatiecodes gevonden.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Rol</th>
                          <th>Aangemaakt op</th>
                          <th>Verloopt op</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openActivationCodes.map((item) => (
                          <tr key={item.id}>
                            <td>{item.code || '-'}</td>
                            <td>{item.role || '-'}</td>
                            <td>{formatDateTime(item.created_at)}</td>
                            <td>{formatDateTime(item.expires_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <h4 style={{ margin: 0 }}>Gebruikte activatiecodes</h4>
                {isLoadingActivationCodes ? null : usedActivationCodes.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>Nog geen gebruikte activatiecodes gevonden.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Rol</th>
                          <th>Gebruikt op</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usedActivationCodes.map((item) => (
                          <tr key={item.id}>
                            <td>{item.code || '-'}</td>
                            <td>{item.role || '-'}</td>
                            <td>{formatDateTime(item.used_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : isPermissionsTab ? (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <h4 style={{ margin: 0 }}>Rechtenbeheer</h4>
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Stel in welke rollen welke acties mogen uitvoeren per onderdeel.
                  </p>
                </div>

                {permissionsMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {permissionsMessage}
                  </p>
                ) : null}
                {permissionsError ? (
                  <p style={{ margin: 0, color: '#b91c1c' }}>{permissionsError}</p>
                ) : null}
                {isLoadingPermissions ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>Rechten laden...</p>
                ) : null}

                {Object.entries(PERMISSION_DOMAIN_LABELS).map(([domainKey, domainLabel]) => (
                  <div
                    key={domainKey}
                    style={{
                      display: 'grid',
                      gap: '0.75rem',
                      padding: '1rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      background: '#fff'
                    }}
                  >
                    <h4 style={{ margin: 0 }}>{domainLabel}</h4>
                    <div className="table-scroll">
                      <table className="ingredients-table">
                        <thead>
                          <tr>
                            <th>Actie</th>
                            {PERMISSION_ROLES.map((permissionRole) => (
                              <th key={permissionRole}>{permissionRole}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERMISSION_ACTIONS.map((action) => (
                            <tr key={`${domainKey}-${action}`}>
                              <td style={{ textTransform: 'capitalize' }}>{action}</td>
                              {PERMISSION_ROLES.map((permissionRole) => (
                                <td key={`${domainKey}-${action}-${permissionRole}`} style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={(permissions[domainKey]?.[action] || []).includes(permissionRole)}
                                    onChange={() => handlePermissionToggle(domainKey, action, permissionRole)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="primary-btn" onClick={handleSavePermissions}>
                    Opslaan
                  </button>
                </div>
              </div>
            ) : isIngredientCategoriesTab ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {ingredientCategoriesMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {ingredientCategoriesMessage}
                  </p>
                ) : null}
                {ingredientCategoriesError ? (
                  <p style={{ margin: 0, color: '#b91c1c' }}>{ingredientCategoriesError}</p>
                ) : null}
                {isLoadingIngredientCategories ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Ingrediëntencategorieën laden...
                  </p>
                ) : ingredientCategories.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Nog geen ingrediëntencategorieën gevonden.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Naam</th>
                          <th>Aantal ingrediënten</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ingredientCategories.map((category) => {
                          const isEditing =
                            editingIngredientCategoryName === category.name
                          const isBusy =
                            activeIngredientCategoryActionName === category.name

                          return (
                            <tr key={category.name}>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={ingredientCategoryForm.name}
                                    onChange={(event) =>
                                      setIngredientCategoryForm({ name: event.target.value })
                                    }
                                    disabled={isBusy}
                                  />
                                ) : (
                                  category.name || '-'
                                )}
                              </td>
                              <td>{category.ingredient_count ?? 0}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleSaveIngredientCategory(category.name)}
                                        disabled={isBusy}
                                      >
                                        {isBusy ? 'Opslaan...' : 'Opslaan'}
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={cancelEditingIngredientCategory}
                                        disabled={isBusy}
                                      >
                                        Annuleren
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => startEditingIngredientCategory(category)}
                                      disabled={
                                        isLoadingIngredientCategories ||
                                        Boolean(activeIngredientCategoryActionName)
                                      }
                                    >
                                      Bewerken
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : isSemiFinishedCategoriesTab ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {semiFinishedCategoriesMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {semiFinishedCategoriesMessage}
                  </p>
                ) : null}
                {semiFinishedCategoriesError ? (
                  <p style={{ margin: 0, color: '#b91c1c' }}>{semiFinishedCategoriesError}</p>
                ) : null}
                {isLoadingSemiFinishedCategories ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Halffabricatencategorieën laden...
                  </p>
                ) : semiFinishedCategories.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Nog geen halffabricatencategorieën gevonden.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Naam</th>
                          <th>Aantal subcategorieën</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semiFinishedCategories.map((category) => {
                          const isEditing = editingSemiFinishedCategoryId === category.id
                          const isBusy = activeSemiFinishedCategoryActionId === category.id
                          const subcategories = Array.isArray(category.subcategories)
                            ? category.subcategories
                            : []

                          return (
                            <tr key={category.id}>
                              <td>
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                  <div>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={semiFinishedCategoryForm.name}
                                        onChange={(event) =>
                                          setSemiFinishedCategoryForm({ name: event.target.value })
                                        }
                                        disabled={isBusy}
                                      />
                                    ) : (
                                      category.name || '-'
                                    )}
                                  </div>
                                  {subcategories.length > 0 ? (
                                    <div
                                      style={{
                                        display: 'grid',
                                        gap: '0.35rem',
                                        paddingLeft: '0.75rem',
                                      }}
                                    >
                                      {subcategories.map((subcategory) => {
                                        const isEditingSubcategory =
                                          editingSemiFinishedSubcategoryId === subcategory.id
                                        const isBusySubcategory =
                                          activeSemiFinishedSubcategoryActionId === subcategory.id

                                        return (
                                          <div
                                            key={subcategory.id}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.5rem',
                                              flexWrap: 'wrap',
                                            }}
                                          >
                                            <span
                                              style={{
                                                color: '#6b7280',
                                                minWidth: '1rem',
                                              }}
                                            >
                                              -
                                            </span>
                                            {isEditingSubcategory ? (
                                              <input
                                                type="text"
                                                value={semiFinishedSubcategoryForm.name}
                                                onChange={(event) =>
                                                  setSemiFinishedSubcategoryForm({
                                                    name: event.target.value,
                                                  })
                                                }
                                                disabled={isBusySubcategory}
                                                style={{ minWidth: '14rem' }}
                                              />
                                            ) : (
                                              <span>{subcategory.name || '-'}</span>
                                            )}
                                            <div
                                              style={{
                                                display: 'flex',
                                                gap: '0.5rem',
                                                flexWrap: 'wrap',
                                              }}
                                            >
                                              {isEditingSubcategory ? (
                                                <>
                                                  <button
                                                    type="button"
                                                    className="primary-btn"
                                                    onClick={() =>
                                                      handleSaveSemiFinishedSubcategory(
                                                        subcategory.id
                                                      )
                                                    }
                                                    disabled={isBusySubcategory}
                                                  >
                                                    {isBusySubcategory ? 'Opslaan...' : 'Opslaan'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="table-action-btn"
                                                    onClick={cancelEditingSemiFinishedSubcategory}
                                                    disabled={isBusySubcategory}
                                                  >
                                                    Annuleren
                                                  </button>
                                                </>
                                              ) : (
                                                <button
                                                  type="button"
                                                  className="table-action-btn"
                                                  onClick={() =>
                                                    startEditingSemiFinishedSubcategory(subcategory)
                                                  }
                                                  disabled={
                                                    isLoadingSemiFinishedCategories ||
                                                    Boolean(activeSemiFinishedSubcategoryActionId)
                                                  }
                                                >
                                                  Bewerken
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td>{subcategories.length}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleSaveSemiFinishedCategory(category.id)}
                                        disabled={isBusy}
                                      >
                                        {isBusy ? 'Opslaan...' : 'Opslaan'}
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={cancelEditingSemiFinishedCategory}
                                        disabled={isBusy}
                                      >
                                        Annuleren
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => startEditingSemiFinishedCategory(category)}
                                      disabled={
                                        isLoadingSemiFinishedCategories ||
                                        Boolean(activeSemiFinishedCategoryActionId)
                                      }
                                    >
                                      Bewerken
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : isDishCategoriesTab ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {dishCategoriesMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {dishCategoriesMessage}
                  </p>
                ) : null}
                {dishCategoriesError ? (
                  <p style={{ margin: 0, color: '#b91c1c' }}>{dishCategoriesError}</p>
                ) : null}
                {isLoadingDishCategories ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Gerechtencategorieën laden...
                  </p>
                ) : dishCategories.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Nog geen gerechtencategorieën gevonden.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Naam</th>
                          <th>Aantal subcategorieën</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dishCategories.map((category) => {
                          const isEditing = editingDishCategoryId === category.id
                          const isBusy = activeDishCategoryActionId === category.id
                          const subcategories = Array.isArray(category.subcategories)
                            ? category.subcategories
                            : []

                          return (
                            <tr key={category.id}>
                              <td>
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                  <div>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={dishCategoryForm.name}
                                        onChange={(event) =>
                                          setDishCategoryForm({ name: event.target.value })
                                        }
                                        disabled={isBusy}
                                      />
                                    ) : (
                                      category.name || '-'
                                    )}
                                  </div>
                                  {subcategories.length > 0 ? (
                                    <div
                                      style={{
                                        display: 'grid',
                                        gap: '0.35rem',
                                        paddingLeft: '0.75rem',
                                      }}
                                    >
                                      {subcategories.map((subcategory) => {
                                        const isEditingSubcategory =
                                          editingDishSubcategoryId === subcategory.id
                                        const isBusySubcategory =
                                          activeDishSubcategoryActionId === subcategory.id

                                        return (
                                          <div
                                            key={subcategory.id}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.5rem',
                                              flexWrap: 'wrap',
                                            }}
                                          >
                                            <span
                                              style={{
                                                color: '#6b7280',
                                                minWidth: '1rem',
                                              }}
                                            >
                                              -
                                            </span>
                                            {isEditingSubcategory ? (
                                              <input
                                                type="text"
                                                value={dishSubcategoryForm.name}
                                                onChange={(event) =>
                                                  setDishSubcategoryForm({
                                                    name: event.target.value,
                                                  })
                                                }
                                                disabled={isBusySubcategory}
                                                style={{ minWidth: '14rem' }}
                                              />
                                            ) : (
                                              <span>{subcategory.name || '-'}</span>
                                            )}
                                            <div
                                              style={{
                                                display: 'flex',
                                                gap: '0.5rem',
                                                flexWrap: 'wrap',
                                              }}
                                            >
                                              {isEditingSubcategory ? (
                                                <>
                                                  <button
                                                    type="button"
                                                    className="primary-btn"
                                                    onClick={() =>
                                                      handleSaveDishSubcategory(subcategory.id)
                                                    }
                                                    disabled={isBusySubcategory}
                                                  >
                                                    {isBusySubcategory ? 'Opslaan...' : 'Opslaan'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="table-action-btn"
                                                    onClick={cancelEditingDishSubcategory}
                                                    disabled={isBusySubcategory}
                                                  >
                                                    Annuleren
                                                  </button>
                                                </>
                                              ) : (
                                                <button
                                                  type="button"
                                                  className="table-action-btn"
                                                  onClick={() =>
                                                    startEditingDishSubcategory(subcategory)
                                                  }
                                                  disabled={
                                                    isLoadingDishCategories ||
                                                    Boolean(activeDishSubcategoryActionId)
                                                  }
                                                >
                                                  Bewerken
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td>{subcategories.length}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleSaveDishCategory(category.id)}
                                        disabled={isBusy}
                                      >
                                        {isBusy ? 'Opslaan...' : 'Opslaan'}
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={cancelEditingDishCategory}
                                        disabled={isBusy}
                                      >
                                        Annuleren
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => startEditingDishCategory(category)}
                                      disabled={
                                        isLoadingDishCategories ||
                                        Boolean(activeDishCategoryActionId)
                                      }
                                    >
                                      Bewerken
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : isMenuCategoriesTab ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {menuCategoriesMessage ? (
                  <p className="form-info inline-message" style={{ margin: 0 }}>
                    {menuCategoriesMessage}
                  </p>
                ) : null}
                {menuCategoriesError ? (
                  <p style={{ margin: 0, color: '#b91c1c' }}>{menuCategoriesError}</p>
                ) : null}
                {isLoadingMenuCategories ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Menukaartcategorieën laden...
                  </p>
                ) : menuCategories.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    Nog geen menukaartcategorieën gevonden.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="ingredients-table">
                      <thead>
                        <tr>
                          <th>Naam</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {menuCategories.map((category) => {
                          const isEditing = editingMenuCategoryId === category.id
                          const isBusy = activeMenuCategoryActionId === category.id

                          return (
                            <tr key={category.id}>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={menuCategoryForm.name}
                                    onChange={(event) =>
                                      setMenuCategoryForm({ name: event.target.value })
                                    }
                                    disabled={isBusy}
                                  />
                                ) : (
                                  category.name || '-'
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => handleSaveMenuCategory(category.id)}
                                        disabled={isBusy}
                                      >
                                        {isBusy ? 'Opslaan...' : 'Opslaan'}
                                      </button>
                                      <button
                                        type="button"
                                        className="table-action-btn"
                                        onClick={cancelEditingMenuCategory}
                                        disabled={isBusy}
                                      >
                                        Annuleren
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-action-btn"
                                      onClick={() => startEditingMenuCategory(category)}
                                      disabled={
                                        isLoadingMenuCategories ||
                                        Boolean(activeMenuCategoryActionId)
                                      }
                                    >
                                      Bewerken
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, color: '#6b7280' }}>
                Placeholder voor {activeTabRecord.label.toLowerCase()}.
              </p>
            )}
          </div>
        </section>
      )}

      {isCreateUserModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Nieuwe medewerker aanmaken">
          <div className="modal-card modal-wide sfp-modal">
            <div className="modal-header">
              <h3>Nieuwe medewerker aanmaken</h3>
            </div>

            <div className="modal-body">
              {createUserError ? <div className="modal-validation-banner">{createUserError}</div> : null}
              {createUserMessage ? (
                <p className="form-info inline-message">{createUserMessage}</p>
              ) : null}

              <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: '1rem' }}>
                <section className="modal-section">
                  <h4>Basis</h4>
                  <div className="modal-grid two-col calm-grid">
                    <label>
                      Naam
                      <input
                        type="text"
                        value={createForm.name}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, name: event.target.value }))
                        }
                        disabled={isCreatingUser}
                      />
                    </label>
                    <label>
                      E-mail
                      <input
                        type="email"
                        value={createForm.email}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, email: event.target.value }))
                        }
                        disabled={isCreatingUser}
                      />
                    </label>
                    <label>
                      Wachtwoord
                      <input
                        type="password"
                        value={createForm.password}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, password: event.target.value }))
                        }
                        disabled={isCreatingUser}
                      />
                    </label>
                    <label>
                      Rol
                      <select
                        value={createForm.role}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, role: event.target.value }))
                        }
                        disabled={isCreatingUser}
                      >
                        <option value="Supervisor">Supervisor</option>
                        <option value="Chef">Chef</option>
                        <option value="Kok">Kok</option>
                        <option value="Keukenhulp">Keukenhulp</option>
                        <option value="Bediening">Bediening</option>
                      </select>
                    </label>
                  </div>
                </section>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="table-action-btn"
                    onClick={closeCreateUserModal}
                    disabled={isCreatingUser}
                  >
                    Sluiten
                  </button>
                  <button type="submit" className="primary-btn" disabled={isCreatingUser}>
                    {isCreatingUser ? 'Aanmaken...' : 'Gebruiker aanmaken'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateActivationCodeModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Activatiecode genereren">
          <div className="modal-card modal-wide sfp-modal">
            <div className="modal-header">
              <h3>Activatiecode genereren</h3>
            </div>

            <div className="modal-body">
              {activationCodesError ? <div className="modal-validation-banner">{activationCodesError}</div> : null}

              <form onSubmit={handleCreateActivationCode} style={{ display: 'grid', gap: '1rem' }}>
                <section className="modal-section">
                  <h4>Basis</h4>
                  <div className="modal-grid two-col calm-grid">
                    <label>
                      Rol
                      <select
                        value={activationCodeForm.role}
                        onChange={(event) =>
                          setActivationCodeForm({ role: event.target.value })
                        }
                        disabled={isCreatingActivationCode}
                      >
                        <option value="Supervisor">Supervisor</option>
                        <option value="Chef">Chef</option>
                        <option value="Kok">Kok</option>
                        <option value="Keukenhulp">Keukenhulp</option>
                        <option value="Bediening">Bediening</option>
                      </select>
                    </label>
                  </div>
                </section>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="table-action-btn"
                    onClick={closeCreateActivationCodeModal}
                    disabled={isCreatingActivationCode}
                  >
                    Sluiten
                  </button>
                  <button type="submit" className="primary-btn" disabled={isCreatingActivationCode}>
                    {isCreatingActivationCode ? 'Genereren...' : 'Genereren'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
