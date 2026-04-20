import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Ticket, ArrowLeft, UserPlus, Search, Edit3, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Rifa {
  id: string;
  nombre: string;
  cantidadNumeros: number;
  precioPorNumero: number;
}

export default function ManageRifa() {
  const { id } = useParams();
  const { role, user: adminUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rifa, setRifa] = useState<Rifa | null>(null);
  const [reservados, setReservados] = useState<Map<number, any>>(new Map());
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'todo' | 'no-vendido' | 'vendido' | 'pagado'>('todo');
  
  // Modal State
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [buyerInfo, setBuyerInfo] = useState({
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    anotacion: '',
    pagado: true,
    compartir: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
       navigate('/');
    }
  }, [role, authLoading, navigate]);

  useEffect(() => {
    if (!id) return;

    const unsubRifa = onSnapshot(doc(db, 'rifas', id), (doc) => {
      if (doc.exists()) {
        setRifa({ id: doc.id, ...doc.data() } as Rifa);
      }
      setLoading(false);
    });

    const unsubReservados = onSnapshot(collection(db, 'rifas', id, 'numeros_reservados'), (snapshot) => {
      const entries = snapshot.docs.map(doc => [parseInt(doc.id), doc.data()]);
      setReservados(new Map(entries as any));
    });

    return () => {
      unsubRifa();
      unsubReservados();
    };
  }, [id]);

  const toggleNumber = (num: number) => {
    setSelectedNumbers(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleSaveBuyer = async () => {
    if (!id || !rifa || selectedNumbers.length === 0 || !buyerInfo.nombre) {
      toast.error('Completa los campos obligatorios');
      return;
    }

    setSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Verify availability
        for (const num of selectedNumbers) {
          const resRef = doc(db, 'rifas', id, 'numeros_reservados', num.toString());
          const resDoc = await transaction.get(resRef);
          if (resDoc.exists()) {
             throw new Error(`El número ${num} ya está ocupado`);
          }
        }

        // 2. Create purchase record (Admin Manual)
        const purchaseRef = doc(collection(db, 'rifas', id, 'compras'));
        transaction.set(purchaseRef, {
          usuarioId: 'admin_manual',
          rifaId: id,
          numeros: selectedNumbers,
          montoTotal: selectedNumbers.length * rifa.precioPorNumero,
          estadoPago: buyerInfo.pagado ? 'validado' : 'pendiente',
          tipo: 'manual',
          cliente: {
            nombre: buyerInfo.nombre,
            telefono: buyerInfo.telefono,
            email: buyerInfo.email,
            direccion: buyerInfo.direccion,
            anotacion: buyerInfo.anotacion
          },
          createdAt: serverTimestamp(),
          createdBy: adminUser?.uid
        });

        // 3. Create reservations
        for (const num of selectedNumbers) {
          const resRef = doc(db, 'rifas', id, 'numeros_reservados', num.toString());
          transaction.set(resRef, {
            usuarioId: 'admin_manual',
            numero: num,
            compraId: purchaseRef.id,
            clienteNombre: buyerInfo.nombre,
            estadoPago: buyerInfo.pagado ? 'validado' : 'pendiente'
          });
        }
      });

      toast.success('Números asignados correctamente');
      setShowBuyerModal(false);
      setSelectedNumbers([]);
      setBuyerInfo({
        nombre: '',
        telefono: '',
        email: '',
        direccion: '',
        anotacion: '',
        pagado: true,
        compartir: true
      });
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const pickRandom = (count: number) => {
    const available = Array.from({ length: rifa?.cantidadNumeros || 0 })
      .map((_, i) => i + 1)
      .filter(num => !reservados.has(num) && !selectedNumbers.includes(num));
    
    if (available.length === 0) {
      toast.error('No hay más números disponibles');
      return;
    }

    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const toSelect = shuffled.slice(0, Math.min(count, available.length));
    
    setSelectedNumbers(prev => [...prev, ...toSelect]);
    toast.success(`Seleccionados ${toSelect.length} números al azar`);
  };

  const handleShareSelection = async () => {
    if (selectedNumbers.length === 0) {
      toast.error('Selecciona algunos números primero');
      return;
    }
    // Use window.location.origin but ensure it works in shared environment
    const baseUrl = window.location.origin;
    const publicUrl = `${baseUrl}/rifa/${id}?nums=${selectedNumbers.join(',')}`;
    
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('¡Enlace de compra copiado!');
      
      if (navigator.share) {
        await navigator.share({
          title: `SorteoYa - ${rifa?.nombre}`,
          text: `Te reservé estos números: ${selectedNumbers.join(', ')}. ¡Cómpralos aquí!`,
          url: publicUrl
        }).catch(() => {}); // Ignore cancel
      }
    } catch (err) {
       // Fallback for non-secure contexts
       const textarea = document.createElement('textarea');
       textarea.value = publicUrl;
       document.body.appendChild(textarea);
       textarea.select();
       document.execCommand('copy');
       document.body.removeChild(textarea);
       toast.success('Enlace copiado (fallback)');
    }
  };

  if (authLoading || loading || !rifa) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-32 min-h-screen bg-[#0f0f0f] -m-8 p-8 transition-colors duration-500">
      <header className="flex items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')} className="rounded-full hover:bg-white/5 text-white/60">
             <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">{rifa.nombre}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{rifa.id.slice(-8)}</span>
              <div className="w-1 h-1 bg-white/20 rounded-full" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{rifa.cantidadNumeros} Números</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="ghost" size="icon" className="rounded-full text-white/40 hover:bg-white/5"><Search className="w-4 h-4" /></Button>
           <Button variant="ghost" size="icon" className="rounded-full text-white/40 hover:bg-white/5"><Edit3 className="w-4 h-4" /></Button>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v: any) => setFilter(v)} className="w-full">
        <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between mb-2">
           <TabsList className="bg-white/5 p-1 rounded-xl flex-grow grid grid-cols-4 h-12 border border-white/5">
            <TabsTrigger value="todo" className="rounded-lg font-bold text-[10px] uppercase tracking-wider data-[state=active]:bg-white/10 data-[state=active]:text-emerald-400">Todo</TabsTrigger>
            <TabsTrigger value="no-vendido" className="rounded-lg font-bold text-[10px] uppercase tracking-wider data-[state=active]:bg-white/10 data-[state=active]:text-emerald-400">Libres</TabsTrigger>
            <TabsTrigger value="vendido" className="rounded-lg font-bold text-[10px] uppercase tracking-wider data-[state=active]:bg-white/10 data-[state=active]:text-emerald-400">Vendidos</TabsTrigger>
            <TabsTrigger value="pagado" className="rounded-lg font-bold text-[10px] uppercase tracking-wider data-[state=active]:bg-white/10 data-[state=active]:text-emerald-400">Pagados</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5 h-12">
             <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest px-2">Azar:</span>
             {[5, 10, 20].map(n => (
               <button 
                key={n}
                onClick={() => pickRandom(n)}
                className="h-10 px-3 rounded-lg bg-white/5 hover:bg-emerald-500 hover:text-black text-white/60 text-[10px] font-bold transition-all"
               >
                 +{n}
               </button>
             ))}
             <Button variant="ghost" size="icon" onClick={() => setSelectedNumbers([])} className="h-10 w-10 text-white/20 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
             </Button>
          </div>
        </div>
      </Tabs>

      <ScrollArea className="h-[60vh] rounded-2xl">
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3">
          {Array.from({ length: rifa.cantidadNumeros }).map((_, i) => {
            const num = i + 1;
            const res = reservados.get(num);
            const isSelected = selectedNumbers.includes(num);
            
            // Apply filtering logic
            if (filter === 'no-vendido' && res) return null;
            if (filter === 'vendido' && (!res || res.estadoPago === 'validado')) return null;
            if (filter === 'pagado' && (!res || res.estadoPago !== 'validado')) return null;
            
            return (
              <button
                key={num}
                onClick={() => toggleNumber(num)}
                disabled={!!res && !isSelected}
                className={`
                  aspect-square rounded-xl border flex flex-col items-center justify-center font-display transition-all relative group
                  ${res 
                    ? res.estadoPago === 'validado'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500/40 cursor-not-allowed'
                      : 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed' 
                    : isSelected 
                    ? 'bg-emerald-500 border-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                    : 'bg-white/[0.02] border-white/5 text-white/60 hover:border-emerald-500/50 hover:bg-white/[0.04]'}
                `}
              >
                <span className="text-sm font-bold">{num}</span>
                {res && (
                  <span className="text-[8px] opacity-40 mt-0.5 truncate max-w-[80%]">{res.clienteNombre || 'Ocupado'}</span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {selectedNumbers.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 flex gap-3">
          <Button 
            onClick={handleShareSelection}
            variant="outline"
            className="h-16 bg-white/10 hover:bg-white/20 text-white rounded-2xl border-white/10 font-bold flex items-center justify-center gap-3 flex-1"
          >
            <Share2 className="w-5 h-5 text-emerald-400" />
            <div className="text-left hidden sm:block">
              <div className="text-xs opacity-60 leading-none mb-0.5 uppercase tracking-tighter">Compartir</div>
              <div className="text-sm">Enlace Directo</div>
            </div>
          </Button>

          <Button 
            onClick={() => setShowBuyerModal(true)}
            className="h-16 bg-emerald-500 hover:bg-emerald-600 text-black rounded-2xl shadow-2xl font-bold flex items-center justify-center gap-3 border-none ring-offset-black focus:ring-2 focus:ring-emerald-500 flex-[2]"
          >
            <div className="bg-white/20 p-2 rounded-lg">
              <UserPlus className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-xs opacity-60 leading-none mb-0.5 uppercase tracking-tighter font-extrabold">Acción Directa</div>
              <div className="text-sm">Compradores ({selectedNumbers.length})</div>
            </div>
          </Button>
        </div>
      )}

      {/* Buyer Info Modal */}
      <Dialog open={showBuyerModal} onOpenChange={setShowBuyerModal}>
        <DialogContent className="max-w-md rounded-2xl bg-[#1c1c1c] text-white border-white/10 p-6">
          <DialogHeader className="flex flex-row items-center justify-between mb-4">
            <div className="bg-white/10 px-3 py-1.5 rounded-lg text-xs font-bold text-white/60">
              {selectedNumbers.join(', ')}
            </div>
            <DialogTitle className="text-xl font-display font-bold">Venta Directa</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Nombre Completo</Label>
              <Input 
                value={buyerInfo.nombre} 
                onChange={e => setBuyerInfo({...buyerInfo, nombre: e.target.value})}
                placeholder="Nombre del cliente" 
                className="bg-white/5 border-white/10 rounded-xl h-12 text-white placeholder:text-white/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">WhatsApp / Teléfono</Label>
              <Input 
                value={buyerInfo.telefono} 
                onChange={e => setBuyerInfo({...buyerInfo, telefono: e.target.value})}
                placeholder="+57 321 1234567" 
                className="bg-white/5 border-white/10 rounded-xl h-12 text-white placeholder:text-white/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Correo Electrónico</Label>
              <Input 
                type="email"
                value={buyerInfo.email} 
                onChange={e => setBuyerInfo({...buyerInfo, email: e.target.value})}
                placeholder="email@ejemplo.com" 
                className="bg-white/5 border-white/10 rounded-xl h-12 text-white placeholder:text-white/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Dirección</Label>
                <Input 
                  value={buyerInfo.direccion} 
                  onChange={e => setBuyerInfo({...buyerInfo, direccion: e.target.value})}
                  placeholder="Calle 123..." 
                  className="bg-white/5 border-white/10 rounded-xl h-12 text-white placeholder:text-white/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Anotación</Label>
                <Input 
                  value={buyerInfo.anotacion} 
                  onChange={e => setBuyerInfo({...buyerInfo, anotacion: e.target.value})}
                  placeholder="Nota interna" 
                  className="bg-white/5 border-white/10 rounded-xl h-12 text-white placeholder:text-white/20"
                />
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                      <Checkbox 
                        id="paid" 
                        checked={buyerInfo.pagado} 
                        onCheckedChange={(c: boolean) => setBuyerInfo({...buyerInfo, pagado: c})}
                        className="border-white/20"
                      />
                   </div>
                   <Label htmlFor="paid" className="text-sm font-bold">Pagado</Label>
                </div>
                <div className="text-emerald-400 font-display font-bold text-lg">
                  ${(selectedNumbers.length * (rifa?.precioPorNumero || 0)).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-8">
            <Button variant="ghost" onClick={() => setShowBuyerModal(false)} className="h-14 rounded-2xl text-white/60 font-bold hover:bg-white/5 font-display uppercase tracking-widest text-[10px]">
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveBuyer} 
              disabled={saving}
              className="h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-base font-display uppercase tracking-widest"
            >
              {saving ? 'Guardando...' : 'Guardar Venta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
