import React, { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import Ingredientenbeheer from './pages/Ingredientenbeheer'
import Importbeheer from './pages/Importbeheer'
import Halffabricaten from './pages/Halffabricaten'
import Gerechten from './pages/Gerechten'
import Menus from './pages/Menus'
import Buffetten from './pages/Buffetten'
import Login from './pages/Login'

function ProtectedRoute({ isAuthenticated, children }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLogin={() => setIsAuthenticated(true)} />
            )
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <AppShell onLogout={() => setIsAuthenticated(false)} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="ingredientenbeheer" element={<Ingredientenbeheer />} />
          <Route path="importbeheer" element={<Importbeheer />} />
          <Route path="halffabricaten" element={<Halffabricaten />} />
          <Route path="gerechten" element={<Gerechten />} />
          <Route path="menus" element={<Menus />} />
          <Route path="buffetten" element={<Buffetten />} />
        </Route>

        <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
