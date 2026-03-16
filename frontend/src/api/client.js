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
  async updateIngredient(id, payload) {
    const response = await fetch(`${API_BASE_URL}/api/ingredients/${id}`, {
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
  async getArchivedSemiFinishedProducts() {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/archived`)
    if (!response.ok) {
      throw new Error(`Failed to fetch archived semi-finished products: ${response.status}`)
    }
    return response.json()
  },
  async archiveSemiFinishedProduct(id) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}/archive`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to archive semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async restoreSemiFinishedProduct(id) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}/restore`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to restore semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async duplicateSemiFinishedProduct(id) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}/duplicate`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`Failed to duplicate semi-finished product: ${response.status}`)
    }
    return response.json()
  },
  async deleteSemiFinishedProduct(id) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete semi-finished product: ${response.status}`)
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
  async updateSemiFinishedProduct(id, payload) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}`, {
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
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished product detail: ${response.status}`)
    }
    return response.json()
  },
  async saveSemiFinishedProductSteps(id, payload) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}/recipe-steps`, {
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
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}/print`)
    if (!response.ok) {
      throw new Error(`Failed to fetch print payload: ${response.status}`)
    }
    return response.json()
  },
  async getSemiFinishedProductLabel(id) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-products/${id}/label`)
    if (!response.ok) {
      throw new Error(`Failed to fetch label payload: ${response.status}`)
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
  async updateSemiFinishedProductRecipeLine(semiFinishedProductId, recipeLineId, payload) {
    const response = await fetch(
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
    const response = await fetch(
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
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-categories`)
    if (!response.ok) {
      throw new Error(`Failed to fetch semi-finished categories: ${response.status}`)
    }
    return response.json()
  },
  async createSemiFinishedCategory(payload) {
    const response = await fetch(`${API_BASE_URL}/api/semi-finished-categories`, {
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
  async createSemiFinishedSubcategory(categoryId, payload) {
    const response = await fetch(
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
  async getDishCategories() {
    const response = await fetch(`${API_BASE_URL}/api/dish-categories`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dish categories: ${response.status}`)
    }
    return response.json()
  },
  async createDishCategory(payload) {
    const response = await fetch(`${API_BASE_URL}/api/dish-categories`, {
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
  async createDishSubcategory(categoryId, payload) {
    const response = await fetch(`${API_BASE_URL}/api/dish-categories/${categoryId}/subcategories`, {
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
  async getDishes() {
    const response = await fetch(`${API_BASE_URL}/api/dishes`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dishes: ${response.status}`)
    }
    return response.json()
  },
  async getArchivedDishes() {
    const response = await fetch(`${API_BASE_URL}/api/dishes/archived`)
    if (!response.ok) {
      throw new Error(`Failed to fetch archived dishes: ${response.status}`)
    }
    return response.json()
  },
  async getDishDetail(id) {
    const response = await fetch(`${API_BASE_URL}/api/dishes/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch dish detail: ${response.status}`)
    }
    return response.json()
  },
  async createDish(payload) {
    const response = await fetch(`${API_BASE_URL}/api/dishes`, {
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
    const response = await fetch(`${API_BASE_URL}/api/dishes/${id}`, {
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
    const response = await fetch(`${API_BASE_URL}/api/dishes/${id}/duplicate`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`Failed to duplicate dish: ${response.status}`)
    }
    return response.json()
  },
  async archiveDish(id) {
    const response = await fetch(`${API_BASE_URL}/api/dishes/${id}/archive`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to archive dish: ${response.status}`)
    }
    return response.json()
  },
  async restoreDish(id) {
    const response = await fetch(`${API_BASE_URL}/api/dishes/${id}/restore`, {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(`Failed to restore dish: ${response.status}`)
    }
    return response.json()
  },
  async deleteDish(id) {
    const response = await fetch(`${API_BASE_URL}/api/dishes/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete dish: ${response.status}`)
    }
    return response.json()
  },
  async addDishRecipeLine(dishId, payload) {
    const response = await fetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-lines`, {
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
    const response = await fetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-lines/${recipeLineId}`, {
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
    const response = await fetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-lines/${recipeLineId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`Failed to delete dish recipe line: ${response.status}`)
    }
    return response.json()
  },
  async saveDishRecipeSteps(dishId, payload) {
    const response = await fetch(`${API_BASE_URL}/api/dishes/${dishId}/recipe-steps`, {
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
  getStatus() {
    return {
      message: 'API placeholder: requests worden later toegevoegd.',
      baseUrl: API_BASE_URL
    }
  }
}
