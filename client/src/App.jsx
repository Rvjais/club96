import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import GamingPage from './pages/GamingPage'
import Account from './pages/Account'
import History from './pages/History'
import { games } from './games'
import { AuthProvider, RequireAuth } from './auth/AuthProvider'

function GameLoading() {
  return (
    <div className="game-loading">
      <span className="game-loading-spinner" />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/game" element={<RequireAuth><GamingPage /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="/account/history/:tab" element={<RequireAuth><History /></RequireAuth>} />
          {games.map(({ id, path, component: Game }) => (
            <Route
              key={id}
              path={path}
              element={
                <RequireAuth>
                  <Suspense fallback={<GameLoading />}>
                    <Game />
                  </Suspense>
                </RequireAuth>
              }
            />
          ))}
          <Route path="/aviator" element={<Navigate to="/games/aviator" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
