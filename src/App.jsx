import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import GamingPage from './pages/GamingPage'
import { games } from './games'

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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/game" element={<GamingPage />} />
        {games.map(({ id, path, component: Game }) => (
          <Route
            key={id}
            path={path}
            element={
              <Suspense fallback={<GameLoading />}>
                <Game />
              </Suspense>
            }
          />
        ))}
        <Route path="/aviator" element={<Navigate to="/games/aviator" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
