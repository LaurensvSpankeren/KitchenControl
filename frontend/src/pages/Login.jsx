import React, { useState } from 'react'

import { API_BASE_URL } from '../api/client'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [signupStep, setSignupStep] = useState(1)
  const [activationCode, setActivationCode] = useState('')
  const [activationCodeError, setActivationCodeError] = useState('')
  const [isCheckingCode, setIsCheckingCode] = useState(false)
  const [signupForm, setSignupForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_repeat: ''
  })
  const [signupError, setSignupError] = useState('')
  const [isSigningUp, setIsSigningUp] = useState(false)

  function switchToSignupMode() {
    setIsSignupMode(true)
    setSignupStep(1)
    setActivationCodeError('')
    setSignupError('')
    setErrorMessage('')
  }

  function switchToLoginMode() {
    setIsSignupMode(false)
    setSignupStep(1)
    setActivationCode('')
    setActivationCodeError('')
    setSignupError('')
  }

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

  async function handleActivationCodeSubmit(event) {
    event.preventDefault()
    if (isCheckingCode) {
      return
    }

    try {
      setIsCheckingCode(true)
      setActivationCodeError('')
      setSignupError('')

      const response = await fetch(`${API_BASE_URL}/api/auth/activation-codes/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: activationCode })
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.valid) {
        setActivationCodeError(payload?.detail || 'Activatiecode is ongeldig of verlopen.')
        return
      }

      setSignupStep(2)
    } catch {
      setActivationCodeError('Activatiecode controleren mislukt.')
    } finally {
      setIsCheckingCode(false)
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault()
    if (isSigningUp) {
      return
    }

    try {
      setIsSigningUp(true)
      setSignupError('')

      const response = await fetch(`${API_BASE_URL}/api/auth/signup-with-activation-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: activationCode,
          first_name: signupForm.first_name,
          last_name: signupForm.last_name,
          email: signupForm.email,
          password: signupForm.password,
          password_repeat: signupForm.password_repeat
        })
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSignupError(payload?.detail || 'Account aanmaken mislukt.')
        return
      }

      await onLogin(signupForm.email.trim(), signupForm.password)
    } catch (error) {
      setSignupError(error?.message || 'Account aanmaken mislukt.')
    } finally {
      setIsSigningUp(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {!isSignupMode ? (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
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
              {isSubmitting ? 'Inloggen...' : 'Inloggen'}
            </button>
            <button type="button" onClick={switchToSignupMode}>
              Heb je nog geen account? Meld je hier aan
            </button>
          </form>
        ) : signupStep === 1 ? (
          <form onSubmit={handleActivationCodeSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <h1>Account aanmaken</h1>
            <p>Voer eerst je activatiecode in om verder te gaan.</p>
            <input
              type="text"
              placeholder="Activatiecode"
              value={activationCode}
              onChange={(event) => setActivationCode(event.target.value)}
              autoComplete="off"
            />
            {activationCodeError ? <p style={{ margin: 0, color: '#b91c1c' }}>{activationCodeError}</p> : null}
            <button type="submit" disabled={isCheckingCode || !activationCode.trim()}>
              {isCheckingCode ? 'Controleren...' : 'Volgende'}
            </button>
            <button type="button" onClick={switchToLoginMode}>
              Terug naar login
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignupSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <h1>Account aanmaken</h1>
            <p>Vul je gegevens in om je account af te ronden.</p>
            <input
              type="text"
              placeholder="Voornaam"
              value={signupForm.first_name}
              onChange={(event) =>
                setSignupForm((current) => ({ ...current, first_name: event.target.value }))
              }
              autoComplete="given-name"
            />
            <input
              type="text"
              placeholder="Achternaam"
              value={signupForm.last_name}
              onChange={(event) =>
                setSignupForm((current) => ({ ...current, last_name: event.target.value }))
              }
              autoComplete="family-name"
            />
            <input
              type="email"
              placeholder="E-mailadres"
              value={signupForm.email}
              onChange={(event) =>
                setSignupForm((current) => ({ ...current, email: event.target.value }))
              }
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Wachtwoord"
              value={signupForm.password}
              onChange={(event) =>
                setSignupForm((current) => ({ ...current, password: event.target.value }))
              }
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Herhaal wachtwoord"
              value={signupForm.password_repeat}
              onChange={(event) =>
                setSignupForm((current) => ({ ...current, password_repeat: event.target.value }))
              }
              autoComplete="new-password"
            />
            {signupError ? <p style={{ margin: 0, color: '#b91c1c' }}>{signupError}</p> : null}
            <button
              type="submit"
              disabled={
                isSigningUp ||
                !signupForm.first_name.trim() ||
                !signupForm.last_name.trim() ||
                !signupForm.email.trim() ||
                !signupForm.password ||
                !signupForm.password_repeat
              }
            >
              {isSigningUp ? 'Account aanmaken...' : 'Account aanmaken'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSignupStep(1)
                setSignupError('')
              }}
              disabled={isSigningUp}
            >
              Terug naar codecontrole
            </button>
            <button type="button" onClick={switchToLoginMode} disabled={isSigningUp}>
              Terug naar login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
