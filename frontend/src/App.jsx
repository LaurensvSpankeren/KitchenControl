import React, { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import AppShell from './components/AppShell'
import { apiClient, AUTH_UNAUTHORIZED_EVENT } from './api/client'
import Dashboard from './pages/Dashboard'
import Ingredientenbeheer from './pages/Ingredientenbeheer'
import Importbeheer from './pages/Importbeheer'
import Halffabricaten from './pages/Halffabricaten'
import Gerechten from './pages/Gerechten'
import Menukaarten from './pages/Menukaarten'
import Buffetten from './pages/Buffetten'
import Instellingen from './pages/Instellingen'
import Login from './pages/Login'

function ProtectedRoute({ isAuthenticated, children }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    function handleUnauthorizedSession() {
      apiClient.clearAuthSession()
      setCurrentUser(null)
      setIsAuthenticated(false)
      setIsAuthLoading(false)
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function restoreSession() {
      const token = apiClient.getAuthToken()
      if (!token) {
        if (!isCancelled) {
          setIsAuthenticated(false)
          setCurrentUser(null)
          setIsAuthLoading(false)
        }
        return
      }

      try {
        const user = await apiClient.getMe(token)
        if (!isCancelled) {
          apiClient.setAuthSession(token, user)
          setCurrentUser(user)
          setIsAuthenticated(true)
        }
      } catch (error) {
        if (!isCancelled) {
          if (error?.status === 401) {
            apiClient.clearAuthSession()
          }
          setCurrentUser(null)
          setIsAuthenticated(false)
        }
      } finally {
        if (!isCancelled) {
          setIsAuthLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      isCancelled = true
    }
  }, [])

  async function handleLogin(email, password) {
    const payload = await apiClient.login({ email, password })
    apiClient.setAuthSession(payload.token, payload.user)
    setCurrentUser(payload.user)
    setIsAuthenticated(true)
  }

  async function handleLogout() {
    const token = apiClient.getAuthToken()

    try {
      if (token) {
        await apiClient.logout(token)
      }
    } catch (error) {
      console.error('Logout mislukt, lokale sessie wordt alsnog beëindigd.', error)
    } finally {
      apiClient.clearAuthSession()
      setCurrentUser(null)
      setIsAuthenticated(false)
    }
  }

  if (isAuthLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>KitchenControl</h1>
          <p>Sessie herstellen...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <AppShell onLogout={handleLogout} currentUser={currentUser} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="ingredientenbeheer" element={<Ingredientenbeheer />} />
          <Route path="importbeheer" element={<Importbeheer />} />
          <Route path="halffabricaten" element={<Halffabricaten />} />
          <Route path="gerechten" element={<Gerechten />} />
          <Route path="menukaarten" element={<Menukaarten />} />
          <Route path="menus" element={<Navigate to="/menukaarten" replace />} />
          <Route path="buffetten" element={<Buffetten />} />
          <Route path="instellingen" element={<Instellingen />} />
        </Route>

        <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
