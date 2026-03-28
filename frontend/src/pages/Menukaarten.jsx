import React, { useEffect, useMemo, useRef, useState } from 'react'

import { apiClient } from '../api/client'

function formatDate(value) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString('nl-NL')
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '-'
  }
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR'
  }).format(Number(value))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const ALLERGEN_PRINT_COLUMNS = [
  { key: 'gluten', label: 'Gluten', matches: ['gluten', 'tarwe', 'rogge', 'gerst', 'haver', 'spelt', 'kamut'] },
  { key: 'schaaldieren', label: 'Schaald.', matches: ['schaaldieren'] },
  { key: 'ei', label: 'Ei', matches: ['ei'] },
  { key: 'vis', label: 'Vis', matches: ['vis'] },
  { key: 'pinda', label: 'Pinda', matches: ['pinda'] },
  { key: 'soja', label: 'Soja', matches: ['soja'] },
  { key: 'melk', label: 'Melk', matches: ['melk', 'lactose'] },
  {
    key: 'noten',
    label: 'Noten',
    matches: [
      'noten',
      'boomnoten',
      'hazelnoten',
      'walnoten',
      'pecannoten',
      'paranoten',
      'macadamianoten',
      'pistachenoten',
      'amandelen',
      'cashewnoten'
    ]
  },
  { key: 'selderij', label: 'Selderij', matches: ['selderij'] },
  { key: 'mosterd', label: 'Mosterd', matches: ['mosterd'] },
  { key: 'sesam', label: 'Sesam', matches: ['sesam'] },
  { key: 'sulfiet', label: 'Sulfiet', matches: ['sulfiet', 'sulfieten', 'zwaveldioxide en sulfieten'] },
  { key: 'lupine', label: 'Lupine', matches: ['lupine'] },
  { key: 'weekdieren', label: 'Weekd.', matches: ['weekdieren'] }
]

function normalizeAllergenValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function parseAllergenString(value) {
  if (!value) {
    return new Set()
  }
  return new Set(
    String(value)
      .split(/[,\n;]/)
      .map((item) => normalizeAllergenValue(item))
      .filter(Boolean)
  )
}

function hasAllergenMatch(allergens, column) {
  return column.matches.some((match) => allergens.has(match))
}

function statusLabel(status) {
  return status === 'active' ? 'Actief' : 'Concept'
}

function dateLabel(item) {
  if (item.status === 'active') {
    return item.activated_at ? `Actief sinds ${formatDate(item.activated_at)}` : 'Actief'
  }
  return 'Concept'
}

function renderDateCell(item) {
  if (item.status === 'active') {
    return (
      <div>
        <div>{item.activated_at ? `Actief sinds ${formatDate(item.activated_at)}` : 'Actief'}</div>
        {item.active_days != null ? (
          <div style={{ marginTop: '0.2rem', color: '#4b5563', fontSize: '0.92em' }}>
            Draait {item.active_days} dagen
          </div>
        ) : null}
      </div>
    )
  }

  return dateLabel(item)
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '-'
  }
  return `${Number(value).toFixed(1)}%`
}

function getMarginDotColor(status) {
  if (status === 'green') {
    return '#16a34a'
  }
  if (status === 'orange') {
    return '#f59e0b'
  }
  if (status === 'red') {
    return '#dc2626'
  }
  return null
}

function getMarginRowBackground(status) {
  if (status === 'red') {
    return '#fef2f2'
  }
  if (status === 'orange') {
    return '#fff7ed'
  }
  if (status === 'green') {
    return '#f8fafc'
  }
  return 'transparent'
}

