const CURRENT_USER_STORAGE_KEYS = ['currentUser', 'user', 'kc_user', 'kitchencontrol_user']

export function getCurrentUser() {
  if (typeof window === 'undefined') {
    return null
  }

  for (const key of CURRENT_USER_STORAGE_KEYS) {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch {
      // Ignore malformed storage content and continue fallback chain.
    }
  }

  return null
}

export function getCurrentUserRole() {
  const currentUser = getCurrentUser()
  return String(
    currentUser?.role ||
      currentUser?.user_role ||
      currentUser?.role_name ||
      currentUser?.type ||
      ''
  ).trim()
}
