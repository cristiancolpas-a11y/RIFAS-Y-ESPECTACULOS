import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'motion/react';

interface Rifa {
  id: string;
  nombre: string;
  descripcion: string;
  precioPorNumero: number;
  cantidadNumeros: number;
  fechaSorteo: any;
  imagenPremio: string;
  estado: 'activa' | 'finalizada';
}

export default function Home() {
  const [rifas, setRifas] = useState<Rifa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'rifas'), where('estado', '==', 'activa'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rifa[];
      setRifas(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const featured = rifas[0];
  const others = rifas.slice(1);

  return (
    <div className="space-y-6">
      {/* Bento Header/Hero */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <header className="md:col-span-4 p-8 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-center gap-4">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-800 tracking-tight leading-tight">
            Participa y Gana con <span className="text-primary-600">SorteoYa</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Explora las rifas más emocionantes. Selecciona tus números y espera el sorteo en vivo.
          </p>
          <div className="flex gap-2">
             <div className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-emerald-100">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
               Sorteos Activos
             </div>
          </div>
        </header>

        {featured ? (
          <div className="md:col-span-8 group relative overflow-hidden bg-slate-900 text-white rounded-2xl border-0 h-[300px] md:h-auto min-h-[300px]">
            <div className="absolute inset-0 opacity-40">
              <img 
                src={featured.imagenPremio ? (featured.imagenPremio.startsWith('http') ? featured.imagenPremio : `https://${featured.imagenPremio}`) : 'https://picsum.photos/seed/gift/1200/600'} 
                alt={featured.nombre}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/1200/600?blur=2';
                }}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
            <div className="absolute top-4 right-4 z-10">
              <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-[10px] uppercase font-bold flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span> {featured.fechaSorteo?.toDate ? format(featured.fechaSorteo.toDate(), "'Próximo' d 'de' MMMM", { locale: es }) : 'En Vivo'}
              </div>
            </div>
            <div className="relative h-full flex flex-col justify-end p-8 z-10">
              <span className="bg-primary-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase mb-2 inline-block w-fit tracking-wider">Premio Destacado</span>
              <h2 className="text-2xl md:text-3xl font-bold mb-1 font-display tracking-tight leading-none">{featured.nombre}</h2>
              <p className="text-slate-300 text-sm mb-4 max-w-md line-clamp-2">{featured.descripcion}</p>
              <div className="flex gap-3">
                <Button asChild className="bg-white text-slate-900 hover:bg-slate-100 px-6 h-10 rounded-xl font-bold text-sm border-none shadow-lg">
                  <Link to={`/rifa/${featured.id}`}>Participar Ahora</Link>
                </Button>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 flex items-center gap-2 font-bold text-sm tracking-tight">
                  <Ticket className="w-4 h-4" />
                  ${featured.precioPorNumero.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="md:col-span-8 bg-slate-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200">
             <p className="text-slate-400 font-medium">Buscando nuevos premios...</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-primary-600" />
          Más Sorteos Disponibles
        </h2>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{others.length} Rifas</span>
      </div>

      {others.length === 0 && !featured ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Ticket className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-slate-900">No hay rifas activas</h3>
          <p className="text-slate-400">Estamos preparando nuevos sorteos para ti.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
          {others.map((rifa, idx) => (
            <motion.div
              key={rifa.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className="bento-card overflow-hidden group flex flex-col h-full border-slate-200 p-0 shadow-sm hover:shadow-md transition-all">
                <div className="relative aspect-video overflow-hidden">
                  <img 
                    src={rifa.imagenPremio ? (rifa.imagenPremio.startsWith('http') ? rifa.imagenPremio : `https://${rifa.imagenPremio}`) : 'https://picsum.photos/seed/gift/800/450'} 
                    alt={rifa.nombre}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/800/450?blur=2';
                    }}
                  />
                  <div className="absolute bottom-3 left-3">
                    <Badge className="bg-white/90 backdrop-blur-md text-slate-800 border-none shadow-sm font-bold">
                      ${rifa.precioPorNumero.toLocaleString()}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="p-5 pb-0">
                  <CardTitle className="font-display font-bold text-lg text-slate-800 line-clamp-1">{rifa.nombre}</CardTitle>
                </CardHeader>
                <CardContent className="p-5 flex-grow space-y-3">
                  <p className="text-slate-500 line-clamp-2 text-xs leading-relaxed">{rifa.descripcion}</p>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Sorteo: {rifa.fechaSorteo?.toDate ? format(rifa.fechaSorteo.toDate(), "d 'de' MMMM", { locale: es }) : 'Por definir'}</span>
                  </div>
                </CardContent>
                <CardFooter className="p-5 pt-0">
                  <Button asChild className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border-none shadow-none font-bold h-10">
                    <Link to={`/rifa/${rifa.id}`}>Ver Sorteo</Link>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
