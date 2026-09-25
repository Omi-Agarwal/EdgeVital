import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LandingPage from './pages/LandingPage'
import CommandCenterPage from './pages/CommandCenterPage'

export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('edgevital-theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('edgevital-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <Routes>
      <Route path="/" element={<LandingPage dark={dark} setDark={setDark} />} />
      <Route path="/command-center" element={<CommandCenterPage dark={dark} setDark={setDark} />} />
    </Routes>
  )
}
