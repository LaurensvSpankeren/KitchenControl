import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/inkoopproducten', label: 'Inkoopproducten' },
  { to: '/halffabricaten', label: 'Halffabricaten' },
  { to: '/gerechten', label: 'Gerechten' },
  { to: '/menus', label: 'Menu\'s' },
  { to: '/buffetten', label: 'Buffetten' }
]

export default function AppShell({ onLogout }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <h1>KitchenControl</h1>
          <p>Calculatie & receptuur</p>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-link${isActive ? ' is-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button type="button" className="logout-btn" onClick={onLogout}>
          Uitloggen
        </button>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
