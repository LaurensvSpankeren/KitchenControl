import React from 'react'

export default function Login({ onLogin }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>KitchenControl</h1>
        <p>Inloggen om dashboards en modules te openen.</p>
        <input type="text" placeholder="E-mailadres" />
        <input type="password" placeholder="Wachtwoord" />
        <button type="button" onClick={onLogin}>
          Inloggen
        </button>
      </div>
    </div>
  )
}