function getSectionAverageMargin(sectie) {
  const values = (sectie.gerechten || [])
    .map((gerecht) => gerecht.gross_margin_percent)
    .filter((value) => value != null && !Number.isNaN(Number(value)))
    .map((value) => Number(value))

  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getToolActionButtonStyle(variant = 'default') {
  if (variant === 'danger') {
    return {
      padding: '0.35rem 0.65rem',
      minHeight: '2rem',
      borderRadius: '0.6rem',
      border: '1px solid #e5e7eb',
      background: '#f9fafb',
      color: '#6b7280',
      fontSize: '0.9rem',
      lineHeight: 1.2
    }
  }

  return {
    padding: '0.35rem 0.65rem',
    minHeight: '2rem',
    borderRadius: '0.6rem',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    fontSize: '0.9rem',
    lineHeight: 1.2
  }
}

export default function Menukaarten() {
  const [activeTab, setActiveTab] = useState('active')
  const [menukaarten, setMenukaarten] = useState([])
  const [archivedMenukaarten, setArchivedMenukaarten] = useState([])
  const [selectedMenukaartId, setSelectedMenukaartId] = useState(null)
  const [selectedMenukaart, setSelectedMenukaart] = useState(null)
  const [availableDishes, setAvailableDishes] = useState([])
  const [selectedDishId, setSelectedDishId] = useState('')
  const [selectedSectieId, setSelectedSectieId] = useState('')
  const [moveDishState, setMoveDishState] = useState(null)
  const [dragDishState, setDragDishState] = useState(null)
  const [dragOverDishState, setDragOverDishState] = useState(null)
  const [openActionsMenuId, setOpenActionsMenuId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSubmittingDetailAction, setIsSubmittingDetailAction] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const actionsMenuRef = useRef(null)

  const activeMenukaarten = useMemo(
    () =>
      menukaarten
        .filter((item) => item.status === 'active')
        .slice()
        .sort((left, right) => {
          if (!left.activated_at && !right.activated_at) {
            return 0
          }
          if (!left.activated_at) {
            return 1
          }
          if (!right.activated_at) {
            return -1
          }

          const leftTime = new Date(left.activated_at).getTime()
          const rightTime = new Date(right.activated_at).getTime()
          return leftTime - rightTime
        }),
    [menukaarten]
  )
  const conceptMenukaarten = useMemo(
    () => menukaarten.filter((item) => item.status !== 'active'),
    [menukaarten]
  )
  const editableSecties = useMemo(
    () => (selectedMenukaart?.secties || []).filter((sectie) => sectie.id != null),
    [selectedMenukaart]
  )
  const availableDishOptions = useMemo(() => {
    const linkedIds = new Set(
      (selectedMenukaart?.secties || []).flatMap((sectie) =>
        (sectie.gerechten || []).map((gerecht) => gerecht.id)
      )
    )
    return availableDishes.filter((dish) => !linkedIds.has(dish.id))
  }, [availableDishes, selectedMenukaart])
  const isSelectedArchived = !!selectedMenukaart?.is_archived
  const archivedActionUiStyles = {
    actionCell: {
      verticalAlign: 'middle',
      paddingTop: '12px',
      paddingBottom: '12px',
      textAlign: 'center'
    },
    rowActionsWrap: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      position: 'relative'
    },
    rowActionButton: {
      marginTop: 0,
      minHeight: '30px',
      height: '30px',
      padding: '0.35rem 0.6rem',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    rowMenuButton: {
      width: '30px',
      minWidth: '30px',
      height: '30px',
      marginTop: 0,
      padding: 0,
      lineHeight: 1,
      fontSize: '1rem'
    },
    rowMenu: {
      position: 'absolute',
      top: '100%',
      right: 0,
      zIndex: 15,
      marginTop: '0.2rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      background: '#fff',
      boxShadow: '0 6px 14px rgba(17,24,39,0.12)',
      minWidth: '140px',
      padding: '0.25rem'
    },
    rowMenuItem: {
      width: '100%',
      marginTop: 0,
      textAlign: 'left',
      border: '1px solid transparent',
      borderRadius: '6px',
      background: '#fff',
      padding: '0.45rem 0.5rem'
    }
  }

  async function loadMenukaarten() {
    setIsLoading(true)
    setError('')
    try {
      const [activeData, archivedData] = await Promise.all([
        apiClient.getMenukaarten(),
        apiClient.getArchivedMenukaarten()
      ])
      setMenukaarten(Array.isArray(activeData) ? activeData : [])
      setArchivedMenukaarten(Array.isArray(archivedData) ? archivedData : [])
    } catch {
      setError('Menukaarten laden mislukt.')
      setMenukaarten([])
      setArchivedMenukaarten([])
    } finally {
      setIsLoading(false)
    }
  }

  async function loadMenukaartDetail(menukaartId) {
    setIsLoadingDetail(true)
    try {
      const detail = await apiClient.getMenukaart(menukaartId)
      setSelectedMenukaart(detail)
      setSelectedDishId('')
      setMoveDishState(null)
      setDragDishState(null)
      setDragOverDishState(null)
      setSelectedSectieId((currentValue) => {
        const hasCurrent = (detail.secties || []).some((sectie) => String(sectie.id) === String(currentValue))
        if (hasCurrent) {
          return currentValue
        }
        const firstEditableSectie = (detail.secties || []).find((sectie) => sectie.id != null)
        return firstEditableSectie ? String(firstEditableSectie.id) : ''
      })
    } catch {
      setError('Menukaartdetail laden mislukt.')
      setSelectedMenukaart(null)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function loadAvailableDishes() {
    try {
      const data = await apiClient.getDishes()
      setAvailableDishes(Array.isArray(data) ? data : [])
    } catch {
      setAvailableDishes([])
    }
  }

  useEffect(() => {
    loadMenukaarten()
    loadAvailableDishes()
  }, [])

  useEffect(() => {
    if (!selectedMenukaartId) {
      setSelectedMenukaart(null)
      setSelectedSectieId('')
      setMoveDishState(null)
      setDragDishState(null)
      setDragOverDishState(null)
      return
    }
    loadMenukaartDetail(selectedMenukaartId)
  }, [selectedMenukaartId])

  useEffect(() => {
    if (!openActionsMenuId) {
      return
    }

    function handleOutsideClick(event) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setOpenActionsMenuId(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [openActionsMenuId])

  async function refreshAfterDetailMutation(menukaartId, successMessage) {
    await Promise.all([loadMenukaartDetail(menukaartId), loadMenukaarten()])
    setMessage(successMessage)
  }

  async function applyDetailResponse(detail, successMessage = '') {
    setSelectedMenukaart(detail)
    await loadMenukaarten()
    if (successMessage) {
      setMessage(successMessage)
    }
  }

  async function handleCreate() {
    const name = window.prompt('Naam van de nieuwe menukaart')
    if (!name || !name.trim()) {
      return
    }
    try {
      setError('')
      setMessage('')
      const created = await apiClient.createMenukaart({ name: name.trim() })
      setMessage('Menukaart aangemaakt.')
      await loadMenukaarten()
      setSelectedMenukaartId(created.id)
    } catch {
      setError('Menukaart aanmaken mislukt.')
    }
  }

  async function handleRename(item) {
    const name = window.prompt('Nieuwe naam voor menukaart', item.name || '')
    if (!name || !name.trim() || name.trim() === item.name) {
      return
    }
    try {
      setError('')
      setMessage('')
      await apiClient.updateMenukaart(item.id, { name: name.trim() })
      setMessage('Menukaart bijgewerkt.')
      await loadMenukaarten()
      if (selectedMenukaartId === item.id) {
        await loadMenukaartDetail(item.id)
      }
    } catch {
      setError('Menukaart bijwerken mislukt.')
    }
  }

  async function handleSetStatus(item, nextStatus) {
    try {
      setError('')
      setMessage('')
      await apiClient.updateMenukaart(item.id, { status: nextStatus })
      setMessage(
        nextStatus === 'active' ? 'Menukaart geactiveerd.' : 'Menukaart teruggezet naar concept.'
      )
      await loadMenukaarten()
      if (selectedMenukaartId === item.id) {
        await loadMenukaartDetail(item.id)
      }
    } catch {
      setError(
        nextStatus === 'active'
          ? 'Menukaart activeren mislukt.'
          : 'Menukaart terugzetten naar concept mislukt.'
      )
    }
  }

  async function handleArchive(item) {
    try {
      setError('')
      setMessage('')
      await apiClient.archiveMenukaart(item.id)
      setMessage('Menukaart gearchiveerd.')
      await loadMenukaarten()
      if (selectedMenukaartId === item.id) {
        setSelectedMenukaartId(null)
      }
    } catch {
      setError('Menukaart archiveren mislukt.')
    }
  }

  async function handleRestore(item) {
    if (!item?.id) {
      return
    }

    try {
      setError('')
      setMessage('')
      await apiClient.restoreMenukaart(item.id)
      await loadMenukaarten()
      setOpenActionsMenuId(null)
      setActiveTab('active')
      setSelectedMenukaartId(item.id)
      await loadMenukaartDetail(item.id)
      setMessage('Menukaart hersteld uit archief.')
    } catch {
      setError('Herstellen mislukt.')
    }
  }

  async function handleDeleteArchived(item) {
    if (!item?.id) {
      return
    }

    const confirmed = window.confirm('Weet je zeker dat je deze menukaart definitief wilt verwijderen?')
    if (!confirmed) {
      return
    }

    try {
      setError('')
      setMessage('')
      await apiClient.deleteMenukaart(item.id)
      await loadMenukaarten()
      setOpenActionsMenuId(null)
      if (selectedMenukaartId === item.id) {
        setSelectedMenukaartId(null)
      }
      setMessage('Menukaart verwijderd.')
    } catch {
      setError('Verwijderen mislukt.')
    }
  }

  async function handleDuplicate(item) {
    try {
      setError('')
      setMessage('')
      const duplicated = await apiClient.duplicateMenukaart(item.id)
      setMessage('Menukaart gedupliceerd.')
      await loadMenukaarten()
      setSelectedMenukaartId(duplicated.id)
    } catch {
      setError('Menukaart dupliceren mislukt.')
    }
  }

  async function handleCreateSectie() {
    if (!selectedMenukaart || isSubmittingDetailAction) {
      return
    }
    const title = window.prompt('Naam van de sectie')
    if (!title || !title.trim()) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.createMenukaartSectie(selectedMenukaart.id, { title: title.trim() })
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie toegevoegd.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie toevoegen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleRenameSectie(sectie) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    const title = window.prompt('Nieuwe sectienaam', sectie.title || '')
    if (!title || !title.trim() || title.trim() === sectie.title) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.updateMenukaartSectie(selectedMenukaart.id, sectie.id, { title: title.trim() })
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie bijwerken mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleDeleteSectie(sectie) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.deleteMenukaartSectie(selectedMenukaart.id, sectie.id)
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Sectie verwijderd.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie verwijderen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleAddDish() {
    if (!selectedMenukaart || !selectedDishId || !selectedSectieId || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.addGerechtToMenukaart(selectedMenukaart.id, Number(selectedDishId), Number(selectedSectieId))
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Gerecht toegevoegd aan menukaart.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht toevoegen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleRemoveDish(gerechtId) {
    if (!selectedMenukaart || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      await apiClient.removeGerechtFromMenukaart(selectedMenukaart.id, gerechtId)
      await refreshAfterDetailMutation(selectedMenukaart.id, 'Gerecht verwijderd uit menukaart.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht verwijderen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleMoveSectie(sectie, direction) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      const detail =
        direction === 'up'
          ? await apiClient.moveMenukaartSectieUp(selectedMenukaart.id, sectie.id)
          : await apiClient.moveMenukaartSectieDown(selectedMenukaart.id, sectie.id)
      await applyDetailResponse(detail, 'Sectievolgorde bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Sectie verplaatsen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  async function handleMoveDish(sectie, gerechtId, direction) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      const detail =
        direction === 'up'
          ? await apiClient.moveMenukaartGerechtUp(selectedMenukaart.id, sectie.id, gerechtId)
          : await apiClient.moveMenukaartGerechtDown(selectedMenukaart.id, sectie.id, gerechtId)
      await applyDetailResponse(detail, 'Gerechtvolgorde bijgewerkt.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht verplaatsen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function handleDishDragStart(sectie, gerecht, index) {
    if (sectie.id == null || isSubmittingDetailAction) {
      return
    }
    setDragDishState({
      sectieId: sectie.id,
      gerechtId: gerecht.id,
      index
    })
    setDragOverDishState(null)
  }

  function handleDishDragOver(event, sectie, gerecht, index) {
    if (
      dragDishState == null ||
      sectie.id == null ||
      dragDishState.sectieId !== sectie.id ||
      dragDishState.gerechtId === gerecht.id
    ) {
      return
    }
    event.preventDefault()
    if (
      dragOverDishState?.sectieId === sectie.id &&
      dragOverDishState?.gerechtId === gerecht.id &&
      dragOverDishState?.index === index
    ) {
      return
    }
    setDragOverDishState({
      sectieId: sectie.id,
      gerechtId: gerecht.id,
      index
    })
  }

  async function handleDishDrop(event, sectie, index) {
    event.preventDefault()
    if (
      dragDishState == null ||
      sectie.id == null ||
      dragDishState.sectieId !== sectie.id ||
      dragDishState.index === index ||
      isSubmittingDetailAction
    ) {
      setDragOverDishState(null)
      return
    }

    const dishId = dragDishState.gerechtId
    const fromIndex = dragDishState.index
    const toIndex = index

    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      let detail = null
      if (fromIndex < toIndex) {
        for (let currentIndex = fromIndex; currentIndex < toIndex; currentIndex += 1) {
          detail = await apiClient.moveMenukaartGerechtDown(selectedMenukaart.id, sectie.id, dishId)
        }
      } else {
        for (let currentIndex = fromIndex; currentIndex > toIndex; currentIndex -= 1) {
          detail = await apiClient.moveMenukaartGerechtUp(selectedMenukaart.id, sectie.id, dishId)
        }
      }
      if (detail) {
        await applyDetailResponse(detail, 'Gerechtvolgorde bijgewerkt.')
      }
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht slepen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
      setDragDishState(null)
      setDragOverDishState(null)
    }
  }

  function handleDishDragEnd() {
    setDragDishState(null)
    setDragOverDishState(null)
  }

  async function handleMoveDishToSectie(sectie, gerecht) {
    if (!selectedMenukaart || sectie.id == null || isSubmittingDetailAction) {
      return
    }
    const targetSecties = editableSecties.filter((item) => item.id !== sectie.id)
    if (targetSecties.length === 0) {
      return
    }
    setMoveDishState({
      gerechtId: gerecht.id,
      fromSectieId: sectie.id,
      targetSectieId: ''
    })
  }

  function handleCancelMoveDishToSectie() {
    setMoveDishState(null)
  }

  async function handleConfirmMoveDishToSectie() {
    if (!selectedMenukaart || !moveDishState?.targetSectieId || isSubmittingDetailAction) {
      return
    }

    const targetSectieId = Number(moveDishState.targetSectieId)
    const targetExists = editableSecties.some(
      (item) => item.id === targetSectieId && item.id !== moveDishState.fromSectieId
    )
    if (!targetExists) {
      setError('Ongeldige sectiekeuze voor verplaatsen.')
      return
    }

    setIsSubmittingDetailAction(true)
    setError('')
    setMessage('')
    try {
      const detail = await apiClient.moveMenukaartGerechtToSectie(
        selectedMenukaart.id,
        moveDishState.gerechtId,
        targetSectieId
      )
      setMoveDishState(null)
      await applyDetailResponse(detail, 'Gerecht verplaatst naar andere sectie.')
    } catch (actionError) {
      setError(actionError?.message || 'Gerecht verplaatsen mislukt.')
    } finally {
      setIsSubmittingDetailAction(false)
    }
  }

  function handlePrintMenukaart() {
    if (!selectedMenukaart) {
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      setError('Printweergave openen mislukt.')
      return
    }

    const sectionsHtml = (selectedMenukaart.secties || [])
      .map((sectie) => {
        const dishesHtml = (sectie.gerechten || [])
          .map(
            (gerecht) => `
              <div class="print-row">
                <span class="print-name">${escapeHtml(gerecht.name)}</span>
                <span class="print-dots"></span>
                <span class="print-price">${escapeHtml(formatCurrency(gerecht.sale_price_incl_vat))}</span>
              </div>
            `
          )
          .join('')

        return `
          <section class="print-section">
            <h2>${escapeHtml(sectie.title)}</h2>
            ${dishesHtml || '<p class="print-empty">Geen gerechten in deze sectie.</p>'}
          </section>
        `
      })
      .join('')

    printWindow.document.write(`
      <!doctype html>
      <html lang="nl">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(selectedMenukaart.name)}</title>
          <style>
            body {
              font-family: Georgia, "Times New Roman", serif;
              color: #111;
              background: #fff;
              margin: 32px;
            }
            h1 {
              margin: 0 0 24px;
              font-size: 28px;
              letter-spacing: 0.03em;
            }
            h2 {
              margin: 24px 0 12px;
              font-size: 18px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .print-section {
              margin-top: 20px;
              page-break-inside: avoid;
            }
            .print-row {
              display: flex;
              align-items: baseline;
              gap: 10px;
              margin: 8px 0;
              font-size: 17px;
            }
            .print-name {
              white-space: nowrap;
            }
            .print-dots {
              flex: 1;
              border-bottom: 1px dotted #666;
              transform: translateY(-2px);
            }
            .print-price {
              min-width: 90px;
              text-align: right;
              white-space: nowrap;
            }
            .print-empty {
              margin: 0;
              font-style: italic;
            }
            @media print {
              body {
                margin: 18px;
              }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(selectedMenukaart.name)}</h1>
          ${sectionsHtml || '<p>Geen secties of gerechten beschikbaar.</p>'}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  async function handlePrintAllergenenkaart() {
    if (!selectedMenukaart) {
      return
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) {
      setError('Printweergave openen mislukt.')
      return
    }

    setError('')
    setMessage('')

    try {
      const sectionsHtml = (selectedMenukaart.secties || [])
        .map((sectie) => {
          const rowsHtml = (sectie.gerechten || [])
            .map((gerecht) => {
              const allergens = parseAllergenString(gerecht.allergens_total)
              const cellsHtml = ALLERGEN_PRINT_COLUMNS.map(
                (column) =>
                  `<td class="allergen-cell">${hasAllergenMatch(allergens, column) ? '●' : ''}</td>`
              ).join('')

              return `
                <tr>
                  <td class="dish-name">${escapeHtml(gerecht.name)}</td>
                  ${cellsHtml}
                </tr>
              `
            })
            .join('')

          return `
            <section class="print-section">
              <h2>${escapeHtml(sectie.title)}</h2>
              <table class="allergen-table">
                <thead>
                  <tr>
                    <th class="dish-head">Gerecht</th>
                    ${ALLERGEN_PRINT_COLUMNS.map(
                      (column) => `<th class="allergen-head">${escapeHtml(column.label)}</th>`
                    ).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${
                    rowsHtml ||
                    `<tr><td class="empty-row" colspan="${ALLERGEN_PRINT_COLUMNS.length + 1}">Geen gerechten in deze sectie.</td></tr>`
                  }
                </tbody>
              </table>
            </section>
          `
        })
        .join('')

      printWindow.document.write(`
        <!doctype html>
        <html lang="nl">
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(selectedMenukaart.name)} - Allergenenkaart</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                color: #111;
                background: #fff;
                margin: 18px;
              }
              h1 {
                margin: 0 0 18px;
                font-size: 22px;
              }
              h2 {
                margin: 0 0 8px;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                border-bottom: 1px solid #111;
                padding-bottom: 4px;
              }
              .print-section {
                margin-top: 18px;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              .allergen-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
              }
              .allergen-table th,
              .allergen-table td {
                border: 1px solid #111;
                padding: 4px 6px;
                font-size: 11px;
                line-height: 1.2;
              }
              .dish-head,
              .dish-name {
                text-align: left;
                width: 26%;
              }
              .dish-name {
                font-weight: 600;
              }
              .allergen-head,
              .allergen-cell {
                text-align: center;
                width: 5.28%;
                white-space: nowrap;
              }
              .allergen-head {
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.01em;
              }
              .allergen-cell {
                font-size: 12px;
                font-weight: 700;
              }
              .empty-row {
                text-align: left;
                font-style: italic;
              }
              @media print {
                body {
                  margin: 10px;
                }
                .print-section {
                  page-break-inside: avoid;
                  break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(selectedMenukaart.name)} - Allergenenkaart</h1>
            ${sectionsHtml || '<p>Geen secties of gerechten beschikbaar.</p>'}
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    } catch {
      printWindow.close()
      setError('Allergenenkaart printen mislukt.')
    }
  }

  function renderMenukaartSection(title, items, emptyText) {
    return (
      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>{title}</h3>
        {items.length === 0 ? (
          <p>{emptyText}</p>
        ) : (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Status</th>
                  <th>Inhoud</th>
                  <th>Aantal gerechten</th>
                  <th>Binnen marge</th>
                  <th>Datum</th>
                  <th>Acties</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{statusLabel(item.status)}</td>
                    <td>
                      <div
                        title={item.sections_summary || '-'}
                        style={{
                          maxWidth: '260px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.sections_summary || '-'}
                      </div>
                    </td>
                    <td>{item.dish_count ?? 0}</td>
                    <td>
                      {item.margin_status ? (
                        <span
                          title={`Gemiddelde marge: ${formatPercent(item.average_margin_percent)}`}
                          style={{
                            display: 'inline-block',
                            width: '0.8rem',
                            height: '0.8rem',
                            borderRadius: '999px',
                            background: getMarginDotColor(item.margin_status),
                            verticalAlign: 'middle'
                          }}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{renderDateCell(item)}</td>
                    <td style={item.is_archived ? archivedActionUiStyles.actionCell : undefined}>
                      {item.is_archived ? (
                        <div
                          style={archivedActionUiStyles.rowActionsWrap}
                          ref={openActionsMenuId === item.id ? actionsMenuRef : null}
                        >
                          <button
                            type="button"
                            className="table-action-btn"
                            style={archivedActionUiStyles.rowActionButton}
                            onClick={() => setSelectedMenukaartId(item.id)}
                          >
                            Openen
                          </button>
                          <button
                            type="button"
                            className="table-action-btn"
                            aria-label="Meer acties"
                            style={archivedActionUiStyles.rowMenuButton}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenActionsMenuId((prev) => (prev === item.id ? null : item.id))
                            }}
                          >
                            ⋯
                          </button>
                          {openActionsMenuId === item.id ? (
                            <div
                              style={archivedActionUiStyles.rowMenu}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                style={archivedActionUiStyles.rowMenuItem}
                                onClick={() => handleRestore(item)}
                              >
                                ♻️ Herstellen
                              </button>
                              <button
                                type="button"
                                style={archivedActionUiStyles.rowMenuItem}
                                onClick={() => handleDeleteArchived(item)}
                              >
                                🗑 Verwijderen
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => setSelectedMenukaartId(item.id)}>
                            Beheren
                          </button>
                          <button type="button" onClick={() => handleRename(item)}>
                            Naam wijzigen
                          </button>
                          <button type="button" onClick={() => handleDuplicate(item)}>
                            Dupliceren
                          </button>
                          {item.status !== 'active' ? (
                            <button type="button" onClick={() => handleSetStatus(item, 'active')}>
                              Actief maken
                            </button>
                          ) : (
                            <button type="button" onClick={() => handleSetStatus(item, 'concept')}>
                              Terug naar concept
                            </button>
                          )}
                          <button type="button" className="secondary-btn" onClick={() => handleArchive(item)}>
                            Archiveren
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }

  return (
    <div>
      <header className="page-header">
        <h2>Menukaarten</h2>
        <p>Beheer hier menukaarten in ontwikkeling, actieve kaarten en archief.</p>
      </header>

      <section className="card">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={activeTab === 'active' ? '' : 'secondary-btn'}
            style={{ maxWidth: '180px' }}
          >
            Actief
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={activeTab === 'archived' ? '' : 'secondary-btn'}
            style={{ maxWidth: '180px' }}
          >
            Archief
          </button>
          <div style={{ marginLeft: 'auto', minWidth: '220px' }}>
            <button type="button" onClick={handleCreate}>
              Nieuwe menukaart
            </button>
          </div>
        </div>
        {message ? <p className="form-info inline-message">{message}</p> : null}
        {error ? <p>{error}</p> : null}
      </section>

      {selectedMenukaartId ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          {isLoadingDetail || !selectedMenukaart ? (
            <p>Menukaartdetail laden...</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ marginBottom: '0.45rem' }}>{selectedMenukaart.name}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '0.3rem 0.55rem',
                        borderRadius: '999px',
                        background: '#f3f4f6',
                        color: '#374151',
                        fontSize: '0.92rem'
                      }}
                    >
                      Status: {statusLabel(selectedMenukaart.status)}
                    </span>
                    <span
                      style={{
                        padding: '0.3rem 0.55rem',
                        borderRadius: '999px',
                        background: '#f3f4f6',
                        color: '#374151',
                        fontSize: '0.92rem'
                      }}
                    >
                      Secties: {(selectedMenukaart.secties || []).filter((sectie) => sectie.id != null).length}
                    </span>
                    <span
                      style={{
                        padding: '0.3rem 0.55rem',
                        borderRadius: '999px',
                        background: '#f3f4f6',
                        color: '#374151',
                        fontSize: '0.92rem'
                      }}
                    >
                      Gerechten: {selectedMenukaart.dish_count ?? 0}
                    </span>
                    {selectedMenukaart.average_margin_percent != null ? (
                      <span
                        style={{
                          padding: '0.3rem 0.55rem',
                          borderRadius: '999px',
                          background: '#f3f4f6',
                          color: '#374151',
                          fontSize: '0.92rem'
                        }}
                      >
                        Gem. marge: {formatPercent(selectedMenukaart.average_margin_percent)}
                      </span>
                    ) : null}
                    {selectedMenukaart.status === 'active' && selectedMenukaart.activated_at ? (
                      <span
                        style={{
                          padding: '0.3rem 0.55rem',
                          borderRadius: '999px',
                          background: '#f3f4f6',
                          color: '#374151',
                          fontSize: '0.92rem'
                        }}
                      >
                        Actief sinds: {formatDate(selectedMenukaart.activated_at)}
                        {selectedMenukaart.active_days != null
                          ? ` · ${selectedMenukaart.active_days} dagen`
                          : ''}
                      </span>
                    ) : selectedMenukaart.status !== 'active' ? (
                      <span
                        style={{
                          padding: '0.3rem 0.55rem',
                          borderRadius: '999px',
                          background: '#f3f4f6',
                          color: '#374151',
                          fontSize: '0.92rem'
                        }}
                      >
                        Concept
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {isSelectedArchived ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRestore(selectedMenukaart)}
                        style={{ maxWidth: '180px' }}
                      >
                        Herstellen
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleDeleteArchived(selectedMenukaart)}
                        style={{ maxWidth: '180px' }}
                      >
                        Verwijderen
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRename(selectedMenukaart)}
                        style={{ maxWidth: '180px' }}
                      >
                        Hernoemen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(selectedMenukaart)}
                        style={{ maxWidth: '180px' }}
                      >
                        Dupliceren
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleArchive(selectedMenukaart)}
                        style={{ maxWidth: '180px' }}
                      >
                        Archiveren
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintMenukaart}
                        style={{ maxWidth: '180px' }}
                      >
                        Print menukaart
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintAllergenenkaart}
                        style={{ maxWidth: '220px' }}
                      >
                        Print allergenenkaart
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setSelectedMenukaartId(null)}
                    style={{ maxWidth: '180px' }}
                  >
                    Sluiten
                  </button>
                </div>
              </div>

              {!isSelectedArchived ? (
                <div className="card" style={{ marginTop: '1.25rem', padding: '1rem' }}>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ marginBottom: '0.25rem' }}>Menukaart bewerken</h4>
                        <p style={{ margin: 0, color: '#4b5563' }}>
                          Voeg secties toe en koppel gerechten aan de juiste sectie.
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: '1rem',
                        gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)'
                      }}
                    >
                      <div
                        style={{
                          padding: '1rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.75rem',
                          background: '#f8fafc'
                        }}
                      >
                        <h5 style={{ margin: '0 0 0.35rem' }}>Sectie toevoegen</h5>
                        <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.4 }}>
                          Maak eerst een nieuwe sectie aan voor deze menukaart.
                        </p>
                        <button
                          type="button"
                          onClick={handleCreateSectie}
                          disabled={isSubmittingDetailAction}
                          style={{ maxWidth: '220px', marginTop: '0.9rem' }}
                        >
                          Sectie toevoegen
                        </button>
                      </div>

                      <div
                        style={{
                          padding: '1rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.75rem',
                          background: '#fff'
                        }}
                      >
                        <h5 style={{ margin: '0 0 0.35rem' }}>Gerecht toevoegen aan sectie</h5>
                        <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.4 }}>
                          Kies eerst de sectie en daarna het gerecht dat je wilt toevoegen.
                        </p>
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.75rem',
                            alignItems: 'flex-end',
                            flexWrap: 'wrap',
                            marginTop: '0.9rem'
                          }}
                        >
                          <label style={{ minWidth: '220px', flex: '1 1 220px' }}>
                            <span style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                              Sectie
                            </span>
                            <select
                              value={selectedSectieId}
                              onChange={(event) => setSelectedSectieId(event.target.value)}
                              disabled={isSubmittingDetailAction || editableSecties.length === 0}
                            >
                              <option value="">Selecteer een sectie</option>
                              {editableSecties.map((sectie) => (
                                <option key={sectie.id} value={sectie.id}>
                                  {sectie.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label style={{ minWidth: '260px', flex: '1 1 260px' }}>
                            <span style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                              Gerecht
                            </span>
                            <select
                              value={selectedDishId}
                              onChange={(event) => setSelectedDishId(event.target.value)}
                              disabled={isSubmittingDetailAction || availableDishOptions.length === 0}
                            >
                              <option value="">Selecteer een gerecht</option>
                              {availableDishOptions.map((dish) => (
                                <option key={dish.id} value={dish.id}>
                                  {dish.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={handleAddDish}
                            disabled={!selectedDishId || !selectedSectieId || isSubmittingDetailAction}
                            style={{ maxWidth: '220px' }}
                          >
                            Gerecht toevoegen
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
                {(selectedMenukaart.secties || []).length === 0 ? (
                  <p>Nog geen secties op deze menukaart.</p>
                ) : (
                  selectedMenukaart.secties.map((sectie) => (
                    <section key={sectie.id ?? `unassigned-${sectie.title}`} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ marginBottom: '0.25rem' }}>{sectie.title}</h4>
                          <p style={{ color: '#4b5563', margin: 0 }}>
                            {sectie.gerechten?.length || 0} gerechten
                            {getSectionAverageMargin(sectie) != null
                              ? ` · Gemiddelde marge ${formatPercent(getSectionAverageMargin(sectie))}`
                              : ''}
                          </p>
                        </div>
                        {sectie.id != null && !isSelectedArchived ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: '0.45rem',
                              flexWrap: 'wrap',
                              padding: '0.35rem',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.75rem',
                              background: '#f8fafc'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleMoveSectie(sectie, 'up')}
                              disabled={isSubmittingDetailAction}
                              style={{ ...getToolActionButtonStyle(), maxWidth: '120px' }}
                            >
                              Omhoog
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSectie(sectie, 'down')}
                              disabled={isSubmittingDetailAction}
                              style={{ ...getToolActionButtonStyle(), maxWidth: '120px' }}
                            >
                              Omlaag
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRenameSectie(sectie)}
                              disabled={isSubmittingDetailAction}
                              style={{ ...getToolActionButtonStyle(), maxWidth: '140px' }}
                            >
                              Hernoemen
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleDeleteSectie(sectie)}
                              disabled={isSubmittingDetailAction}
                              style={{ ...getToolActionButtonStyle('danger'), maxWidth: '140px' }}
                            >
                              Verwijderen
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {sectie.gerechten?.length ? (
                        <div className="table-scroll" style={{ marginTop: '1.1rem' }}>
                          <table className="ingredients-table">
                            <thead>
                              <tr>
                                <th>Naam</th>
                                <th>Prijs</th>
                                <th>Marge</th>
                                {!isSelectedArchived ? <th>Acties</th> : null}
                              </tr>
                            </thead>
                            <tbody>
                              {sectie.gerechten.map((gerecht, index) => (
                                <tr
                                  key={gerecht.id}
                                  draggable={sectie.id != null && !isSubmittingDetailAction}
                                  onDragStart={() => handleDishDragStart(sectie, gerecht, index)}
                                  onDragOver={(event) => handleDishDragOver(event, sectie, gerecht, index)}
                                  onDrop={(event) => handleDishDrop(event, sectie, index)}
                                  onDragEnd={handleDishDragEnd}
                                  style={{
                                    background: getMarginRowBackground(gerecht.margin_status),
                                    opacity:
                                      dragDishState?.sectieId === sectie.id &&
                                      dragDishState?.gerechtId === gerecht.id
                                        ? 0.55
                                        : 1,
                                    outline:
                                      dragOverDishState?.sectieId === sectie.id &&
                                      dragOverDishState?.gerechtId === gerecht.id
                                        ? '2px solid #93c5fd'
                                        : 'none',
                                    outlineOffset:
                                      dragOverDishState?.sectieId === sectie.id &&
                                      dragOverDishState?.gerechtId === gerecht.id
                                        ? '-2px'
                                        : 0
                                  }}
                                >
                                  <td style={{ fontWeight: 500 }}>{gerecht.name}</td>
                                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                                    {formatCurrency(gerecht.sale_price_incl_vat)}
                                  </td>
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    {gerecht.margin_status ? (
                                      <span
                                        title={`Marge: ${formatPercent(gerecht.gross_margin_percent)}`}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.45rem',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            width: '0.75rem',
                                            height: '0.75rem',
                                            borderRadius: '999px',
                                            background: getMarginDotColor(gerecht.margin_status)
                                          }}
                                        />
                                        <span>{formatPercent(gerecht.gross_margin_percent)}</span>
                                      </span>
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                  {!isSelectedArchived ? (
                                    <td style={{ minWidth: '340px' }}>
                                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveDish(sectie, gerecht.id, 'up')}
                                          disabled={isSubmittingDetailAction || sectie.id == null}
                                          style={getToolActionButtonStyle()}
                                        >
                                          Omhoog
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveDish(sectie, gerecht.id, 'down')}
                                          disabled={isSubmittingDetailAction || sectie.id == null}
                                          style={getToolActionButtonStyle()}
                                        >
                                          Omlaag
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveDishToSectie(sectie, gerecht)}
                                          disabled={isSubmittingDetailAction || sectie.id == null}
                                          style={getToolActionButtonStyle()}
                                        >
                                          Verplaatsen
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary-btn"
                                          onClick={() => handleRemoveDish(gerecht.id)}
                                          disabled={isSubmittingDetailAction}
                                          style={getToolActionButtonStyle('danger')}
                                        >
                                          Verwijderen
                                        </button>
                                      </div>
                                      {moveDishState?.gerechtId === gerecht.id &&
                                      moveDishState?.fromSectieId === sectie.id ? (
                                        <div
                                          style={{
                                            display: 'flex',
                                            gap: '0.5rem',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            marginTop: '0.75rem'
                                          }}
                                        >
                                          <select
                                            value={moveDishState.targetSectieId}
                                            onChange={(event) =>
                                              setMoveDishState((currentState) =>
                                                currentState == null
                                                  ? null
                                                  : { ...currentState, targetSectieId: event.target.value }
                                              )
                                            }
                                            disabled={isSubmittingDetailAction}
                                          >
                                            <option value="">Kies doelsectie</option>
                                            {editableSecties
                                              .filter((item) => item.id !== sectie.id)
                                              .map((item) => (
                                                <option key={item.id} value={item.id}>
                                                  {item.title}
                                                </option>
                                              ))}
                                          </select>
                                          <button
                                            type="button"
                                            onClick={handleConfirmMoveDishToSectie}
                                            disabled={!moveDishState.targetSectieId || isSubmittingDetailAction}
                                            style={getToolActionButtonStyle()}
                                          >
                                            Bevestigen
                                          </button>
                                          <button
                                            type="button"
                                            className="secondary-btn"
                                            onClick={handleCancelMoveDishToSectie}
                                            disabled={isSubmittingDetailAction}
                                            style={getToolActionButtonStyle('danger')}
                                          >
                                            Annuleren
                                          </button>
                                        </div>
                                      ) : null}
                                    </td>
                                  ) : null}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p style={{ marginTop: '1rem' }}>Nog geen gerechten in deze sectie.</p>
                      )}
                    </section>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      ) : null}

      {isLoading ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <p>Menukaarten laden...</p>
        </section>
      ) : activeTab === 'active' ? (
        <>
          {renderMenukaartSection(
            'Actieve menukaarten',
            activeMenukaarten,
            'Geen actieve menukaarten gevonden.'
          )}
          {renderMenukaartSection(
            'Menukaarten in ontwikkeling',
            conceptMenukaarten,
            'Geen menukaarten in ontwikkeling gevonden.'
          )}
        </>
      ) : (
        renderMenukaartSection(
          'Gearchiveerde menukaarten',
          archivedMenukaarten,
          'Geen gearchiveerde menukaarten gevonden.'
        )
      )}
    </div>
  )
}
