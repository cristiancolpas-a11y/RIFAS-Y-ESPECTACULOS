const createSampleRifa = async (db, user) => {
  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  try {
    await addDoc(collection(db, 'rifas'), {
      nombre: 'iPhone 15 Pro Max - Sorteo Inaugural',
      descripcion: 'Participa por el último iPhone con 256GB. Incluye garantía de 1 año y envío gratis!',
      precioPorNumero: 5000,
      cantidadNumeros: 100,
      fechaSorteo: new Date('2026-05-30T20:00:00'),
      imagenPremio: 'https://picsum.photos/seed/iphone/800/450',
      estado: 'activa',
      createdAt: serverTimestamp(),
      createdBy: user?.uid || 'system'
    });
    console.log("Sample Rifa created");
  } catch (e) {
    console.error("Error creating sample rifa:", e);
  }
};
export default createSampleRifa;
