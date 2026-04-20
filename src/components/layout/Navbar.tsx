import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Ticket, LayoutDashboard, History, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/src/components/AuthProvider';
import { loginWithGoogle, logout } from '@/src/lib/firebase';
import { Avatar as UIAvatar, AvatarFallback as UIAvatarFallback, AvatarImage as UIAvatarImage } from '@/components/ui/avatar';

export default function Navbar() {
  const { user, role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center shadow-lg">
              <Ticket className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-display font-bold text-lg leading-none text-slate-800 block">SorteoYa</span>
              <span className="text-[10px] text-slate-500 font-medium tracking-tight">Gestión Automatizada</span>
            </div>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-gray-600 hover:text-primary-600 transition-colors font-medium">Rifas</Link>
            {user && (
              <Link to="/mis-compras" className="text-gray-600 hover:text-primary-600 transition-colors font-medium">Mis Compras</Link>
            )}
            {role === 'admin' && (
              <Link to="/admin" className="text-gray-600 hover:text-primary-600 transition-colors font-medium flex items-center gap-1">
                <LayoutDashboard className="w-4 h-4" />
                Admin
              </Link>
            )}
            
            {user ? (
              <div className="flex items-center gap-4">
                <UIAvatar className="w-8 h-8">
                  <UIAvatarImage src={user.photoURL || undefined} />
                  <UIAvatarFallback>{user.displayName?.charAt(0)}</UIAvatarFallback>
                </UIAvatar>
                <Button variant="outline" size="sm" onClick={handleLogout} className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  Salir
                </Button>
              </div>
            ) : (
              <Button onClick={handleLogin} className="flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                Iniciar Sesión
              </Button>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-gray-100 p-4 space-y-4">
          <Link to="/" onClick={() => setIsOpen(false)} className="block text-gray-600 font-medium">Rifas</Link>
          {user && (
            <Link to="/mis-compras" onClick={() => setIsOpen(false)} className="block text-gray-600 font-medium">Mis Compras</Link>
          )}
          {role === 'admin' && (
            <Link to="/admin" onClick={() => setIsOpen(false)} className="block text-gray-600 font-medium">Admin Panel</Link>
          )}
          {user ? (
            <Button onClick={handleLogout} variant="outline" className="w-full flex items-center gap-2 justify-center">
              <LogOut className="w-4 h-4" />
              Salir
            </Button>
          ) : (
            <Button onClick={handleLogin} className="w-full flex items-center gap-2 justify-center">
              <LogIn className="w-4 h-4" />
              Iniciar Sesión
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}
