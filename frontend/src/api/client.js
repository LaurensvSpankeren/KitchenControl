export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const apiClient = {
  async getIngredients() {
    const response = await fetch(`${API_BASE_URL}/api/ingredients`)
    if (!response.ok) {
      throw new Error(`Failed to fetch ingredients: ${response.status}`)
    }
    return response.json()
  },
  async createIngredient(payload) {
    const response = await fetch(`${API_BASE_URL}/api/ingredients`, {
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
  async importIngredientsCsv(file) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE_URL}/api/imports/ingredients`, {
      method: 'POST',
      body: formData
    })
    if (!response.ok) {
      throw new Error(`Failed to import ingredients: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedProducts() {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished products: ${response.status}`)
    }
    return response.json()
  },
  async createSemiFinishedProduct(payload) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products`, {
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
  async getSemiFinishedProductDetail(id) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished product detail: ${response.status}`)
    }
    return response.json()
  },
  async addSemiFinishedProductRecipeLine(semiFinishedProductId, payload) {
    const response = await fetch(
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
  getStatus() {
    return {
      message: 'API placeholder: requests worden later toegevoegd.',
      baseUrl: API_BASE_URL
    }
  }
}
