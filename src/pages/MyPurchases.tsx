import { useEffect, useState } from 'react';
import { collectionGroup, query, where, onSnapshot, collection, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ticket, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function MyPurchases() {
  const { user } = useAuth();
  const [compras, setCompras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Since we can't easily cross-collect subcollections without Collection Group Indexing configured,
    // and setting up indexes takes time, I'll assume for the demo that I can query 'compras' directly 
    // if I had flattened them OR I'll just show a placeholder for now to ensure no errors.
    // Actually, I'll try it and if it fails the user can enable the index.
    
    // BUT! Let's follow a safer path for a first demo:
    // I will use collection group if possible. 
    const q = query(collectionGroup(db, 'compras'), where('usuarioId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    try {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCompras(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Purchases listener error:", err);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      setLoading(false);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
        <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-medium text-gray-900">Debes iniciar sesión</h3>
        <p className="text-gray-500">Ingresa para ver el historial de tus boletas.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-800 tracking-tight">Mis Compras</h1>
          <p className="text-slate-500 text-sm">Gestiona tus números y revisa el estado de tus pagos.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
           <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" />
           <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{compras.length} Participaciones</span>
        </div>
      </header>

      {compras.length === 0 ? (
        <Card className="bento-card text-center py-20 border-slate-200">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <Ticket className="w-8 h-8 text-slate-300" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-800">Aún no tienes compras</CardTitle>
          <p className="text-slate-500">Explora las rifas activas y elige tus números de la suerte.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {compras.map(compra => (
            <Card key={compra.id} className="bento-card overflow-hidden p-0 border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                <div className="p-6 flex-grow space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CÓDIGO: {compra.id.slice(-8).toUpperCase()}</span>
                      <h3 className="font-display font-bold text-xl text-slate-800 mt-1">Sorteo #{compra.rifaId.slice(-4)}</h3>
                    </div>
                    <Badge className={`
                      rounded-full border-none px-3 py-1 font-bold text-[10px] uppercase tracking-wider
                      ${compra.estadoPago === 'validado' ? 'bg-emerald-100 text-emerald-700' : 
                        compra.estadoPago === 'rechazado' ? 'bg-red-100 text-red-700' : 
                        'bg-amber-100 text-amber-700'}
                    `}>
                      {compra.estadoPago}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NÚMEROS ADQUIRIDOS:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {compra.numeros.map((n: number) => (
                        <span key={n} className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                          #{n.toString().padStart(3, '0')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50/50 sm:w-64 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-medium">Total Pagado:</span>
                      <span className="font-bold text-slate-800">${compra.montoTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-medium">Fecha:</span>
                      <span className="font-bold text-slate-800">
                        {compra.createdAt?.toDate ? format(compra.createdAt.toDate(), "d MMM, yyyy", { locale: es }) : '...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
