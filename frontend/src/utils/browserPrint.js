function isIOSPlatform() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function parsePrintHtml(printHtml) {
  const parser = new DOMParser()
  const parsedDocument = parser.parseFromString(printHtml, 'text/html')
  const styleText = Array.from(parsedDocument.querySelectorAll('style'))
    .map((styleNode) => styleNode.textContent || '')
    .join('\n')

  return {
    bodyHtml: parsedDocument.body?.innerHTML || '',
    bodyStyle: parsedDocument.body?.getAttribute('style') || '',
    styleText
  }
}

export function isIOSPrintDevice() {
  return isIOSPlatform()
}

export async function printHtmlInCurrentWindow(printHtml) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const { bodyHtml, bodyStyle, styleText } = parsePrintHtml(printHtml)
  const originalBodyStyle = document.body.getAttribute('style')
  const originalContent = document.createDocumentFragment()

  while (document.body.firstChild) {
    originalContent.appendChild(document.body.firstChild)
  }

  const printContainer = document.createElement('div')
  printContainer.style.background = '#ffffff'
  printContainer.style.minHeight = '100vh'
  if (bodyStyle) {
    printContainer.style.cssText += `;${bodyStyle}`
  }
  printContainer.innerHTML = bodyHtml

  const styleNode = styleText ? document.createElement('style') : null
  if (styleNode) {
    styleNode.textContent = styleText
  }

  document.body.replaceChildren()
  document.body.style.margin = '0'
  document.body.style.background = '#ffffff'
  if (styleNode) {
    document.body.appendChild(styleNode)
  }
  document.body.appendChild(printContainer)

  await new Promise((resolve) => window.setTimeout(resolve, 80))

  return await new Promise((resolve) => {
    let didCleanup = false

    const cleanup = () => {
      if (didCleanup) {
        return
      }
      didCleanup = true
      window.removeEventListener('afterprint', cleanup)
      window.clearTimeout(fallbackTimeoutId)

      document.body.replaceChildren()
      if (originalBodyStyle === null) {
        document.body.removeAttribute('style')
      } else {
        document.body.setAttribute('style', originalBodyStyle)
      }
      document.body.appendChild(originalContent)
      resolve(true)
    }

    const fallbackTimeoutId = window.setTimeout(cleanup, 6000)
    window.addEventListener('afterprint', cleanup, { once: true })

    try {
      window.print()
    } catch {
      cleanup()
    }
  })
}
