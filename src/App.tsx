import { useEffect } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import { EmptyState, ToastProvider } from './components/ui'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Sports from './pages/Sports'
import SportDetail from './pages/SportDetail'
import Notices, { NoticeDetail } from './pages/Notices'
import Athletes, { AthleteDetail } from './pages/Athletes'
import Login from './pages/Login'
import Family from './pages/Family'
import Me from './pages/Me'
import Admin from './pages/Admin'

/** An OAuth rejection lands wherever Google sent us; show it on /login. */
function AuthErrorRedirect() {
  const { authError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (authError && location.pathname !== '/login') navigate('/login', { replace: true })
  }, [authError, location.pathname, navigate])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <ToastProvider>
            <AuthErrorRedirect />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<Home />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="sports" element={<Sports />} />
                <Route path="sports/:slug" element={<SportDetail />} />
                <Route path="notices" element={<Notices />} />
                <Route path="notices/:id" element={<NoticeDetail />} />
                <Route path="athletes" element={<Athletes />} />
                <Route path="athletes/:id" element={<AthleteDetail />} />
                <Route path="family" element={<Family />} />
                <Route path="me" element={<Me />} />
                <Route path="admin" element={<Admin />} />
                <Route
                  path="*"
                  element={
                    <EmptyState icon="🧭" title="Out of bounds" action={<Link to="/" className="btn btn-ink">Back home</Link>}>
                      That page doesn’t exist.
                    </EmptyState>
                  }
                />
              </Route>
            </Routes>
          </ToastProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
