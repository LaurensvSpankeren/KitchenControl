import React, { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'

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

  const duplicateIssues = useMemo(
    () => issues.filter((issue) => issue.issue_type === 'duplicate_conflict_in_file'),
    [issues]
  )

  const selectedIssuePayload = useMemo(
    () => parseJsonString(selectedIssue?.payload_json),
    [selectedIssue]
  )

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

    const targetMatchIngredient = manualMatchIngredients.find((ingredient) => ingredient.id === ingredientId)
    const isMatchAction = Boolean(targetMatchIngredient)
    const setMessage = isMatchAction ? setManualMatchMessage : setManualReviewMessage
    const setError = isMatchAction ? setManualMatchError : setManualReviewError

    setActiveManualActionId(ingredientId)
    setError('')
    setMessage('')

    try {
      if (action === 'review') {
        await apiClient.reviewManualIngredient(ingredientId)
        setMessage('Handmatig ingrediënt gemarkeerd als reviewed.')
      } else if (action === 'archive') {
        await apiClient.archiveManualIngredient(ingredientId)
        setMessage('Handmatig ingrediënt gearchiveerd.')
      } else if (action === 'delete') {
        await apiClient.deleteManualIngredient(ingredientId)
        setMessage('Handmatig ingrediënt verwijderd.')
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

  async function handleStaleImportIngredientAction(ingredientId, action) {
    if (!ingredientId || activeStaleImportActionId) {
      return
    }

    setActiveStaleImportActionId(ingredientId)
    setStaleImportError('')
    setStaleImportMessage('')

    try {
      if (action === 'archive') {
        await apiClient.archiveImportIngredient(ingredientId)
        setStaleImportMessage('Importingrediënt gearchiveerd.')
      } else if (action === 'delete') {
        await apiClient.deleteImportIngredient(ingredientId)
        setStaleImportMessage('Importingrediënt verwijderd.')
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
    loadIssues()
    loadStaleImportIngredients()
    loadManualIngredients()
    loadManualMatchIngredients()
  }, [])

  return (
    <div>
      <header className="page-header">
        <h2>Importbeheer</h2>
        <p>Beheer hier CSV-imports, handmatige ingrediënten en importcontroles.</p>
      </header>

      <section className="card">
        <h3>Handmatig CSV uploaden</h3>
        <p>Upload hier CSV-bestanden om inkoopproducten te synchroniseren.</p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
        <button type="button" onClick={handleImport} disabled={!selectedFile || isImporting}>
          {isImporting ? 'Bezig met importeren...' : 'CSV uploaden'}
        </button>
        {importMessage ? <p>{importMessage}</p> : null}
      </section>

      <section className="card">
        <h3>Handmatige ingrediënten controleren</h3>
        <p>Controleer hier handmatig ingevoerde ingrediënten.</p>

        <div style={{ marginTop: '1.5rem' }}>
          <h4>Import match controleren</h4>
          <p>Beoordeel of een handmatig ingrediënt gekoppeld kan worden aan een importproduct.</p>
          {manualMatchMessage ? <p className="form-info inline-message">{manualMatchMessage}</p> : null}
          {manualMatchError ? <p>{manualMatchError}</p> : null}
          {isLoadingManualMatchIngredients ? (
            <p>Handmatige ingrediënten met importmatch laden...</p>
          ) : manualMatchIngredients.length === 0 ? (
            <p>Geen handmatige ingrediënten met importmatch gevonden.</p>
          ) : (
            <div className="table-scroll">
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
                            <button
                              type="button"
                              onClick={() => handleManualIngredientAction(ingredient.id, 'review')}
                              disabled={isBusy}
                            >
                              Reviewen
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
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleManualIngredientAction(ingredient.id, 'archive')}
                              disabled={isBusy}
                            >
                              Archiveren
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleManualIngredientAction(ingredient.id, 'delete')}
                              disabled={isBusy}
                            >
                              Verwijderen
                            </button>
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

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <h4>Inactieve handmatige ingrediënten</h4>
          <p>Deze ingrediënten zijn 45 dagen of langer niet bijgewerkt. Controleer ze en werk ze bij indien nodig.</p>
          {manualReviewMessage ? <p className="form-info inline-message">{manualReviewMessage}</p> : null}
          {manualReviewError ? <p>{manualReviewError}</p> : null}
          {isLoadingManualIngredients ? (
            <p>Handmatige ingrediënten laden...</p>
          ) : manualIngredients.length === 0 ? (
            <p>Geen handmatige ingrediënten ter controle gevonden.</p>
          ) : (
            <div className="table-scroll">
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
                            <button
                              type="button"
                              onClick={() => handleManualIngredientAction(ingredient.id, 'review')}
                              disabled={isBusy}
                            >
                              Reviewen
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
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleManualIngredientAction(ingredient.id, 'archive')}
                              disabled={isBusy}
                            >
                              Archiveren
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleManualIngredientAction(ingredient.id, 'delete')}
                              disabled={isBusy}
                            >
                              Verwijderen
                            </button>
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

      <section className="card">
        <h3>Import ingrediënten controleren</h3>
        <p>Controleer hier geïmporteerde ingrediënten.</p>

        <div style={{ marginTop: '1.5rem' }}>
          <h4>Inactieve import ingrediënten</h4>
          <p>Deze ingrediënten zijn 45 dagen of langer niet vernieuwd via import. Controleer ze en werk ze bij indien nodig.</p>
          {staleImportMessage ? <p className="form-info inline-message">{staleImportMessage}</p> : null}
          {staleImportError ? <p>{staleImportError}</p> : null}
          {isLoadingStaleImportIngredients ? (
            <p>Importingrediënten laden...</p>
          ) : staleImportIngredients.length === 0 ? (
            <p>Geen importingrediënten ter controle gevonden.</p>
          ) : (
            <div className="table-scroll">
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
                              onClick={() => handleStaleImportIngredientAction(ingredient.id, 'delete')}
                              disabled={isBusy}
                            >
                              Verwijderen
                            </button>
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

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <h4>Duplicaten in import</h4>
          <p>Mogelijke dubbele importproducten gevonden. Controleer en voeg samen.</p>
          {issuesMessage ? <p className="form-info inline-message">{issuesMessage}</p> : null}
          {issueError ? <p>{issueError}</p> : null}
          {isLoadingIssues ? (
            <p>Issues laden...</p>
          ) : duplicateIssues.length === 0 ? (
            <p>Geen open duplicate issues gevonden.</p>
          ) : (
            <div className="table-scroll">
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
                        <button type="button" onClick={() => handleOpenIssue(issue.id)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

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

            <div className="modal-footer">
              <button
                type="button"
                onClick={() =>
                  handleManualIngredientAction(selectedManualMatchIngredient.id, 'link-import')
                }
                disabled={activeManualActionId === selectedManualMatchIngredient.id}
              >
                Koppelen
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={closeMatchPreview}
                disabled={activeManualActionId === selectedManualMatchIngredient.id}
              >
                Annuleren
              </button>
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

          {selectedIssue.issue_type === 'duplicate_conflict_in_file' ? (
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
