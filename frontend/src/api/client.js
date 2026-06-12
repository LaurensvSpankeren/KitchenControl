export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
export const AUTH_UNAUTHORIZED_EVENT = 'kc:auth:unauthorized'
const AUTH_TOKEN_STORAGE_KEY = 'kc_auth_token'
const AUTH_USER_STORAGE_KEY = 'currentUser'

function getStoredAuthToken() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
}

function setStoredAuthToken(token) {
  if (typeof window === 'undefined') {
    return
  }
  if (!token) {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
}

function setStoredAuthUser(user) {
  if (typeof window === 'undefined') {
    return
  }
  if (!user) {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
}

function clearStoredAuthSession() {
  setStoredAuthToken('')
  setStoredAuthUser(null)
}

function notifyUnauthorizedSession() {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new window.Event(AUTH_UNAUTHORIZED_EVENT))
}

function buildAuthHeaders(token = getStoredAuthToken()) {
  if (!token) {
    return {}
  }
  return {
    Authorization: `Bearer ${token}`
  }
}

async function apiFetch(url, options = {}) {
  const { headers, ...rest } = options
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...buildAuthHeaders(),
      ...(headers || {})
    }
  })

  const shouldHandleUnauthorized =
    response.status === 401 &&
    !String(url).includes('/api/auth/login') &&
    Boolean(getStoredAuthToken())

  if (shouldHandleUnauthorized) {
    clearStoredAuthSession()
    notifyUnauthorizedSession()
  }

  return response
}

