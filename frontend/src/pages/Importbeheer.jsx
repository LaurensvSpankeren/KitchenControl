import React, { useEffect, useMemo, useState } from 'react'

import { apiClient, API_BASE_URL } from '../api/client'
import { getCurrentUser } from '../utils/currentUser'

const defaultPermissions = {
  importbeheer: {
    bekijken: ['Supervisor', 'Chef', 'Kok'],
    importeren: ['Supervisor', 'Chef'],
    matchen: ['Supervisor', 'Chef', 'Kok'],
    opschonen: ['Supervisor'],
    samenvoegen: ['Supervisor']
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

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  const amount = Number(value)
  if (Number.isNaN(amount)) {
    return String(value)
  }
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  const amount = Number(value)
  if (Number.isNaN(amount)) {
    return String(value)
  }
  return amount.toLocaleString('nl-NL', { maximumFractionDigits: 4 })
}

function formatImportMatch(ingredient) {
  const matchStatus = ingredient?.match_status || 'none'
  const matchedImportIngredientId = ingredient?.matched_import_ingredient_id

  if (matchStatus === 'strong') {
    return matchedImportIngredientId ? `Sterk (#${matchedImportIngredientId})` : 'Sterk'
  }
  if (matchStatus === 'possible') {
    return 'Mogelijk'
  }
  return 'Geen'
}

function parseJsonString(value) {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function Importbeheer() {
  const [permissions, setPermissions] = useState(defaultPermissions)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [importMessage, setImportMessage] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [issues, setIssues] = useState([])
  const [selectedIssueId, setSelectedIssueId] = useState(null)
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [issuesMessage, setIssuesMessage] = useState('')
  const [issueError, setIssueError] = useState('')
  const [isLoadingIssues, setIsLoadingIssues] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [staleImportIngredients, setStaleImportIngredients] = useState([])
  const [staleImportMessage, setStaleImportMessage] = useState('')
  const [staleImportError, setStaleImportError] = useState('')
  const [isLoadingStaleImportIngredients, setIsLoadingStaleImportIngredients] = useState(false)
  const [manualIngredients, setManualIngredients] = useState([])
  const [manualMatchIngredients, setManualMatchIngredients] = useState([])
  const [manualMatchMessage, setManualMatchMessage] = useState('')
  const [manualMatchError, setManualMatchError] = useState('')
  const [manualReviewMessage, setManualReviewMessage] = useState('')
  const [manualReviewError, setManualReviewError] = useState('')
  const [isLoadingManualIngredients, setIsLoadingManualIngredients] = useState(false)
  const [isLoadingManualMatchIngredients, setIsLoadingManualMatchIngredients] = useState(false)
  const [activeManualActionId, setActiveManualActionId] = useState(null)
  const [activeStaleImportActionId, setActiveStaleImportActionId] = useState(null)
  const [selectedManualMatchIngredient, setSelectedManualMatchIngredient] = useState(null)
  const [selectedImportMatchIngredient, setSelectedImportMatchIngredient] = useState(null)
  const [isLoadingMatchPreview, setIsLoadingMatchPreview] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [isDeletingIngredient, setIsDeletingIngredient] = useState(false)
  const currentUser = getCurrentUser()
  const role = currentUser?.role
  const canViewImportbeheer =
    !isLoadingPermissions && hasPermission(permissions, 'importbeheer', 'bekijken', role)
  const canImportCsv =
    !isLoadingPermissions && hasPermission(permissions, 'importbeheer', 'importeren', role)
  const canMatchImport =
    !isLoadingPermissions && hasPermission(permissions, 'importbeheer', 'matchen', role)
  const canCleanupImport =
    !isLoadingPermissions && hasPermission(permissions, 'importbeheer', 'opschonen', role)
  const canMergeImport =
    !isLoadingPermissions && hasPermission(permissions, 'importbeheer', 'samenvoegen', role)

  const duplicateIssues = useMemo(
    () => issues.filter((issue) => issue.issue_type === 'duplicate_conflict_in_file'),
    [issues]
  )

  const selectedIssuePayload = useMemo(
    () => parseJsonString(selectedIssue?.payload_json),
    [selectedIssue]
  )

  function getManualFeedbackTargets(ingredientId) {
    const targetMatchIngredient = manualMatchIngredients.find((ingredient) => ingredient.id === ingredientId)
    const isMatchAction = Boolean(targetMatchIngredient)
    return {
      setMessage: isMatchAction ? setManualMatchMessage : setManualReviewMessage,
      setError: isMatchAction ? setManualMatchError : setManualReviewError
    }
  }

  async function loadIssues() {
    setIsLoadingIssues(true)
    setIssueError('')
    try {
      const data = await apiClient.getImportIssues({ status: 'open' })
      setIssues(Array.isArray(data) ? data : [])
    } catch {
      setIssueError('Import issues laden mislukt.')
      setIssues([])
    } finally {
      setIsLoadingIssues(false)
    }
  }

  async function loadManualIngredients() {
    setIsLoadingManualIngredients(true)
    setManualReviewError('')
    try {
      const data = await apiClient.getManualIngredientsForReview()
      setManualIngredients(Array.isArray(data) ? data : [])
    } catch {
      setManualReviewError('Handmatige ingrediënten laden mislukt.')
      setManualIngredients([])
    } finally {
      setIsLoadingManualIngredients(false)
    }
  }

  async function loadStaleImportIngredients() {
    setIsLoadingStaleImportIngredients(true)
    setStaleImportError('')
    try {
      const data = await apiClient.getStaleImportIngredients()
      setStaleImportIngredients(Array.isArray(data) ? data : [])
    } catch {
      setStaleImportError('Importingrediënten ter controle laden mislukt.')
      setStaleImportIngredients([])
    } finally {
      setIsLoadingStaleImportIngredients(false)
    }
  }

  async function loadManualMatchIngredients() {
    setIsLoadingManualMatchIngredients(true)
    setManualMatchError('')
    try {
      const data = await apiClient.getManualIngredientsWithMatches()
      setManualMatchIngredients(Array.isArray(data) ? data : [])
    } catch {
      setManualMatchError('Handmatige ingrediënten met importmatch laden mislukt.')
      setManualMatchIngredients([])
    } finally {
      setIsLoadingManualMatchIngredients(false)
    }
  }

  async function loadIssueDetail(issueId) {
    if (!issueId) {
      setSelectedIssue(null)
      return
    }
    setIssueError('')
    try {
      const data = await apiClient.getImportIssue(issueId)
      setSelectedIssue(data)
    } catch {
      setIssueError('Issue detail laden mislukt.')
      setSelectedIssue(null)
    }
  }

  async function handleImport() {
    if (!selectedFile || isImporting) {
      return
    }

    setIsImporting(true)
    setImportMessage('')

    try {
      const result = await apiClient.importIngredientsCsv(selectedFile)
      setImportMessage(`Import geslaagd: ${result.created} aangemaakt, ${result.updated} bijgewerkt`)
    } catch {
      setImportMessage('Import mislukt')
    } finally {
      setIsImporting(false)
    }
  }

  async function handleOpenIssue(issueId) {
    setSelectedIssueId(issueId)
    await loadIssueDetail(issueId)
  }

  async function handleResolveIssue(action, payload) {
    if (!selectedIssueId || isResolving) {
      return
    }

    const issueId = selectedIssueId
    setIsResolving(true)
    setIssueError('')
    setIssuesMessage('')

    try {
      await apiClient.resolveImportIssue(issueId, { action, payload })
      setIssues((currentIssues) => currentIssues.filter((issue) => issue.id !== issueId))
      if (selectedIssueId === issueId) {
        setSelectedIssueId(null)
        setSelectedIssue(null)
      }
      setIssuesMessage('Keuze opgeslagen.')
    } catch {
      setIssueError('Issue opslaan mislukt.')
    } finally {
      setIsResolving(false)
    }
  }

  async function handleManualIngredientAction(ingredientId, action) {
    if (!ingredientId || activeManualActionId) {
      return
    }

    const { setMessage, setError } = getManualFeedbackTargets(ingredientId)

    setActiveManualActionId(ingredientId)
    setError('')
    setMessage('')

    try {
      if (action === 'review') {
        await apiClient.reviewManualIngredient(ingredientId)
        setMessage('Handmatig ingrediënt gemarkeerd als geen match.')
      } else if (action === 'archive') {
        if (!canCleanupImport) {
          setError('Je hebt geen rechten om handmatige ingrediënten te archiveren.')
          return
        }
        await apiClient.archiveManualIngredient(ingredientId)
        setMessage('Handmatig ingrediënt gearchiveerd.')
      } else if (action === 'link-import') {
        const result = await apiClient.linkManualIngredientToImport(ingredientId)
        setMessage(
          `Handmatig ingrediënt gekoppeld aan import (#${result.import_ingredient_id}).`
        )
        setSelectedManualMatchIngredient(null)
        setSelectedImportMatchIngredient(null)
      }

      await Promise.all([loadManualIngredients(), loadManualMatchIngredients()])
    } catch (error) {
      setError(error?.message || 'Actie op handmatig ingrediënt mislukt.')
    } finally {
      setActiveManualActionId(null)
    }
  }

  async function handleOpenMatchPreview(ingredient) {
    if (!ingredient?.matched_import_ingredient_id || isLoadingMatchPreview) {
      return
    }

    setIsLoadingMatchPreview(true)
    setManualMatchError('')
    try {
      const matchedIngredient = await apiClient.getIngredient(ingredient.matched_import_ingredient_id)

      if (!matchedIngredient) {
        setManualMatchError('Gekoppeld importingrediënt kon niet worden geladen.')
        return
      }

      setSelectedManualMatchIngredient(ingredient)
      setSelectedImportMatchIngredient(matchedIngredient)
    } catch {
      setManualMatchError('Matchvoorbeeld laden mislukt.')
    } finally {
      setIsLoadingMatchPreview(false)
    }
  }

  function closeMatchPreview() {
    if (activeManualActionId || isLoadingMatchPreview) {
      return
    }
    setSelectedManualMatchIngredient(null)
    setSelectedImportMatchIngredient(null)
  }

  async function handleOpenDeleteIngredient(ingredient, sourceType) {
    if (!ingredient?.id || !canCleanupImport) {
      return
    }

    const isManual = sourceType === 'manual'
    if ((isManual && activeManualActionId) || (!isManual && activeStaleImportActionId)) {
      return
    }

    if (isManual) {
      const { setMessage, setError } = getManualFeedbackTargets(ingredient.id)
      setMessage('')
      setError('')
      setActiveManualActionId(ingredient.id)
    } else {
      setStaleImportMessage('')
      setStaleImportError('')
      setActiveStaleImportActionId(ingredient.id)
    }

    try {
      const usage =
        sourceType === 'manual'
          ? await apiClient.getManualIngredientUsageCheck(ingredient.id)
          : await apiClient.getImportIngredientUsageCheck(ingredient.id)
      setDeleteDialog({
        ingredient,
        sourceType,
        usage,
        mode: usage?.can_delete ? 'confirm' : 'blocked'
      })
    } catch (error) {
      if (isManual) {
        const { setError } = getManualFeedbackTargets(ingredient.id)
        setError(error?.message || 'Gebruik van ingrediënt controleren mislukt.')
      } else {
        setStaleImportError(error?.message || 'Gebruik van ingrediënt controleren mislukt.')
      }
    } finally {
      if (isManual) {
        setActiveManualActionId(null)
      } else {
        setActiveStaleImportActionId(null)
      }
    }
  }

  function closeDeleteDialog() {
    if (isDeletingIngredient) {
      return
    }
    setDeleteDialog(null)
  }

  async function handleConfirmDeleteIngredient() {
    if (!deleteDialog?.ingredient?.id || isDeletingIngredient || deleteDialog.mode !== 'confirm') {
      return
    }

    const { ingredient, sourceType } = deleteDialog
    const isManual = sourceType === 'manual'
    setIsDeletingIngredient(true)

    try {
      if (isManual) {
        await apiClient.deleteManualIngredient(ingredient.id)
        const { setMessage } = getManualFeedbackTargets(ingredient.id)
        setMessage('Handmatig ingrediënt verwijderd.')
        await Promise.all([loadManualIngredients(), loadManualMatchIngredients()])
      } else {
        await apiClient.deleteImportIngredient(ingredient.id)
        setStaleImportMessage('Importingrediënt verwijderd.')
        setStaleImportIngredients((currentIngredients) =>
          currentIngredients.filter((currentIngredient) => currentIngredient.id !== ingredient.id)
        )
      }
      setDeleteDialog(null)
    } catch (error) {
      if (error?.status === 409 && error?.data) {
        setDeleteDialog({
          ingredient,
          sourceType,
          usage: error.data,
          mode: 'blocked'
        })
        return
      }

      if (isManual) {
        const { setError } = getManualFeedbackTargets(ingredient.id)
        setError(error?.message || 'Ingrediënt verwijderen mislukt.')
      } else {
        setStaleImportError(error?.message || 'Importingrediënt verwijderen mislukt.')
      }
    } finally {
      setIsDeletingIngredient(false)
    }
  }

  async function handleStaleImportIngredientAction(ingredientId, action) {
    if (!ingredientId || activeStaleImportActionId) {
      return
    }

    setActiveStaleImportActionId(ingredientId)
    setStaleImportError('')
    setStaleImportMessage('')

    try {
      if (action === 'archive') {
        if (!canCleanupImport) {
          setStaleImportError('Je hebt geen rechten om importingrediënten te archiveren.')
          return
        }
        await apiClient.archiveImportIngredient(ingredientId)
        setStaleImportMessage('Importingrediënt gearchiveerd.')
      }

      setStaleImportIngredients((currentIngredients) =>
        currentIngredients.filter((ingredient) => ingredient.id !== ingredientId)
      )
    } catch (error) {
      setStaleImportError(error?.message || 'Actie op importingrediënt mislukt.')
    } finally {
      setActiveStaleImportActionId(null)
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
    loadIssues()
    loadStaleImportIngredients()
    loadManualIngredients()
    loadManualMatchIngredients()
  }, [])

  const deleteUsage = deleteDialog?.usage || {}
  const deleteDishes = Array.isArray(deleteUsage.dishes) ? deleteUsage.dishes : []
  const deleteSemiFinishedProducts = Array.isArray(deleteUsage.semi_finished_products)
    ? deleteUsage.semi_finished_products
    : []
  const isDeleteBlocked = deleteDialog?.mode === 'blocked'

  if (!isLoadingPermissions && !canViewImportbeheer) {
    return (
      <div>
        <header className="page-header">
          <h2>Importbeheer</h2>
          <p>Je hebt geen rechten om Importbeheer te bekijken.</p>
        </header>
      </div>
    )
  }

  return (
    <div>
      <header className="page-header">
        <h2>Importbeheer</h2>
        <p>Beheer hier CSV-imports, handmatige ingrediënten en importcontroles.</p>
      </header>

      <section className="card">
        <h3>Handmatig CSV uploaden</h3>
        <p style={{ marginTop: '0.65rem' }}>Upload hier CSV-bestanden om inkoopproducten te synchroniseren.</p>
        {canImportCsv ? (
          <>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
            <button type="button" onClick={handleImport} disabled={!selectedFile || isImporting}>
              {isImporting ? 'Bezig met importeren...' : 'CSV uploaden'}
            </button>
          </>
        ) : null}
        {importMessage ? <p>{importMessage}</p> : null}
      </section>

      <section className="card" style={{ marginTop: '1.75rem' }}>
        <h3>Handmatige ingrediënten controleren</h3>
        <p style={{ marginTop: '0.65rem' }}>Controleer hier handmatig ingevoerde ingrediënten.</p>

        <div style={{ marginTop: '2rem' }}>
          <h4>Import match controleren</h4>
          <p style={{ marginTop: '0.65rem' }}>Beoordeel of een handmatig ingrediënt gekoppeld kan worden aan een importproduct.</p>
          {manualMatchMessage ? <p className="form-info inline-message">{manualMatchMessage}</p> : null}
          {manualMatchError ? <p>{manualMatchError}</p> : null}
          {isLoadingManualMatchIngredients ? (
            <p>Handmatige ingrediënten met importmatch laden...</p>
          ) : manualMatchIngredients.length === 0 ? (
            <p>Geen handmatige ingrediënten met importmatch gevonden.</p>
          ) : (
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    <th>Leverancier</th>
                    <th>Product</th>
                    <th>Artikelcode</th>
                    <th>Prijs</th>
                    <th>Eenheid</th>
                    <th>Rekeneenheid</th>
                    <th>Aantal</th>
                    <th>Import match</th>
                    <th>Notitie</th>
                    <th>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {manualMatchIngredients.map((ingredient) => {
                    const isBusy = activeManualActionId === ingredient.id
                    return (
                      <tr key={ingredient.id}>
                        <td>{ingredient.supplier_name || '-'}</td>
                        <td>{ingredient.supplier_product_name || '-'}</td>
                        <td>{ingredient.supplier_product_code || '-'}</td>
                        <td>{formatCurrency(ingredient.supplier_price_ex_vat)}</td>
                        <td>{ingredient.supplier_unit || '-'}</td>
                        <td>{ingredient.calculation_unit || '-'}</td>
                        <td>{formatNumber(ingredient.calculation_quantity_per_package)}</td>
                        <td>{formatImportMatch(ingredient)}</td>
                        <td>{ingredient.manual_note || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {canMatchImport ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleManualIngredientAction(ingredient.id, 'review')}
                                  disabled={isBusy}
                                >
                                  Geen match
                                </button>
                                {ingredient.match_status === 'strong' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMatchPreview(ingredient)}
                                    disabled={isBusy || isLoadingMatchPreview}
                                  >
                                    Bekijk match
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {canCleanupImport ? (
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => handleOpenDeleteIngredient(ingredient, 'manual')}
                                disabled={isBusy}
                              >
                                Verwijderen
                              </button>
                            ) : null}
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

        <div style={{ marginTop: '2.75rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <h4>Inactieve handmatige ingrediënten</h4>
          <p style={{ marginTop: '0.65rem' }}>Deze ingrediënten zijn 45 dagen of langer niet bijgewerkt. Controleer ze en werk ze bij indien nodig.</p>
          {manualReviewMessage ? <p className="form-info inline-message">{manualReviewMessage}</p> : null}
          {manualReviewError ? <p>{manualReviewError}</p> : null}
          {isLoadingManualIngredients ? (
            <p>Handmatige ingrediënten laden...</p>
          ) : manualIngredients.length === 0 ? (
            <p>Geen handmatige ingrediënten ter controle gevonden.</p>
          ) : (
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    <th>Leverancier</th>
                    <th>Product</th>
                    <th>Artikelcode</th>
                    <th>Prijs</th>
                    <th>Eenheid</th>
                    <th>Rekeneenheid</th>
                    <th>Aantal</th>
                    <th>Aangemaakt</th>
                    <th>Laatste review</th>
                    <th>Wacht op import</th>
                    <th>Import match</th>
                    <th>Notitie</th>
                    <th>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {manualIngredients.map((ingredient) => {
                    const isBusy = activeManualActionId === ingredient.id
                    return (
                      <tr key={ingredient.id}>
                        <td>{ingredient.supplier_name || '-'}</td>
                        <td>{ingredient.supplier_product_name || '-'}</td>
                        <td>{ingredient.supplier_product_code || '-'}</td>
                        <td>{formatCurrency(ingredient.supplier_price_ex_vat)}</td>
                        <td>{ingredient.supplier_unit || '-'}</td>
                        <td>{ingredient.calculation_unit || '-'}</td>
                        <td>{formatNumber(ingredient.calculation_quantity_per_package)}</td>
                        <td>{formatDateTime(ingredient.manual_created_at)}</td>
                        <td>{formatDateTime(ingredient.last_manual_review_at)}</td>
                        <td>{ingredient.awaiting_import_match ? 'Ja' : 'Nee'}</td>
                        <td>{formatImportMatch(ingredient)}</td>
                        <td>{ingredient.manual_note || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {canMatchImport ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleManualIngredientAction(ingredient.id, 'review')}
                                  disabled={isBusy}
                                >
                                  Geen match
                                </button>
                                {ingredient.match_status === 'strong' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleManualIngredientAction(ingredient.id, 'link-import')
                                    }
                                    disabled={isBusy}
                                  >
                                    Koppel aan import
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {canCleanupImport ? (
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => handleOpenDeleteIngredient(ingredient, 'manual')}
                                disabled={isBusy}
                              >
                                Verwijderen
                              </button>
                            ) : null}
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
      </section>

      <section className="card" style={{ marginTop: '1.75rem' }}>
        <h3>Import ingrediënten controleren</h3>
        <p style={{ marginTop: '0.65rem' }}>Controleer hier geïmporteerde ingrediënten.</p>

        <div style={{ marginTop: '2rem' }}>
          <h4>Inactieve import ingrediënten</h4>
          <p style={{ marginTop: '0.65rem' }}>Deze ingrediënten zijn 45 dagen of langer niet vernieuwd via import. Controleer ze en werk ze bij indien nodig.</p>
          {staleImportMessage ? <p className="form-info inline-message">{staleImportMessage}</p> : null}
          {staleImportError ? <p>{staleImportError}</p> : null}
          {isLoadingStaleImportIngredients ? (
            <p>Importingrediënten laden...</p>
          ) : staleImportIngredients.length === 0 ? (
            <p>Geen importingrediënten ter controle gevonden.</p>
          ) : (
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    <th>Leverancier</th>
                    <th>Product</th>
                    <th>Artikelcode</th>
                    <th>Prijs</th>
                    <th>Eenheid</th>
                    <th>Rekeneenheid</th>
                    <th>Aantal</th>
                    <th>Laatste import</th>
                    <th>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {staleImportIngredients.map((ingredient) => {
                    const isBusy = activeStaleImportActionId === ingredient.id
                    return (
                      <tr key={ingredient.id}>
                        <td>{ingredient.supplier_name || '-'}</td>
                        <td>{ingredient.supplier_product_name || '-'}</td>
                        <td>{ingredient.supplier_product_code || '-'}</td>
                        <td>{formatCurrency(ingredient.supplier_price_ex_vat)}</td>
                        <td>{ingredient.supplier_unit || '-'}</td>
                        <td>{ingredient.calculation_unit || '-'}</td>
                        <td>{formatNumber(ingredient.calculation_quantity_per_package)}</td>
                        <td>{formatDateTime(ingredient.supplier_last_imported_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {canCleanupImport ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => handleStaleImportIngredientAction(ingredient.id, 'archive')}
                                  disabled={isBusy}
                                >
                                  Archiveren
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => handleOpenDeleteIngredient(ingredient, 'import')}
                                  disabled={isBusy}
                                >
                                  Verwijderen
                                </button>
                              </>
                            ) : null}
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

        <div style={{ marginTop: '2.75rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <h4>Duplicaten in import</h4>
          <p style={{ marginTop: '0.65rem' }}>Mogelijke dubbele importproducten gevonden. Controleer en voeg samen.</p>
          {issuesMessage ? <p className="form-info inline-message">{issuesMessage}</p> : null}
          {issueError ? <p>{issueError}</p> : null}
          {isLoadingIssues ? (
            <p>Issues laden...</p>
          ) : duplicateIssues.length === 0 ? (
            <p>Geen open duplicate issues gevonden.</p>
          ) : (
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    <th>Artikelcode</th>
                    <th>Productnaam</th>
                    <th>Aangemaakt</th>
                    <th>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateIssues.map((issue) => (
                    <tr key={issue.id}>
                      <td>{issue.supplier_product_code || '-'}</td>
                      <td>{issue.supplier_product_name || '-'}</td>
                      <td>{formatDateTime(issue.created_at)}</td>
                      <td>
                        {canMergeImport ? (
                          <button type="button" onClick={() => handleOpenIssue(issue.id)}>
                            Open
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {deleteDialog ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{isDeleteBlocked ? 'Ingrediënt kan niet worden verwijderd' : 'Ingrediënt verwijderen'}</h3>
            </div>

            <div className="modal-body">
              {isDeleteBlocked ? (
                <>
                  <p>Dit ingrediënt kan niet worden verwijderd omdat het nog wordt gebruikt in actieve recepten.</p>

                  <h4>Gerechten</h4>
                  {deleteDishes.length > 0 ? (
                    <ul>
                      {deleteDishes.map((dish) => (
                        <li key={`dish-${dish.id}`}>{dish.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Geen</p>
                  )}

                  <h4>Halffabricaten</h4>
                  {deleteSemiFinishedProducts.length > 0 ? (
                    <ul>
                      {deleteSemiFinishedProducts.map((product) => (
                        <li key={`semi-${product.id}`}>{product.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Geen</p>
                  )}
                </>
              ) : (
                <>
                  <p>Dit ingrediënt wordt niet meer gebruikt in actieve gerechten of halffabricaten.</p>

                  <p>Het ingrediënt wordt verwijderd uit:</p>
                  <ul>
                    <li>ingrediëntenlijsten</li>
                    <li>zoekresultaten</li>
                    <li>import match controle</li>
                  </ul>

                  <p>Historische receptdata blijft technisch behouden.</p>

                  <p>
                    Let op:
                    <br />
                    als dit product nog in uw Bidfood favorieten of exports voorkomt,
                    <br />
                    kan het bij een volgende import opnieuw worden toegevoegd.
                  </p>

                  <p>Weet je zeker dat je wilt verwijderen?</p>
                </>
              )}
            </div>

            <div className="modal-actions">
              {isDeleteBlocked ? (
                <button type="button" className="secondary-btn" onClick={closeDeleteDialog}>
                  Sluiten
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={closeDeleteDialog}
                    disabled={isDeletingIngredient}
                  >
                    Nee, ongewijzigd laten
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleConfirmDeleteIngredient}
                    disabled={isDeletingIngredient}
                  >
                    {isDeletingIngredient ? 'Bezig met verwijderen...' : 'Ja, verwijderen'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedManualMatchIngredient && selectedImportMatchIngredient ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>Importmatch bekijken</h3>
            </div>

            <div className="modal-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 64px minmax(0, 1fr)',
                  gap: '1rem',
                  alignItems: 'stretch'
                }}
              >
                <div
                  style={{
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '1rem',
                    padding: '1rem'
                  }}
                >
                  <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Handmatig</h4>
                  <div className="modal-grid one-col calm-grid">
                    <label>
                      Leverancier
                      <input type="text" value={selectedManualMatchIngredient.supplier_name || ''} readOnly />
                    </label>
                    <label>
                      Product
                      <input
                        type="text"
                        value={selectedManualMatchIngredient.supplier_product_name || ''}
                        readOnly
                      />
                    </label>
                    <label>
                      Artikelcode
                      <input
                        type="text"
                        value={selectedManualMatchIngredient.supplier_product_code || ''}
                        readOnly
                      />
                    </label>
                    <label>
                      Prijs
                      <input
                        type="text"
                        value={formatCurrency(selectedManualMatchIngredient.supplier_price_ex_vat)}
                        readOnly
                      />
                    </label>
                    <label>
                      Eenheid
                      <input type="text" value={selectedManualMatchIngredient.supplier_unit || ''} readOnly />
                    </label>
                    <label>
                      Rekeneenheid
                      <input
                        type="text"
                        value={
                          selectedManualMatchIngredient.calculation_unit ||
                          selectedManualMatchIngredient.calculation_quantity_per_package
                            ? `${selectedManualMatchIngredient.calculation_quantity_per_package || ''} ${selectedManualMatchIngredient.calculation_unit || ''}`.trim()
                            : ''
                        }
                        readOnly
                      />
                    </label>
                  </div>
                </div>

                <div
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    fontSize: '1.75rem',
                    fontWeight: 700
                  }}
                >
                  →
                </div>

                <div
                  style={{
                    background: '#ecfeff',
                    border: '1px solid #99f6e4',
                    borderRadius: '1rem',
                    padding: '1rem'
                  }}
                >
                  <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Import</h4>
                  <div className="modal-grid one-col calm-grid">
                    <label>
                      Leverancier
                      <input type="text" value={selectedImportMatchIngredient.supplier_name || ''} readOnly />
                    </label>
                    <label>
                      Product
                      <input type="text" value={selectedImportMatchIngredient.supplier_product_name || ''} readOnly />
                    </label>
                    <label>
                      Artikelcode
                      <input type="text" value={selectedImportMatchIngredient.supplier_product_code || ''} readOnly />
                    </label>
                    <label>
                      Prijs
                      <input
                        type="text"
                        value={formatCurrency(selectedImportMatchIngredient.supplier_price_ex_vat)}
                        readOnly
                      />
                    </label>
                    <label>
                      Eenheid
                      <input type="text" value={selectedImportMatchIngredient.supplier_unit || ''} readOnly />
                    </label>
                    <label>
                      Rekeneenheid
                      <input
                        type="text"
                        value={
                          selectedImportMatchIngredient.calculation_unit ||
                          selectedImportMatchIngredient.calculation_quantity_per_package
                            ? `${selectedImportMatchIngredient.calculation_quantity_per_package || ''} ${selectedImportMatchIngredient.calculation_unit || ''}`.trim()
                            : ''
                        }
                        readOnly
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                width: '100%',
                marginTop: '2rem',
                paddingTop: '1.25rem',
                paddingBottom: '0.25rem',
                borderTop: '1px solid #e5e7eb'
              }}
            >
              <button
                type="button"
                onClick={closeMatchPreview}
                disabled={activeManualActionId === selectedManualMatchIngredient.id}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                Annuleren
              </button>

              {canMatchImport ? (
                <button
                  type="button"
                  onClick={() =>
                    handleManualIngredientAction(selectedManualMatchIngredient.id, 'link-import')
                  }
                  disabled={activeManualActionId === selectedManualMatchIngredient.id}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Koppelen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {selectedIssue ? (
        <section className="card">
          <h3>Issue detail</h3>
          <div className="modal-grid two-col calm-grid">
            <label>
              Artikelcode
              <input type="text" value={selectedIssue.supplier_product_code || ''} readOnly />
            </label>
            <label>
              Productnaam
              <input type="text" value={selectedIssue.supplier_product_name || ''} readOnly />
            </label>
            <label>
              Issue type
              <input type="text" value={selectedIssue.issue_type || ''} readOnly />
            </label>
            <label>
              Aangemaakt
              <input type="text" value={formatDateTime(selectedIssue.created_at)} readOnly />
            </label>
          </div>

          <div className="modal-grid one-col calm-grid" style={{ marginTop: '1rem' }}>
            {(selectedIssuePayload?.variants || []).map((variant, index) => (
              <div
                key={`variant-${index}`}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  background: '#fff'
                }}
              >
                <h4 style={{ marginTop: 0 }}>Variant {index + 1}</h4>
                <div className="modal-grid two-col calm-grid">
                  <label>
                    Productnaam
                    <input type="text" value={variant.supplier_product_name || ''} readOnly />
                  </label>
                  <label>
                    Prijs ex BTW
                    <input type="text" value={variant.supplier_price_ex_vat || ''} readOnly />
                  </label>
                  <label>
                    Verkoopeenheid
                    <input type="text" value={variant.supplier_unit || ''} readOnly />
                  </label>
                  <label>
                    Netto inhoud
                    <input
                      type="text"
                      value={
                        variant.net_content_amount || variant.net_content_unit
                          ? `${variant.net_content_amount || ''} ${variant.net_content_unit || ''}`.trim()
                          : ''
                      }
                      readOnly
                    />
                  </label>
                  <label>
                    Gewicht per verpakking
                    <input
                      type="text"
                      value={
                        variant.package_weight_amount || variant.package_weight_unit
                          ? `${variant.package_weight_amount || ''} ${variant.package_weight_unit || ''}`.trim()
                          : ''
                      }
                      readOnly
                    />
                  </label>
                  <label className="full-width">
                    Inhoudsomschrijving
                    <input type="text" value={variant.supplier_pack_description || ''} readOnly />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {selectedIssue.issue_type === 'duplicate_conflict_in_file' && canMergeImport ? (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() =>
                  handleResolveIssue('choose_duplicate_variant', { chosen_variant_index: 0 })
                }
                disabled={isResolving || !(selectedIssuePayload?.variants || [])[0]}
              >
                Behoud eerste variant
              </button>
              <button
                type="button"
                onClick={() =>
                  handleResolveIssue('choose_duplicate_variant', { chosen_variant_index: 1 })
                }
                disabled={isResolving || !(selectedIssuePayload?.variants || [])[1]}
              >
                Behoud tweede variant
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleResolveIssue('ignore')}
                disabled={isResolving}
              >
                Negeer issue
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
