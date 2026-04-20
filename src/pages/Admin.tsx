import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, runTransaction, collectionGroup } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Check, X, Trophy, ExternalLink, Download, Info, Ticket, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Admin() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [rifas, setRifas] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]);
  const [reservedNumbers, setReservedNumbers] = useState<any[]>([]);
  const [editingReserva, setEditingReserva] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Rifa State
  const [newRifa, setNewRifa] = useState({
    nombre: '',
    descripcion: '',
    precioPorNumero: '',
    cantidadNumeros: '',
    fechaSorteo: '',
    imagenPremio: '',
    responsable: ''
  });

  useEffect(() => {
    if (role !== 'admin') return;

    const unsubRifas = onSnapshot(query(collection(db, 'rifas'), orderBy('createdAt', 'desc')), (snapshot) => {
      setRifas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Admin Rifas listener error:", err);
      toast.error("Error al cargar rifas: Permisos insuficientes");
    });

    const qPagos = query(collectionGroup(db, 'compras'), where('estadoPago', '==', 'pendiente'), orderBy('createdAt', 'desc'));
    const unsubPagos = onSnapshot(qPagos, (snapshot) => {
      setPagosPendientes(snapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() })));
    }, (err) => {
      console.error("Admin Pagos listener error:", err);
      // Don't toast here to avoid spam if role is still syncing
    });

    const qReserved = query(collectionGroup(db, 'numeros_reservados'));
    const unsubReserved = onSnapshot(qReserved, (snapshot) => {
      setReservedNumbers(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ref: doc.ref, 
        rifaId: doc.ref.parent.parent?.id,
        ...doc.data() 
      })));
    }, (err) => {
      console.error("Admin Reserved listener error:", err);
    });

    return () => {
      unsubRifas();
      unsubPagos();
      unsubReserved();
    };
  }, [role]);

  const handleValidarPago = async (compra: any, nuevoEstado: 'validado' | 'rechazado') => {
    try {
      await runTransaction(db, async (transaction) => {
        // Update purchase state
        transaction.update(compra.ref, {
          estadoPago: nuevoEstado,
          validadoAt: serverTimestamp(),
          validadoBy: user?.uid
        });

        // If rejected, free the numbers
        if (nuevoEstado === 'rechazado') {
          for (const num of compra.numeros) {
            const resRef = doc(db, 'rifas', compra.rifaId, 'numeros_reservados', num.toString());
            transaction.delete(resRef);
          }
        }
      });
      toast.success(`Pago ${nuevoEstado === 'validado' ? 'aprobado' : 'rechazado'} correctamente`);
    } catch (error) {
      console.error(error);
      toast.error('Error al procesar la validación');
    }
  };

  const handleEliminarReservaRaw = async (compra: any) => {
    if (!confirm('¿Seguro que deseas eliminar esta reserva y liberar los números?')) return;
    try {
      await runTransaction(db, async (transaction) => {
        for (const num of compra.numeros) {
          const resRef = doc(db, 'rifas', compra.rifaId, 'numeros_reservados', num.toString());
          transaction.delete(resRef);
        }
        transaction.delete(compra.ref);
      });
      toast.success('Reserva eliminada y números liberados');
    } catch (error) {
      toast.error('Error al eliminar la reserva');
    }
  };

  const handleCreateRifa = async () => {
    try {
      const precio = Number(newRifa.precioPorNumero);
      const cantidad = Math.floor(Number(newRifa.cantidadNumeros));
      
      if (!newRifa.nombre || !newRifa.fechaSorteo || precio <= 0 || cantidad <= 0) {
        toast.error('Por favor completa todos los campos correctamente');
        return;
      }

      await addDoc(collection(db, 'rifas'), {
        ...newRifa,
        precioPorNumero: precio,
        cantidadNumeros: cantidad,
        fechaSorteo: new Date(newRifa.fechaSorteo),
        estado: 'activa',
        createdAt: serverTimestamp(),
        createdBy: user?.uid
      });
      toast.success('Rifa creada exitosamente');
      setNewRifa({ nombre: '', descripcion: '', precioPorNumero: '', cantidadNumeros: '', fechaSorteo: '', imagenPremio: '', responsable: '' });
    } catch (error: any) {
      console.error("DEBUG - Rifa Creation Error:", error);
      toast.error(`Error: ${error.message || 'Error al crear la rifa'}`);
    }
  };

  const handleFinalizarRifa = async (rifa: any) => {
    const winner = Math.floor(Math.random() * rifa.cantidadNumeros) + 1;
    try {
      await updateDoc(doc(db, 'rifas', rifa.id), {
        estado: 'finalizada',
        numeroGanador: winner,
        finalizadaAt: serverTimestamp()
      });
      toast.success(`Sorteo realizado. ¡Ganador: #${winner}!`);
    } catch (error) {
      toast.error('Error al finalizar el sorteo');
    }
  };

  const handleEliminarUnaReserva = async (reserva: any) => {
    if (!confirm(`¿Seguro que deseas eliminar la reserva del número #${reserva.numero}?`)) return;
    try {
      await deleteDoc(reserva.ref);
      toast.success('Reserva eliminada');
    } catch (error) {
      toast.error('Error al eliminar reserva');
    }
  };

  const handleTogglePagoReserva = async (reserva: any) => {
    try {
      const nuevoEstado = reserva.estadoPago === 'validado' ? 'pendiente' : 'validado';
      await updateDoc(reserva.ref, { estadoPago: nuevoEstado });
      toast.success(`Número #${reserva.numero} marcado como ${nuevoEstado}`);
    } catch (error) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleUpdateReserva = async () => {
    if (!editingReserva) return;
    try {
      await updateDoc(editingReserva.ref, {
        clienteNombre: editingReserva.clienteNombre
      });
      toast.success('Reserva actualizada');
      setEditingReserva(null);
    } catch (error) {
      toast.error('Error al actualizar reserva');
    }
  };

  if (role !== 'admin') {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-red-600">Acceso Denegado</h1>
        <p className="text-gray-500">Solo administradores pueden ver esta página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-800 tracking-tight">Panel Administrativo</h1>
          <p className="text-slate-500 text-sm">Gestiona tus sorteos, valida pagos y exporta resultados.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-primary-600 hover:bg-primary-700 h-11 rounded-xl flex items-center gap-2 shadow-lg shadow-primary-600/20 font-bold">
              <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
              Nueva Rifa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl text-slate-800">Crear Nueva Rifa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nombre del Premio</Label>
                <Input value={newRifa.nombre} onChange={e => setNewRifa({...newRifa, nombre: e.target.value})} placeholder="iPhone 15 Pro Max" className="rounded-xl border-slate-200 h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Descripción</Label>
                <Input value={newRifa.descripcion} onChange={e => setNewRifa({...newRifa, descripcion: e.target.value})} placeholder="Incluye accesorios..." className="rounded-xl border-slate-200 h-11" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Precio x Número ($)</Label>
                  <Input type="number" value={newRifa.precioPorNumero} onChange={e => setNewRifa({...newRifa, precioPorNumero: e.target.value})} placeholder="5000" className="rounded-xl border-slate-200 h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cant. Números</Label>
                  <Input type="number" value={newRifa.cantidadNumeros} onChange={e => setNewRifa({...newRifa, cantidadNumeros: e.target.value})} placeholder="100" className="rounded-xl border-slate-200 h-11" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fecha Sorteo</Label>
                <Input type="datetime-local" value={newRifa.fechaSorteo} onChange={e => setNewRifa({...newRifa, fechaSorteo: e.target.value})} className="rounded-xl border-slate-200 h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Responsable / Encargado</Label>
                <Input value={newRifa.responsable} onChange={e => setNewRifa({...newRifa, responsable: e.target.value})} placeholder="Ej: Maria Lopez" className="rounded-xl border-slate-200 h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Imagen (URL)</Label>
                <Input value={newRifa.imagenPremio} onChange={e => setNewRifa({...newRifa, imagenPremio: e.target.value})} placeholder="https://..." className="rounded-xl border-slate-200 h-11" />
              </div>
              <Button onClick={handleCreateRifa} className="w-full h-12 bg-primary-600 hover:bg-primary-700 rounded-xl mt-4 font-bold text-lg shadow-lg shadow-primary-600/20">
                Publicar Rifa
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs defaultValue="rifas" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl w-full max-w-lg grid grid-cols-3">
          <TabsTrigger value="rifas" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wider">Rifas Activas</TabsTrigger>
          <TabsTrigger value="pagos" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wider">Validaciones</TabsTrigger>
          <TabsTrigger value="numeros" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wider">Gestión Números</TabsTrigger>
        </TabsList>

        <TabsContent value="rifas" className="pt-6">
          <div className="grid grid-cols-1 gap-4">
            {rifas.map(rifa => (
              <Card key={rifa.id} className="bento-card overflow-hidden p-0 border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-48 h-32 md:h-auto overflow-hidden bg-slate-100">
                    <img 
                      src={rifa.imagenPremio ? (rifa.imagenPremio.startsWith('http') ? rifa.imagenPremio : `https://${rifa.imagenPremio}`) : 'https://picsum.photos/seed/gift/400/300'} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/400/300?blur=1';
                      }}
                    />
                  </div>
                  <CardContent className="flex-grow p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="space-y-1 text-center md:text-left">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{rifa.id.slice(-8)}</span>
                      <h3 className="font-display font-bold text-xl text-slate-800">{rifa.nombre}</h3>
                      <div className="text-[10px] font-bold text-primary-600/70 uppercase tracking-tight mb-1">
                        Encargado: {rifa.responsable || 'Administrador'}
                      </div>
                      <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                        <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" /> {rifa.cantidadNumeros} Números</span>
                        <Badge variant="outline" className={rifa.estado === 'activa' ? 'text-emerald-600 border-emerald-200 bg-emerald-50 font-bold' : 'text-slate-400 font-bold'}>
                          {rifa.estado.toUpperCase()}
                        </Badge>
                        {rifa.numeroGanador && (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 font-bold">
                            <Trophy className="w-3.5 h-3.5" />
                            Ganador: {rifa.numeroGanador}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {rifa.estado === 'activa' && (
                        <Button 
                          variant="outline"
                          onClick={() => navigate(`/admin/rifa/${rifa.id}`)}
                          className="border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2 rounded-xl font-bold"
                        >
                          <Ticket className="w-4 h-4" />
                          Gestionar
                        </Button>
                      )}
                      {rifa.estado === 'activa' && (
                        <Button 
                          onClick={() => handleFinalizarRifa(rifa)} 
                          className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-2 rounded-xl font-bold border-none"
                        >
                          <Trophy className="w-4 h-4" />
                          Sorteo
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors" onClick={() => deleteDoc(doc(db, 'rifas', rifa.id))}>
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pagos" className="pt-6">
          <Card className="bento-card border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Pagos por Validar ({pagosPendientes.length})</h3>
            
            {pagosPendientes.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400">No hay pagos pendientes de validación.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pagosPendientes.map(pago => (
                  <div key={pago.id} className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {pago.id.slice(-8)}</span>
                        <Badge variant="outline" className="text-amber-600 border-amber-100 bg-amber-50">PENDIENTE</Badge>
                      </div>
                      <div className="font-bold text-slate-800">${pago.montoTotal.toLocaleString()}</div>
                      <div className="text-xs font-medium text-slate-600">
                        {pago.cliente?.nombre || 'ID: ' + pago.usuarioId}
                        {pago.cliente?.telefono && <span className="ml-2 text-slate-400">({pago.cliente.telefono})</span>}
                      </div>
                      {pago.cliente?.vendedor && (
                        <div className="text-[10px] font-bold text-primary-600 uppercase tracking-widest mt-1">
                          Vendedor: {pago.cliente.vendedor}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {pago.numeros.map((n: number) => (
                          <span key={n} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-600">#{n}</span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      {pago.comprobanteURL && pago.comprobanteURL.startsWith('http') ? (
                        <Button variant="outline" size="sm" className="flex-1 md:flex-none h-9 rounded-lg" asChild>
                          <a href={pago.comprobanteURL} target="_blank" rel="noopener noreferrer">Ver Comprobante</a>
                        </Button>
                      ) : (
                        <div className="text-[10px] bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-slate-400 font-bold uppercase tracking-tight">
                           Sin Comprobante
                        </div>
                      )}
                      <Button size="sm" className="flex-1 md:flex-none h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={() => handleValidarPago(pago, 'validado')}>
                        <Check className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 md:flex-none h-9 rounded-lg font-bold" onClick={() => handleValidarPago(pago, 'rechazado')}>
                        <X className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                      <Button size="icon" variant="ghost" className="text-slate-300 hover:text-red-600" onClick={() => handleEliminarReservaRaw(pago)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="numeros" className="pt-6">
          <Card className="bento-card border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-lg font-bold text-slate-800">Control de Números Reservados</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="w-20 font-bold text-xs uppercase tracking-widest text-slate-400"># Nro</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-400">Cliente</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-400">ID Sorteo</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-400">Estado Pago</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase tracking-widest text-slate-400">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservedNumbers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">No hay números reservados actualmente</TableCell>
                    </TableRow>
                  ) : (
                    reservedNumbers.sort((a,b) => a.numero - b.numero).map((reserva) => (
                      <TableRow key={reserva.id} className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                        <TableCell className="font-bold text-primary-600">
                           #{reserva.numero.toString().padStart(3, '0')}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-800">{reserva.clienteNombre || 'Invitado'}</div>
                          {reserva.vendedor && (
                            <div className="text-[9px] font-bold text-primary-600 uppercase tracking-wider">{reserva.vendedor}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] font-bold text-slate-400 uppercase">
                          {reserva.rifaId?.slice(-6)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                             <input 
                               type="checkbox" 
                               checked={reserva.estadoPago === 'validado'}
                               onChange={() => handleTogglePagoReserva(reserva)}
                               className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                             />
                             <Badge className={`
                               font-bold text-[9px] uppercase tracking-wider
                               ${reserva.estadoPago === 'validado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}
                             `}>
                               {reserva.estadoPago === 'validado' ? 'Pagado' : 'Pendiente'}
                             </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-1">
                             <Button 
                               variant="ghost" 
                               size="icon" 
                               className="text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-full"
                               onClick={() => setEditingReserva(reserva)}
                             >
                               <Pencil className="w-4 h-4" />
                             </Button>
                             <Button 
                               variant="ghost" 
                               size="icon" 
                               className="text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                               onClick={() => handleEliminarUnaReserva(reserva)}
                             >
                               <Trash2 className="w-4 h-4" />
                             </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Reserva Dialog */}
      <Dialog open={!!editingReserva} onOpenChange={() => setEditingReserva(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Editar Reserva #{editingReserva?.numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label>Nombre del Cliente</Label>
              <Input 
                value={editingReserva?.clienteNombre || ''} 
                onChange={e => setEditingReserva({...editingReserva, clienteNombre: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <Button onClick={handleUpdateReserva} className="w-full h-12 bg-primary-600 rounded-xl font-bold">
              Guardar Cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