export const apiClient = {
  getAuthToken() {
    return getStoredAuthToken()
  },
  setAuthSession(token, user) {
    setStoredAuthToken(token)
    setStoredAuthUser(user)
  },
  clearAuthSession() {
    clearStoredAuthSession()
  },
  async login(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to login: ${response.status}`)
    }
    return response.json()
  },
  async logout(token = getStoredAuthToken()) {
    const response = await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(token)
      }
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to logout: ${response.status}`)
    }
    return response.json()
  },
  async getMe(token = getStoredAuthToken()) {
    const response = await apiFetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        ...buildAuthHeaders(token)
      }
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const error = new Error(errorData?.detail || `Failed to fetch me: ${response.status}`)
      error.status = response.status
      throw error
    }
    return response.json()
  },
  async getUsers() {
    const response = await apiFetch(`${API_BASE_URL}/api/users`)
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`)
    }
    return response.json()
  },
  async getIngredientCategories() {
    const response = await apiFetch(`${API_BASE_URL}/api/ingredient-categories`)
    if (!response.ok) {
      throw new Error(`Failed to fetch ingredient categories: ${response.status}`)
    }
    return response.json()
  },
  async renameIngredientCategory(currentName, name) {
    const response = await apiFetch(`${API_BASE_URL}/api/ingredient-categories/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ current_name: currentName, name })
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to rename ingredient category: ${response.status}`)
    }
    return response.json()
  },
  async createUser(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to create user: ${response.status}`)
    }
    return response.json()
  },
  async deactivateUser(userId) {
    const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}/deactivate`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to deactivate user: ${response.status}`)
    }
    return response.json()
  },
  async reactivateUser(userId) {
    const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}/reactivate`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to reactivate user: ${response.status}`)
    }
    return response.json()
  },
  async updateUser(userId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update user: ${response.status}`)
    }
    return response.json()
  },
  async updateUserPassword(userId, password) {
    const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update user password: ${response.status}`)
    }
    return response.json()
  },
  async getIngredients() {
    const response = await apiFetch(`${API_BASE_URL}/api/ingredients`)
    if (!response.ok) {
      throw new Error(`Failed to fetch ingredients: ${response.status}`)
    }
    return response.json()
  },
  async getIngredient(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/ingredients/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch ingredient: ${response.status}`)
    }
    return response.json()
  },
  async createIngredient(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/ingredients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create ingredient: ${response.status}`)
    }
    return response.json()
  },
  async createManualIngredient(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create manual ingredient: ${response.status}`)
    }
    return response.json()
  },
  async updateIngredient(id, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/ingredients/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to update ingredient: ${response.status}`)
    }
    return response.json()
  },
  async importIngredientsCsv(file) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiFetch(`${API_BASE_URL}/api/imports/ingredients`, {
      method: 'POST',
      body: formData
    })
    if (!response.ok) {
      throw new Error(`Failed to import ingredients: ${response.status}`)
    }
    return response.json()
  },
  async getLatestGoogleDriveCsv() {
    const response = await apiFetch(`${API_BASE_URL}/api/imports/google-drive/latest`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to check Google Drive: ${response.status}`)
    }
    return response.json()
  },
  async importGoogleDriveCsv(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/imports/google-drive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to import Google Drive CSV: ${response.status}`)
    }
    return response.json()
  },
  async getImportIssues(params = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) {
      searchParams.set('status', params.status)
    }
    if (params.issue_type) {
      searchParams.set('issue_type', params.issue_type)
    }
    const query = searchParams.toString()
    const response = await apiFetch(
      `${API_BASE_URL}/api/import-issues${query ? `?${query}` : ''}`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch import issues: ${response.status}`)
    }
    return response.json()
  },
  async getImportIssue(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/import-issues/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch import issue: ${response.status}`)
    }
    return response.json()
  },
  async resolveImportIssue(id, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/import-issues/${id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to resolve import issue: ${response.status}`)
    }
    return response.json()
  },
  async getManualIngredientsForReview() {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/review`)
    if (!response.ok) {
      throw new Error(`Failed to fetch manual ingredients for review: ${response.status}`)
    }
    return response.json()
  },
  async getManualIngredientsWithMatches() {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/matches`)
    if (!response.ok) {
      throw new Error(`Failed to fetch manual ingredients with matches: ${response.status}`)
    }
    return response.json()
  },
  async getManualIngredientMatchDebug(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/${id}/match-debug`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to fetch manual ingredient match debug: ${response.status}`)
    }
    return response.json()
  },
  async getStaleImportIngredients() {
    const response = await apiFetch(`${API_BASE_URL}/api/import-ingredients/stale`)
    if (!response.ok) {
      throw new Error(`Failed to fetch stale import ingredients: ${response.status}`)
    }
    return response.json()
  },
  async getImportAlertCount() {
    const response = await apiFetch(`${API_BASE_URL}/api/import-alerts/count`)
    if (!response.ok) {
      throw new Error(`Failed to fetch import alert count: ${response.status}`)
    }
    return response.json()
  },
  async getImportSignals() {
    const response = await apiFetch(`${API_BASE_URL}/api/import-signals`)
    if (!response.ok) {
      throw new Error(`Failed to fetch import signals: ${response.status}`)
    }
    return response.json()
  },
  async acknowledgeImportSignal(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/import-signals/${id}/acknowledge`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to acknowledge import signal: ${response.status}`)
    }
    return response.json()
  },
  async getMenukaarten() {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten`)
    if (!response.ok) {
      throw new Error(`Failed to fetch menukaarten: ${response.status}`)
    }
    return response.json()
  },
  async getArchivedMenukaarten() {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/archived`)
    if (!response.ok) {
      throw new Error(`Failed to fetch archived menukaarten: ${response.status}`)
    }
    return response.json()
  },
  async createMenukaart(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create menukaart: ${response.status}`)
    }
    return response.json()
  },
  async updateMenukaart(id, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to update menukaart: ${response.status}`)
    }
    return response.json()
  },
  async archiveMenukaart(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to archive menukaart: ${response.status}`)
    }
    return response.json()
  },
  async restoreMenukaart(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${id}/restore`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to restore menukaart: ${response.status}`)
    }
    return response.json()
  },
  async deleteMenukaart(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete menukaart: ${response.status}`)
    }
    return response.json()
  },
  async duplicateMenukaart(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${id}/duplicate`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`Failed to duplicate menukaart: ${response.status}`)
    }
    return response.json()
  },
  async getMenukaart(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch menukaart detail: ${response.status}`)
    }
    return response.json()
  },
  async getMenukaartCategories() {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaart-categories`)
    if (!response.ok) {
      throw new Error(`Failed to fetch menukaart categories: ${response.status}`)
    }
    return response.json()
  },
  async createMenukaartCategory(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaart-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create menukaart category: ${response.status}`)
    }
    return response.json()
  },
  async updateMenukaartCategory(categoryId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaart-categories/${categoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update menukaart category: ${response.status}`)
    }
    return response.json()
  },
  async createMenukaartSectie(menukaartId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/secties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to create menukaart section: ${response.status}`)
    }
    return response.json()
  },
  async updateMenukaartSectie(menukaartId, sectieId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/secties/${sectieId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update menukaart section: ${response.status}`)
    }
    return response.json()
  },
  async deleteMenukaartSectie(menukaartId, sectieId) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/secties/${sectieId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to delete menukaart section: ${response.status}`)
    }
    return response.json()
  },
  async moveMenukaartSectieUp(menukaartId, sectieId) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/secties/${sectieId}/move-up`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to move menukaart section up: ${response.status}`)
    }
    return response.json()
  },
  async moveMenukaartSectieDown(menukaartId, sectieId) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/secties/${sectieId}/move-down`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to move menukaart section down: ${response.status}`)
    }
    return response.json()
  },
  async addGerechtToMenukaart(menukaartId, gerechtId, menukaartSectieId) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/gerechten`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        gerecht_id: gerechtId,
        menukaart_sectie_id: menukaartSectieId
      })
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to add dish to menukaart: ${response.status}`)
    }
    return response.json()
  },
  async moveMenukaartGerechtUp(menukaartId, sectieId, gerechtId) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/menukaarten/${menukaartId}/secties/${sectieId}/gerechten/${gerechtId}/move-up`,
      {
        method: 'POST'
      }
    )
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to move dish up in menukaart: ${response.status}`)
    }
    return response.json()
  },
  async moveMenukaartGerechtDown(menukaartId, sectieId, gerechtId) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/menukaarten/${menukaartId}/secties/${sectieId}/gerechten/${gerechtId}/move-down`,
      {
        method: 'POST'
      }
    )
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to move dish down in menukaart: ${response.status}`)
    }
    return response.json()
  },
  async moveMenukaartGerechtToSectie(menukaartId, gerechtId, menukaartSectieId) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/gerechten/${gerechtId}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        menukaart_sectie_id: menukaartSectieId
      })
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to move dish to another section: ${response.status}`)
    }
    return response.json()
  },
  async removeGerechtFromMenukaart(menukaartId, gerechtId) {
    const response = await apiFetch(`${API_BASE_URL}/api/menukaarten/${menukaartId}/gerechten/${gerechtId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to remove dish from menukaart: ${response.status}`)
    }
    return response.json()
  },
  async reviewManualIngredient(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/${id}/review`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to review manual ingredient: ${response.status}`)
    }
    return response.json()
  },
  async getManualIngredientUsageCheck(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/${id}/usage-check`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to check manual ingredient usage: ${response.status}`)
    }
    return response.json()
  },
  async archiveManualIngredient(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/${id}/archive`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to archive manual ingredient: ${response.status}`)
    }
    return response.json()
  },
  async deleteManualIngredient(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const error = new Error(errorData?.detail || `Failed to delete manual ingredient: ${response.status}`)
      error.status = response.status
      error.data = errorData
      throw error
    }
    return response.json()
  },
  async linkManualIngredientToImport(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/manual-ingredients/${id}/link-import`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to link manual ingredient: ${response.status}`)
    }
    return response.json()
  },
  async archiveImportIngredient(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/import-ingredients/${id}/archive`, {
      method: 'POST'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to archive import ingredient: ${response.status}`)
    }
    return response.json()
  },
  async getImportIngredientUsageCheck(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/import-ingredients/${id}/usage-check`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to check import ingredient usage: ${response.status}`)
    }
    return response.json()
  },
  async deleteImportIngredient(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/import-ingredients/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const error = new Error(errorData?.detail || `Failed to delete import ingredient: ${response.status}`)
      error.status = response.status
      error.data = errorData
      throw error
    }
    return response.json()
  },
  async getSemiFinishedProducts() {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished products: ${response.status}`)
    }
    return response.json()
  },
  async getArchivedSemiFinishedProducts() {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/archived`)
    if (!response.ok) {
      throw new Error(`Failed to fetch archived semi-finished products: ${response.status}`)
    }
    return response.json()
  },
  async archiveSemiFinishedProductCheck(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/archive-check`)
    if (!response.ok) {
      throw new Error(`Failed to check semi-finished product archive: ${response.status}`)
    }
    return response.json()
  },
  async archiveSemiFinishedProduct(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/archive`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to archive semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async restoreSemiFinishedProduct(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/restore`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to restore semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async duplicateSemiFinishedProduct(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/duplicate`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`Failed to duplicate semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async deleteSemiFinishedProduct(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async createSemiFinishedProduct(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async updateSemiFinishedProduct(id, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to update semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedProductDetail(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished product detail: ${response.status}`)
    }
    return response.json()
  },
  async saveSemiFinishedProductSteps(id, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/recipe-steps`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to save semi-finished product steps: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedProductPrint(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/print`)
    if (!response.ok) {
      throw new Error(`Failed to fetch print payload: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedProductPurchaseListPrintData(id, targetQuantity, unit) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/semi-finished-products/${id}/print-purchase-list`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_quantity: targetQuantity,
          unit
        })
      }
    )
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Inkooplijst genereren mislukt: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedProductLabel(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-products/${id}/label`)
    if (!response.ok) {
      throw new Error(`Failed to fetch label payload: ${response.status}`)
    }
    return response.json()
  },
  async addSemiFinishedProductRecipeLine(semiFinishedProductId, payload) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/semi-finished-products/${semiFinishedProductId}/recipe-lines`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to add recipe line: ${response.status}`)
    }
    return response.json()
  },
  async updateSemiFinishedProductRecipeLine(semiFinishedProductId, recipeLineId, payload) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/semi-finished-products/${semiFinishedProductId}/recipe-lines/${recipeLineId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to update recipe line: ${response.status}`)
    }
    return response.json()
  },
  async deleteSemiFinishedProductRecipeLine(semiFinishedProductId, recipeLineId) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/semi-finished-products/${semiFinishedProductId}/recipe-lines/${recipeLineId}`,
      {
        method: 'DELETE'
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to delete recipe line: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedCategories() {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-categories`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished categories: ${response.status}`)
    }
    return response.json()
  },
  async createSemiFinishedCategory(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create semi-finished category: ${response.status}`)
    }
    return response.json()
  },
  async updateSemiFinishedCategory(categoryId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/semi-finished-categories/${categoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update semi-finished category: ${response.status}`)
    }
    return response.json()
  },
  async createSemiFinishedSubcategory(categoryId, payload) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/semi-finished-categories/${categoryId}/subcategories`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to create semi-finished subcategory: ${response.status}`)
    }
    return response.json()
  },
  async updateSemiFinishedSubcategory(subcategoryId, payload) {
    const response = await apiFetch(
      `${API_BASE_URL}/api/semi-finished-subcategories/${subcategoryId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        errorData?.detail || `Failed to update semi-finished subcategory: ${response.status}`
      )
    }
    return response.json()
  },
  async getDishCategories() {
    const response = await apiFetch(`${API_BASE_URL}/api/dish-categories`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dish categories: ${response.status}`)
    }
    return response.json()
  },
  async createDishCategory(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dish-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create dish category: ${response.status}`)
    }
    return response.json()
  },
  async updateDishCategory(categoryId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dish-categories/${categoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update dish category: ${response.status}`)
    }
    return response.json()
  },
  async createDishSubcategory(categoryId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dish-categories/${categoryId}/subcategories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create dish subcategory: ${response.status}`)
    }
    return response.json()
  },
  async updateDishSubcategory(subcategoryId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dish-subcategories/${subcategoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to update dish subcategory: ${response.status}`)
    }
    return response.json()
  },
  async getDishes() {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dishes: ${response.status}`)
    }
    return response.json()
  },
  async getArchivedDishes() {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/archived`)
    if (!response.ok) {
      throw new Error(`Failed to fetch archived dishes: ${response.status}`)
    }
    return response.json()
  },
  async searchDishesWithDetails(params = {}) {
    const query = new URLSearchParams()
    if (params.search) {
      query.set('search', params.search)
    }
    if (params.category_id !== undefined && params.category_id !== null && params.category_id !== '') {
      query.set('category_id', String(params.category_id))
    }
    if (params.subcategory_id !== undefined && params.subcategory_id !== null && params.subcategory_id !== '') {
      query.set('subcategory_id', String(params.subcategory_id))
    }
    query.set('archived', params.archived ? 'true' : 'false')

    const response = await apiFetch(`${API_BASE_URL}/api/dishes/search-with-details?${query.toString()}`)
    if (!response.ok) {
      throw new Error(`Failed to search dishes with details: ${response.status}`)
    }
    return response.json()
  },
  async getDishDetail(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dish detail: ${response.status}`)
    }
    return response.json()
  },
  async createDish(payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to create dish: ${response.status}`)
    }
    return response.json()
  },
  async updateDish(id, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to update dish: ${response.status}`)
    }
    return response.json()
  },
  async duplicateDish(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}/duplicate`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`Failed to duplicate dish: ${response.status}`)
    }
    return response.json()
  },
  async archiveDish(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}/archive`, {
      method: 'PUT'
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Failed to archive dish: ${response.status}`)
    }
    return response.json()
  },
  async archiveDishCheck(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}/archive-check`)
    if (!response.ok) {
      throw new Error(`Failed to check dish archive: ${response.status}`)
    }
    return response.json()
  },
  async restoreDish(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}/restore`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to restore dish: ${response.status}`)
    }
    return response.json()
  },
  async deleteDish(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete dish: ${response.status}`)
    }
    return response.json()
  },
  async addDishRecipeLine(dishId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-lines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to add dish recipe line: ${response.status}`)
    }
    return response.json()
  },
  async updateDishRecipeLine(dishId, recipeLineId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-lines/${recipeLineId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to update dish recipe line: ${response.status}`)
    }
    return response.json()
  },
  async deleteDishRecipeLine(dishId, recipeLineId) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-lines/${recipeLineId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete dish recipe line: ${response.status}`)
    }
    return response.json()
  },
  async saveDishRecipeSteps(dishId, payload) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-steps`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Failed to save dish recipe steps: ${response.status}`)
    }
    return response.json()
  },
  async uploadDishPhoto(dishId, file) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${dishId}/photo`, {
      method: 'POST',
      body: formData
    })
    if (!response.ok) {
      throw new Error(`Failed to upload dish photo: ${response.status}`)
    }
    return response.json()
  },
  async getDishPrint(id) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${id}/print`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dish print payload: ${response.status}`)
    }
    return response.json()
  },
  async getDishPurchaseListPrintData(dishId, preparations) {
    const response = await apiFetch(`${API_BASE_URL}/api/dishes/${dishId}/print-purchase-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ preparations })
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `Inkooplijst genereren mislukt: ${response.status}`)
    }
    return response.json()
  },
  getStatus() {
    return {
      message: 'API placeholder: requests worden later toegevoegd.',
      baseUrl: API_BASE_URL
    }
  }
}
