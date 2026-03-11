export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const apiClient = {
  async getIngredients() {
    const response = await fetch(`${API_BASE_URL}/api/ingredients`)
    if (!response.ok) {
      throw new Error(`Failed to fetch ingredients: ${response.status}`)
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
