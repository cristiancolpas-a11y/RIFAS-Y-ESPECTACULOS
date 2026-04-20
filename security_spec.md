# Security Spec - SorteoYa

## Data Invariants
- Un usuario no puede comprar un número que ya está reservado o validado para otro usuario en la misma rifa.
- Solo los administradores pueden crear, modificar o finalizar rifas.
- Solo los administradores pueden generar el número ganador.
- Un usuario solo puede ver sus propios comprobantes de pago detallados.
- El estado de pago solo puede ser actualizado por un administrador.
- Los números reservados deben ser validados mediante una transacción para evitar "Update-Gaps".

## The "Dirty Dozen" Payloads
1. Intento de un participante de crear una rifa.
2. Intento de un usuario de validar su propio pago.
3. Intento de comprar un número negativo o mayor al límite de la rifa.
4. Intento de modificar el número ganador de una rifa activa.
5. Intento de leer la colección privada de usuarios sin ser admin.
6. Intento de borrar una rifa con compras activas.
7. Intento de inyectar un campo `isAdmin: true` en el perfil de usuario.
8. Intento de reservar un número que ya existe en `numeros_reservados`.
9. Intento de modificar la fecha de un sorteo ya finalizado.
10. Intento de leer el comprobante de pago de otro usuario.
11. Intento de exceder el límite de caracteres en el nombre de la rifa (DoS).
12. Intento de realizar un sorteo antes de la fecha programada.

## Test Strategy
- Se implementarán reglas que bloqueen escrituras basadas en el rol almacenado en `/usuarios/{userId}`.
- Se usará `exists()` para prevenir doble compra de números.
- Se usará `affectedKeys().hasOnly()` para restringir cambios de estado de pago.
