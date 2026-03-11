import React, { useState } from 'react'

import { apiClient } from '../api/client'

export default function Importbeheer() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [importMessage, setImportMessage] = useState('')
  const [isImporting, setIsImporting] = useState(false)

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
    </div>
  )
}
