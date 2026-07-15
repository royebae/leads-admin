# Estrategia de flujo completo de Inbound Marketing

**Proyecto:** Dr. Diente — Inbound Marketing con Email + WhatsApp automático + informe a recepción  
**Inicio:** inmediato  
**Objetivo:** que cada lead nuevo o reactivable tenga seguimiento automático, visible para recepción, con prioridad clara para llamadas y seguimiento especial.

---

## 1. Flujo general

```text
Lead entra / lead reactivable
  ↓
Normalización de datos: nombre, teléfono, email, tratamiento/interés, fuente, fecha
  ↓
Clasificación automática
  ↓
Asignación de canal:
  - WhatsApp + Email
  - Solo WhatsApp
  - Solo Email
  - Solo llamada
  ↓
Cadencia automática
  - WhatsApp inmediato
  - Email de respaldo
  - Follow-up WhatsApp
  - Follow-up Email
  ↓
Informe diario a recepción
  - leads calientes para llamar
  - respuestas recibidas
  - leads sin respuesta
  - casos especiales
  ↓
Recepción llama / agenda / marca resultado
  ↓
Seguimiento especial si no agenda, cancela, no asiste o pide precio
```

---

## 2. Segmentos operativos

| Segmento | Prioridad | Acción principal | Responsable |
|---|---:|---|---|
| Lead nuevo inbound | Alta | WhatsApp inmediato + llamada si no responde | Automatización + recepción |
| Reactivable nunca agendó | Alta | WhatsApp corto + llamada mismo día | Automatización + recepción |
| Canceló / no asistió | Alta | WhatsApp empático + llamada especial | Recepción |
| Preguntó precio / cotización | Alta | Mensaje de valor + llamada de cierre | Recepción |
| Inactivo 60–90 días | Media | Campaña WhatsApp + Email | Automatización |
| Solo email | Media | Secuencia de email + reporte para posible llamada | Automatización + recepción |
| Solo teléfono | Media | Informe directo para llamada | Recepción |
| Sin datos suficientes | Nula | Excluir de campañas | Sistema |

---

## 3. Cadencia inicial recomendada

### Día 0 — inmediato
- WhatsApp automático si hay teléfono válido.
- Email automático si hay email válido.
- Si el lead es de alta prioridad, aparece en informe de recepción para llamada el mismo día.

### Día 1
- WhatsApp follow-up corto si no respondió.
- Recepción llama a leads calientes sin respuesta.

### Día 3
- Email de respaldo con propuesta clara.
- Recepción revisa interesados y pendientes.

### Día 7
- Último WhatsApp suave.
- Si no responde, pasa a nutrición mensual o campaña futura.

---

## 4. Mensajes base — borrador para aprobación

> **Regla:** no activar envíos masivos sin aprobación humana del mensaje final.

### WhatsApp inicial — lead nuevo / reactivable

Hola {{nombre}}, soy de Dr. Diente 😊  
Vimos que tenías interés en {{interes}} y quería ayudarte a resolverlo.  
¿Te gustaría que te compartamos opciones de horario para una valoración?

### WhatsApp follow-up — sin respuesta

Hola {{nombre}}, solo te doy seguimiento rápido.  
Si todavía quieres revisar lo de {{interes}}, podemos ayudarte a encontrar un horario cómodo esta semana. ¿Te gustaría que te pasemos opciones?

### Email inicial

**Asunto:** Seguimiento de Dr. Diente

Hola {{nombre}},

Te escribimos de Dr. Diente para dar seguimiento a tu interés en {{interes}}.

Podemos ayudarte con una valoración y explicarte las opciones de tratamiento según tu caso.

Si quieres, responde este correo o escríbenos por WhatsApp y te compartimos horarios disponibles.

Saludos,  
Equipo Dr. Diente

---

## 5. Informe diario para recepción

El informe debe enviarse cada mañana con esta estructura:

```text
INFORME RECEPCIÓN — DR. DIENTE
Fecha: {{fecha}}

1) Llamar hoy — prioridad alta
- {{nombre}} — {{telefono}} — {{interes}} — motivo: {{motivo}}

2) Respondieron mensajes
- {{nombre}} — respuesta: {{resumen}} — siguiente acción: {{accion}}

3) Pendientes sin respuesta
- {{nombre}} — último contacto: {{fecha}} — canal: {{canal}}

4) Seguimiento especial
- Canceló/no asistió
- Pidió precio
- Caso urgente/dolor
- Paciente con anticipo/plan pendiente
```

---

## 6. Campos mínimos necesarios

| Campo | Uso |
|---|---|
| nombre | Personalización |
| teléfono | WhatsApp / llamada |
| email | Email automático |
| interés comercial | Mensaje relevante |
| fuente | Medición de campaña |
| fecha de entrada / última actividad | Cadencia |
| segmento | Prioridad |
| estado de seguimiento | Evitar duplicados |
| último mensaje enviado | Control de cadencia |
| respuesta recibida | Informe a recepción |
| siguiente acción | Operación diaria |

---

## 7. Estados del seguimiento

```text
nuevo
mensaje_wa_enviado
email_enviado
respondio
requiere_llamada
llamado
agendado
no_responde
seguimiento_especial
perdido
excluido
```

---

## 8. Reglas de seguridad operativa

1. No mandar mensajes duplicados al mismo lead en la misma cadencia.
2. No contactar leads sin canal válido.
3. No activar envío masivo sin revisar una muestra primero.
4. Leads con urgencia/dolor deben ir directo a recepción.
5. Cancelaciones/no asistencias se tratan con tono empático, no agresivo.
6. Mantener visible el reporte diario para que recepción sepa exactamente a quién llamar.

---

## 9. Implementación técnica propuesta

### Fase A — preparación inmediata
- Crear segmentos y estados en el sistema de leads.
- Generar CSV/lista por canal: WhatsApp, Email, llamada.
- Crear plantillas aprobables.
- Crear formato de informe diario.

### Fase B — automatización controlada
- Envío WhatsApp automático con proveedor disponible.
- Envío Email automático.
- Registro de cada contacto enviado.
- Reporte diario a recepción por Telegram/email.

### Fase C — cierre y mejora
- Marcar respuestas y resultados.
- Ajustar prioridad por intención.
- Medir citas generadas, asistencias y tratamientos cerrados.

---

## 10. Pendientes para activar

- Confirmar proveedor real de WhatsApp automático: Elevator/GHL, Twilio, Meta WhatsApp Cloud API u otro.
- Confirmar proveedor de email: Elevator/GHL, Gmail, SendGrid, Resend u otro.
- Confirmar dónde quiere recibir recepción el informe diario: Telegram, email o dashboard.
- Aprobar mensajes iniciales antes de envío real.
