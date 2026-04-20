import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/src/components/AuthProvider';
import Navbar from '@/src/components/layout/Navbar';
import Home from '@/src/pages/Home';
import RifaDetails from '@/src/pages/RifaDetails';
import Admin from '@/src/pages/Admin';
import ManageRifa from '@/src/pages/ManageRifa';
import MyPurchases from '@/src/pages/MyPurchases';

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
          <Navbar />
          <main className="flex-grow container mx-auto px-4 py-8 max-w-7xl">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/rifa/:id" element={<RifaDetails />} />
              <Route path="/mis-compras" element={<MyPurchases />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/rifa/:id" element={<ManageRifa />} />
            </Routes>
          </main>
          <footer className="bg-white border-t border-gray-100 py-8 text-center text-gray-500 text-sm">
            <p>© 2026 SorteoYa. Todos los derechos reservados.</p>
          </footer>
        </div>
        <Toaster position="top-right" />
      </AuthProvider>
    </Router>
  );
}

