function isIOSDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function waitForImagesInWindow(printWindow, timeoutMs = 2000) {
  const images = Array.from(printWindow.document.images || [])
  if (images.length === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let resolved = false
    let remaining = images.length

    const finish = () => {
      if (resolved) {
        return
      }
      resolved = true
      resolve()
    }

    const markDone = () => {
      remaining -= 1
      if (remaining <= 0) {
        finish()
      }
    }

    const timer = window.setTimeout(finish, timeoutMs)

    images.forEach((image) => {
      if (image.complete) {
        markDone()
        return
      }

      const handleSettled = () => {
        image.removeEventListener('load', handleSettled)
        image.removeEventListener('error', handleSettled)
        markDone()
      }

      image.addEventListener('load', handleSettled)
      image.addEventListener('error', handleSettled)
    })

    Promise.resolve().then(() => {
      if (remaining <= 0) {
        window.clearTimeout(timer)
        finish()
      }
    })
  })
}

function waitForFontsInWindow(printWindow, timeoutMs = 2000) {
  const fontsReady = printWindow.document?.fonts?.ready
  if (!fontsReady || typeof fontsReady.then !== 'function') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let resolved = false

    const finish = () => {
      if (resolved) {
        return
      }
      resolved = true
      printWindow.clearTimeout(timer)
      resolve()
    }

    const timer = printWindow.setTimeout(finish, timeoutMs)
    fontsReady.then(finish, finish)
  })
}

export async function printHtml(
  html,
  {
    windowFeatures = 'width=900,height=700',
    waitForImages = false,
    waitForFonts = false
  } = {}
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  if (isIOSDevice()) {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const inlineStyles = Array.from(parsed.head.querySelectorAll('style'))
      .map((node) => node.textContent || '')
      .join('\n')
    const originalNodes = Array.from(document.body.childNodes)
    const stash = document.createDocumentFragment()
    originalNodes.forEach((node) => stash.appendChild(node))

    const originalStyle = document.body.getAttribute('style')
    const host = document.createElement('div')
    host.id = 'ios-print-replacement'
    host.style.background = 'white'
    host.style.minHeight = '100vh'
    host.style.width = '100%'

    const styleEl = document.createElement('style')
    styleEl.textContent = inlineStyles
    host.appendChild(styleEl)

    const content = document.createElement('div')
    content.innerHTML = parsed.body?.innerHTML || html
    host.appendChild(content)

    document.body.innerHTML = ''
    document.body.style.margin = '0'
    document.body.style.background = 'white'
    document.body.appendChild(host)

    if (waitForFonts) {
      await waitForFontsInWindow(window)
    }

    return await new Promise((resolve) => {
      let printed = false
      let cleanedUp = false
      let fallbackTimer = null
      let cleanupTimer = null

      const cleanup = () => {
        if (cleanedUp) {
          return
        }
        cleanedUp = true
        if (fallbackTimer) {
          clearTimeout(fallbackTimer)
        }
        if (cleanupTimer) {
          clearTimeout(cleanupTimer)
        }
        window.removeEventListener('afterprint', scheduleCleanup)
        document.body.innerHTML = ''
        document.body.appendChild(stash)
        if (originalStyle === null) {
          document.body.removeAttribute('style')
        } else {
          document.body.setAttribute('style', originalStyle)
        }
        resolve(true)
      }

      const scheduleCleanup = () => {
        if (cleanupTimer) {
          clearTimeout(cleanupTimer)
        }
        cleanupTimer = setTimeout(cleanup, 6000)
      }

      const doPrint = () => {
        if (printed) {
          return
        }
        printed = true
        window.addEventListener('afterprint', scheduleCleanup, { once: true })
        scheduleCleanup()
        try {
          window.focus()
        } catch {}
        setTimeout(() => {
          try {
            window.print()
          } catch {
            cleanup()
          }
        }, 450)
      }

      const onReady = () => {
        window.requestAnimationFrame?.(() => {
          window.requestAnimationFrame?.(() => {
            setTimeout(() => {
              doPrint()
            }, 300)
          })
        })
      }

      fallbackTimer = setTimeout(onReady, 900)
    })
  }

  const printWindow = window.open('', '_blank', windowFeatures)
  if (!printWindow) {
    return false
  }

  printWindow.document.write(html)
  printWindow.document.close()

  if (waitForFonts) {
    await waitForFontsInWindow(printWindow)
  }

  if (waitForImages) {
    await waitForImagesInWindow(printWindow)
  }

  printWindow.focus()
  printWindow.print()
  return true
}
