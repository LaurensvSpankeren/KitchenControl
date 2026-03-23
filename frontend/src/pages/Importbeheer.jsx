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

    setIsResolving(true)
    setIssueError('')
    setIssuesMessage('')

    try {
      const resolved = await apiClient.resolveImportIssue(selectedIssueId, { action, payload })
      setSelectedIssue(resolved)
      setIssuesMessage('Keuze opgeslagen.')
      await loadIssues()
    } catch {
      setIssueError('Issue opslaan mislukt.')
    } finally {
      setIsResolving(false)
    }
  }

  useEffect(() => {
    loadIssues()
  }, [])

  return (
    <div>
      <header className="page-header">
        <h2>Importbeheer</h2>
        <p>Upload hier CSV-bestanden om inkoopproducten te synchroniseren.</p>
      </header>

      <section className="card">
        <h3>CSV importeren</h3>
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
        <h3>Open duplicate issues</h3>
        <p>Alleen issues van type `duplicate_conflict_in_file` worden hier getoond.</p>
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
      </section>

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
