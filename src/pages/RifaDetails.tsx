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
  responsable?: string;
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
  const [showSuccess, setShowSuccess] = useState(false);
  const [comprobanteURL, setComprobanteURL] = useState('');
  const [guestInfo, setGuestInfo] = useState({ nombre: '', telefono: '', vendedor: '' });

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
    if (selected.length === 0) return;
    setGuestInfo({ nombre: '', telefono: '', vendedor: '' });
    setShowPayment(true);
  };

  const processPurchase = async () => {
    if (!id || !rifa) return;

    if (!user && (!guestInfo.nombre || !guestInfo.telefono)) {
      toast.error('Por favor ingresa tu nombre y teléfono para identificarte');
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
            usuarioId: user?.uid || 'invitado',
            numero: num,
            compraId: 'pending',
            clienteNombre: guestInfo.nombre || user?.displayName || 'Invitado',
            estadoPago: 'pendiente',
            vendedor: guestInfo.vendedor || ''
          });
        }

        // 3. Create Purchase Record
        const purchaseRef = doc(collection(db, 'rifas', id, 'compras'));
        transaction.set(purchaseRef, {
          usuarioId: user?.uid || 'invitado',
          rifaId: id,
          numeros: selected,
          montoTotal: selected.length * rifa.precioPorNumero,
          estadoPago: 'pendiente',
          comprobanteURL: comprobanteURL || 'Pendiente de envío',
          cliente: {
            nombre: guestInfo.nombre || user?.displayName || 'Invitado',
            telefono: guestInfo.telefono,
            email: user?.email || '',
            vendedor: guestInfo.vendedor || ''
          },
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
      if (user) {
        navigate('/mis-compras');
      } else {
        setShowSuccess(true);
      }
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
                src={rifa.imagenPremio ? (rifa.imagenPremio.startsWith('http') ? rifa.imagenPremio : `https://${rifa.imagenPremio}`) : 'https://picsum.photos/seed/gift/800/450'} 
                alt={rifa.nombre}
                className="w-full aspect-square object-cover"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/800/800?blur=2';
                }}
              />
            <div className="p-6">
               <div className="flex justify-between items-start mb-2">
                 <div>
                    <h2 className="font-display text-2xl font-bold text-slate-800 tracking-tight">{rifa.nombre}</h2>
                    {rifa.responsable && (
                      <p className="text-[10px] font-bold text-primary-600 uppercase tracking-widest mt-0.5">
                        Resp: {rifa.responsable}
                      </p>
                    )}
                 </div>
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

      {/* Payment Modal Simplified to Reservation */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader className="text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary-100">
               <Ticket className="w-8 h-8 text-primary-600" />
            </div>
            <DialogTitle className="font-display text-2xl text-slate-800">Reservar Números</DialogTitle>
            <DialogDescription className="text-slate-500 pt-2">
              Ingresa tus datos para registrar tu selección de números.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Nombre Completo</Label>
                <Input 
                  placeholder={user?.displayName || "Ej: Juan Pérez"}
                  value={guestInfo.nombre}
                  onChange={(e) => setGuestInfo({...guestInfo, nombre: e.target.value})}
                  className="h-12 rounded-xl bg-slate-50 border-slate-100 font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Número de WhatsApp</Label>
                <Input 
                  placeholder="Ej: 3211234567"
                  value={guestInfo.telefono}
                  onChange={(e) => setGuestInfo({...guestInfo, telefono: e.target.value})}
                  className="h-12 rounded-xl bg-slate-50 border-slate-100 font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Vendedor / Responsable Pago</Label>
                <Input 
                  placeholder="Ej: Maria Lopez"
                  value={guestInfo.vendedor}
                  onChange={(e) => setGuestInfo({...guestInfo, vendedor: e.target.value})}
                  className="h-12 rounded-xl bg-slate-50 border-slate-100 font-medium"
                />
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl p-6 text-white flex justify-between items-center shadow-xl">
               <div className="space-y-0.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Total a Pagar</div>
                  <div className="text-2xl font-display font-bold">${total.toLocaleString()}</div>
               </div>
               <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Números</div>
                  <div className="text-sm font-bold text-emerald-400">{selected.length} boletos</div>
               </div>
            </div>

            <Button 
              onClick={processPurchase} 
              disabled={buying || (!guestInfo.nombre && !user?.displayName) || !guestInfo.telefono} 
              className="w-full h-14 bg-primary-600 hover:bg-primary-700 text-white text-lg font-bold rounded-2xl shadow-lg shadow-primary-600/20"
            >
              {buying ? 'Procesando...' : 'Confirmar Reserva'}
            </Button>
            
            <p className="text-[10px] text-center text-slate-400 font-medium px-6">
              Al confirmar, tus números quedarán reservados. Coordina el pago con el administrador para activarlos.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Success Modal for Guests */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-8 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <DialogTitle className="text-2xl font-display font-bold text-slate-800 mb-2">¡Reserva Recibida!</DialogTitle>
          <DialogDescription className="text-slate-500 mb-8">
            Tu reserva ha sido registrada correctamente. El administrador validará el comprobante y activará tus números pronto.
          </DialogDescription>
          <Button 
            onClick={() => setShowSuccess(false)} 
            className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
          >
            Entendido
          </Button>
          <p className="mt-4 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Gracias por participar</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
