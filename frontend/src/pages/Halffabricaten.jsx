import React, { useEffect, useState } from 'react'

import { apiClient } from '../api/client'

export default function Halffabricaten() {
  const [ingredients, setIngredients] = useState([])
  const [semiFinishedProducts, setSemiFinishedProducts] = useState([])
  const [selectedSemiFinishedProductId, setSelectedSemiFinishedProductId] = useState(null)
  const [selectedSemiFinishedProductDetail, setSelectedSemiFinishedProductDetail] = useState(null)
  const [semiFinishedName, setSemiFinishedName] = useState('')
  const [semiFinishedDescription, setSemiFinishedDescription] = useState('')
  const [semiFinishedMessage, setSemiFinishedMessage] = useState('')
  const [semiFinishedIngredientSearch, setSemiFinishedIngredientSearch] = useState('')
  const [selectedIngredientForRecipe, setSelectedIngredientForRecipe] = useState(null)
  const [recipeQuantity, setRecipeQuantity] = useState('')
  const [recipeUnit, setRecipeUnit] = useState('st')
  const [recipeLineMessage, setRecipeLineMessage] = useState('')
  const [isAddingRecipeLine, setIsAddingRecipeLine] = useState(false)

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
      return Array.isArray(data) ? data : []
    } catch {
      setSemiFinishedProducts([])
      return []
    }
  }

  async function loadSemiFinishedProductDetail(id) {
    if (!id) {
      setSelectedSemiFinishedProductDetail(null)
      return
    }
    try {
      const data = await apiClient.getSemiFinishedProductDetail(id)
      setSelectedSemiFinishedProductDetail(data)
    } catch {
      setSelectedSemiFinishedProductDetail(null)
    }
  }

  useEffect(() => {
    let active = true

    async function loadDataOnMount() {
      const [ingredientsData, products] = await Promise.all([
        apiClient.getIngredients().catch(() => []),
        loadSemiFinishedProducts()
      ])

      if (!active) {
        return
      }

      setIngredients(Array.isArray(ingredientsData) ? ingredientsData : [])

      if (products.length > 0) {
        const firstId = products[0].id
        setSelectedSemiFinishedProductId(firstId)
        await loadSemiFinishedProductDetail(firstId)
      }
    }

    loadDataOnMount()

    return () => {
      active = false
    }
  }, [])

  async function handleCreateSemiFinishedProduct() {
    const name = semiFinishedName.trim()
    if (!name) {
      setSemiFinishedMessage('Naam is verplicht')
      return
    }

    try {
      const created = await apiClient.createSemiFinishedProduct({
        name,
        description: semiFinishedDescription.trim() || null
      })
      setSemiFinishedMessage('Halffabricaat opgeslagen')
      setSemiFinishedName('')
      setSemiFinishedDescription('')
      await loadSemiFinishedProducts()
      setSelectedSemiFinishedProductId(created.id)
      await loadSemiFinishedProductDetail(created.id)
    } catch {
      setSemiFinishedMessage('Opslaan mislukt')
    }
  }

  async function handleSelectSemiFinishedProduct(id) {
    setSelectedSemiFinishedProductId(id)
    setRecipeLineMessage('')
    await loadSemiFinishedProductDetail(id)
  }

  async function handleAddIngredientRecipeLine() {
    if (!selectedSemiFinishedProductId) {
      return
    }
    if (!selectedIngredientForRecipe) {
      setRecipeLineMessage('Kies eerst een ingrediënt')
      return
    }

    const quantityValue = Number(recipeQuantity)
    if (!recipeQuantity || Number.isNaN(quantityValue) || quantityValue <= 0) {
      setRecipeLineMessage('Vul een geldige hoeveelheid in')
      return
    }
    if (!recipeUnit.trim()) {
      setRecipeLineMessage('Vul een eenheid in')
      return
    }

    setIsAddingRecipeLine(true)
    setRecipeLineMessage('')
    try {
      await apiClient.addSemiFinishedProductRecipeLine(selectedSemiFinishedProductId, {
        item_type: 'ingredient',
        item_id: selectedIngredientForRecipe.id,
        quantity: quantityValue,
        unit: recipeUnit.trim()
      })
      setRecipeLineMessage('Ingrediënt toegevoegd')
      setSelectedIngredientForRecipe(null)
      setSemiFinishedIngredientSearch('')
      setRecipeQuantity('')
      await loadSemiFinishedProductDetail(selectedSemiFinishedProductId)
    } catch {
      setRecipeLineMessage('Toevoegen mislukt')
    } finally {
      setIsAddingRecipeLine(false)
    }
  }

  function formatEstimatedCost(value) {
    if (value === null || value === undefined || value === '') {
      return '-'
    }
    const number = Number(value)
    if (Number.isNaN(number)) {
      return '-'
    }
    return `€ ${number.toFixed(2).replace('.', ',')}`
  }

  const filteredIngredientsForRecipe = ingredients
    .filter((ingredient) =>
      (ingredient.supplier_product_name || '')
        .toLowerCase()
        .includes(semiFinishedIngredientSearch.toLowerCase())
    )
    .slice(0, 12)

  return (
    <div>
      <header className="page-header">
        <h2>Halffabricaten</h2>
        <p>Bouw halffabricaten op met receptregels uit inkoopproducten.</p>
      </header>

      <section className="card">
        <h3>Nieuw halffabricaat</h3>
        <div className="semi-finished-create">
          <input
            type="text"
            placeholder="Naam"
            value={semiFinishedName}
            onChange={(event) => setSemiFinishedName(event.target.value)}
          />
          <textarea
            placeholder="Omschrijving (optioneel)"
            value={semiFinishedDescription}
            onChange={(event) => setSemiFinishedDescription(event.target.value)}
          />
          <button type="button" onClick={handleCreateSemiFinishedProduct}>
            Halffabricaat toevoegen
          </button>
          {semiFinishedMessage ? <p>{semiFinishedMessage}</p> : null}
        </div>
      </section>

      <section className="card">
        <h3>Overzicht</h3>
        {semiFinishedProducts.length === 0 ? (
          <p>Nog geen halffabricaten</p>
        ) : (
          <div className="semi-finished-layout">
            <div className="semi-finished-list">
              {semiFinishedProducts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`semi-finished-item${selectedSemiFinishedProductId === item.id ? ' is-active' : ''}`}
                  onClick={() => handleSelectSemiFinishedProduct(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>

            <div className="semi-finished-detail">
              {!selectedSemiFinishedProductId ? (
                <p>Kies een halffabricaat</p>
              ) : selectedSemiFinishedProductDetail ? (
                <>
                  <h3>{selectedSemiFinishedProductDetail.name}</h3>
                  <p>{selectedSemiFinishedProductDetail.description || '-'}</p>
                  <p>
                    <strong>Geschatte kostprijs totaal:</strong>{' '}
                    {formatEstimatedCost(selectedSemiFinishedProductDetail.estimated_cost_total)}
                  </p>

                  {selectedSemiFinishedProductDetail.recipe_lines?.length ? (
                    <table className="recipe-lines-table">
                      <thead>
                        <tr>
                          <th>item_type</th>
                          <th>item_id</th>
                          <th>quantity</th>
                          <th>unit</th>
                          <th>sort_order</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSemiFinishedProductDetail.recipe_lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.item_type}</td>
                            <td>{line.item_id}</td>
                            <td>{line.quantity}</td>
                            <td>{line.unit}</td>
                            <td>{line.sort_order}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>Nog geen receptregels</p>
                  )}

                  <div className="recipe-line-form">
                    <h4>Ingrediënt toevoegen</h4>
                    <input
                      type="text"
                      placeholder="Zoek ingrediëntnaam"
                      value={semiFinishedIngredientSearch}
                      onChange={(event) => setSemiFinishedIngredientSearch(event.target.value)}
                    />
                    {semiFinishedIngredientSearch.trim() ? (
                      filteredIngredientsForRecipe.length > 0 ? (
                        <div className="ingredient-picker">
                          {filteredIngredientsForRecipe.map((ingredient) => (
                            <button
                              key={ingredient.id}
                              type="button"
                              className={`ingredient-picker-item${selectedIngredientForRecipe?.id === ingredient.id ? ' is-active' : ''}`}
                              onClick={() => setSelectedIngredientForRecipe(ingredient)}
                            >
                              {ingredient.supplier_product_name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p>Geen ingrediënten gevonden</p>
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
                      <input
                        type="text"
                        placeholder="Eenheid"
                        value={recipeUnit}
                        onChange={(event) => setRecipeUnit(event.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddIngredientRecipeLine}
                      disabled={!selectedIngredientForRecipe || isAddingRecipeLine}
                    >
                      {isAddingRecipeLine ? 'Bezig...' : 'Ingrediënt toevoegen'}
                    </button>
                    {recipeLineMessage ? <p>{recipeLineMessage}</p> : null}
                  </div>
                </>
              ) : (
                <p>Kies een halffabricaat</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
