import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <Outlet />
      <Footer />
    </div>
  )
}
