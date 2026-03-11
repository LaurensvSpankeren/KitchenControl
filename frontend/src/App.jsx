import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>KitchenControl</h1>
        <p>Menu calculatie en receptuur</p>
      </header>
      <Dashboard />
    </div>
  )
}
