import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, collection, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Info, Ticket, CheckCircle2, ChevronRight, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

export default function RifaDetails() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rifa, setRifa] = useState<Rifa | null>(null);
  const [reservados, setReservados] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [comprobanteURL, setComprobanteURL] = useState('');

  // Handle URL pre-selection
  useEffect(() => {
    if (loading || !rifa) return;
    const numsParam = searchParams.get('nums');
    if (numsParam) {
      const nums = numsParam.split(',').map(n => parseInt(n)).filter(n => !isNaN(n));
      const availableNums = nums.filter(n => n > 0 && n <= rifa.cantidadNumeros && !reservados.has(n));
      if (availableNums.length > 0) {
        setSelected(prev => {
          const combined = Array.from(new Set([...prev, ...availableNums]));
          return combined;
        });
        // Clear param after processing to avoid re-adding if user manually deselects
        setSearchParams({}, { replace: true });
      }
    }
  }, [loading, rifa, searchParams, reservados, setSearchParams]);

  useEffect(() => {
    if (!id) return;

    const unsubRifa = onSnapshot(doc(db, 'rifas', id), (doc) => {
      if (doc.exists()) {
        setRifa({ id: doc.id, ...doc.data() } as Rifa);
      }
      setLoading(false);
    });

    const unsubReservados = onSnapshot(collection(db, 'rifas', id, 'numeros_reservados'), (snapshot) => {
      const numbers = snapshot.docs.map(doc => parseInt(doc.id));
      setReservados(new Set(numbers));
    });

    return () => {
      unsubRifa();
      unsubReservados();
    };
  }, [id]);

  const toggleNumber = (num: number) => {
    if (reservados.has(num)) return;
    setSelected(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleBuy = async () => {
    if (!user) {
      toast.error('Debes iniciar sesión para comprar números');
      return;
    }
    if (selected.length === 0) return;
    setShowPayment(true);
  };

  const processPurchase = async () => {
    if (!id || !rifa || !user || !comprobanteURL) {
      toast.error('Por favor ingresa la URL del comprobante de transferencia');
      return;
    }
    setBuying(true);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Verify availability again
        for (const num of selected) {
          const resRef = doc(db, 'rifas', id, 'numeros_reservados', num.toString());
          const resDoc = await transaction.get(resRef);
          if (resDoc.exists()) {
            throw new Error(`El número ${num} ya ha sido reservado.`);
          }
        }

        // 2. Create Reservations
        for (const num of selected) {
          const resRef = doc(db, 'rifas', id, 'numeros_reservados', num.toString());
          transaction.set(resRef, {
            usuarioId: user.uid,
            numero: num,
            compraId: 'pending' // Fixed later
          });
        }

        // 3. Create Purchase Record
        const purchaseRef = doc(collection(db, 'rifas', id, 'compras'));
        transaction.set(purchaseRef, {
          usuarioId: user.uid,
          rifaId: id,
          numeros: selected,
          montoTotal: selected.length * rifa.precioPorNumero,
          estadoPago: 'pendiente',
          comprobanteURL,
          createdAt: serverTimestamp()
        });

        // Update reservations with compraId
        for (const num of selected) {
          const resRef = doc(db, 'rifas', id, 'numeros_reservados', num.toString());
          transaction.update(resRef, { compraId: purchaseRef.id });
        }
      });

      toast.success('¡Reserva exitosa! El administrador validará tu pago pronto.');
      setShowPayment(false);
      setSelected([]);
      navigate('/mis-compras');
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar la compra');
    } finally {
      setBuying(false);
    }
  };

  const handleShare = async () => {
    const baseUrl = window.location.origin;
    const path = `/rifa/${id}`;
    const url = new URL(path, baseUrl);
    if (selected.length > 0) {
      url.searchParams.set('nums', selected.join(','));
    }

    const shareData = {
      title: `SorteoYa - ${rifa?.nombre}`,
      text: `¡Mira esta rifa por un ${rifa?.nombre}! He seleccionado los números: ${selected.length > 0 ? selected.join(', ') : '¿Cuál eliges tú?'}`,
      url: url.toString(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url.toString());
        toast.success('¡Enlace copiado al portapapeles!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !rifa) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const total = selected.length * rifa.precioPorNumero;

  const pickRandom = (count: number) => {
    const available = Array.from({ length: rifa.cantidadNumeros })
      .map((_, i) => i + 1)
      .filter(num => !reservados.has(num) && !selected.includes(num));
    
    if (available.length === 0) {
      toast.error('No hay más números disponibles');
      return;
    }

    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const toSelect = shuffled.slice(0, Math.min(count, available.length));
    
    setSelected(prev => [...prev, ...toSelect]);
    toast.success(`Se agregaron ${toSelect.length} números al azar`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Rifa Sidebar Info */}
        <div className="md:col-span-5 space-y-6">
          <Card className="bento-card overflow-hidden p-0 border-slate-200">
            <img 
              src={rifa.imagenPremio || 'https://picsum.photos/seed/gift/800/450'} 
              alt={rifa.nombre}
              className="w-full aspect-square object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="p-6">
               <div className="flex justify-between items-start mb-2">
                 <h2 className="font-display text-2xl font-bold text-slate-800 tracking-tight">{rifa.nombre}</h2>
                 <Button variant="ghost" size="icon" className="rounded-full text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" onClick={handleShare}>
                   <Share2 className="w-4 h-4" />
                 </Button>
               </div>
               <p className="text-slate-500 text-sm leading-relaxed mb-6">{rifa.descripcion}</p>
               
               <div className="grid grid-cols-2 gap-4 mb-4">
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 leading-none">Precio Unitario</span>
                    <span className="text-xl font-bold text-primary-600">${rifa.precioPorNumero.toLocaleString()}</span>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 leading-none">Disponibles</span>
                    <span className="text-xl font-bold text-slate-800">{rifa.cantidadNumeros - reservados.size}</span>
                 </div>
               </div>

               <div className="flex items-center gap-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50 text-[11px] font-bold text-indigo-600 uppercase tracking-tight">
                 <Ticket className="w-4 h-4" />
                 Sorteo: {rifa.fechaSorteo?.toDate ? format(rifa.fechaSorteo.toDate(), "d 'de' MMMM", { locale: es }) : 'Fecha por confirmar'}
               </div>
            </div>
          </Card>

          <Card className="bento-card border-none bg-slate-900 text-white p-6 shadow-xl relative overflow-hidden h-fit">
            <div className="absolute -top-12 -right-12 opacity-5 pointer-events-none">
              <Ticket className="w-48 h-48 rotate-12" />
            </div>
            <div className="relative space-y-6">
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-60">Tu Reserva Actual</h3>
                {selected.length === 0 ? (
                  <p className="text-slate-400 text-sm italic">Toca los números en la grilla para seleccionarlos y participar.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {selected.map(n => (
                        <motion.div 
                          key={n}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                        >
                          <Badge variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-none py-1.5 px-3 font-bold">
                            #{n.toString().padStart(3, '0')}
                          </Badge>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              
              {selected.length > 0 && (
                <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Total a Pagar</div>
                    <div className="text-3xl font-display font-bold tracking-tight">${total.toLocaleString()}</div>
                  </div>
                  <Button 
                    onClick={handleBuy} 
                    className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-11 px-6 font-bold shadow-lg shadow-white/5 border-none"
                  >
                    Reservar Ahora
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Number Selector */}
        <div className="md:col-span-7 bento-card p-6 flex flex-col min-h-[500px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 pb-4 border-b border-slate-100">
            <h3 className="font-display text-xl font-bold text-slate-800">Grilla de Sorteo</h3>
            <div className="flex flex-wrap items-center gap-2">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">Azar:</span>
               {[5, 10, 20].map(n => (
                 <button 
                  key={n}
                  onClick={() => pickRandom(n)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-primary-50 hover:text-primary-600 text-slate-600 text-[10px] font-bold transition-colors border border-slate-200"
                 >
                   +{n}
                 </button>
               ))}
               <button 
                  onClick={() => setSelected([])}
                  className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold transition-colors border border-red-100 ml-2"
                >
                  Limpiar
               </button>
            </div>
          </div>
          <ScrollArea className="flex-grow">
            <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-10 gap-2 pr-4">
              {Array.from({ length: rifa.cantidadNumeros }).map((_, i) => {
                const num = i + 1;
                const isSelected = selected.includes(num);
                const isReserved = reservados.has(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleNumber(num)}
                    disabled={isReserved}
                    className={`
                      aspect-square rounded-xl border flex items-center justify-center font-display text-[11px] font-bold transition-all relative group
                      ${isReserved 
                        ? 'bg-slate-100 border-slate-100 text-slate-300 cursor-not-allowed shadow-inner' 
                        : isSelected 
                        ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-600/30' 
                        : 'bg-slate-50/50 border-slate-100 hover:border-primary-200 hover:bg-white active:scale-95 text-slate-600 shadow-sm'}
                    `}
                  >
                    {num.toString().padStart(3, '0')}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-primary-600 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6" />
              Completa tu Compra
            </DialogTitle>
            <DialogDescription className="text-gray-500 pt-2">
              Para validar tu compra, realiza una transferencia por el monto total e ingresa la URL del comprobante o número de referencia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="bg-gray-50 p-4 rounded-xl space-y-2">
              <div className="text-sm font-bold text-gray-400">DATOS DE TRANSFERENCIA</div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Banco:</span> <span className="font-bold">Bancolombia</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Cuenta:</span> <span className="font-bold">123-456789-00</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Tipo:</span> <span className="font-bold">Ahorros</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Nombre:</span> <span className="font-bold">SorteoYa Rifas</span></div>
                <div className="flex justify-between text-lg pt-2 border-t border-gray-200"><span className="text-gray-900 font-bold">Total a transferir:</span> <span className="text-primary-600 font-bold">${total.toLocaleString()}</span></div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-bold text-gray-700">Comprobante de Pago (URL o Referencia)</Label>
              <Input 
                placeholder="Ej: https://imgbb.com/mipago.jpg o Ref: #9928"
                value={comprobanteURL}
                onChange={(e) => setComprobanteURL(e.target.value)}
                className="h-12 rounded-xl"
              />
              <p className="text-[10px] text-gray-400">Sube tu foto a un servicio como ImgBB y pega la URL aquí.</p>
            </div>

            <Button 
              onClick={processPurchase} 
              disabled={buying || !comprobanteURL} 
              className="w-full h-12 bg-primary-600 text-lg font-bold rounded-xl"
            >
              {buying ? 'Procesando...' : 'Confirmar y Finalizar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
