import React, { useState } from 'react'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      await onLogin(email.trim(), password)
    } catch (error) {
      setErrorMessage(error?.message || 'Inloggen mislukt.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>KitchenControl</h1>
        <p>Inloggen om dashboards en modules te openen.</p>
        <input
          type="email"
          placeholder="E-mailadres"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Wachtwoord"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
        {errorMessage ? <p style={{ margin: 0, color: '#b91c1c' }}>{errorMessage}</p> : null}
        <button type="submit" disabled={isSubmitting || !email.trim() || !password}>
          Inloggen
        </button>
      </form>
    </div>
  )
}
