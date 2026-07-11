# Pagos Dentalink → Atribución Ads (Elevator click IDs)

## Objetivo

Corroborar conversiones reales de clínica (pagos) y preparar eventos de valor
para Meta / Google / TikTok usando los click IDs guardados en Elevator.

```
Dentalink pagos (API o Excel)
        ↓
  patient_id + monto + fecha + medio
        ↓
  match → elevator_id (leads-admin / phone-email)
        ↓
  Elevator contact custom fields
    fbclid / fbc / gclid / ttclid / UTMs
        ↓
  conversion event payload (Compra)
        ↓
  [FUTURO] CAPI / Offline conversions / Stape
```

## Fuentes de verdad de dinero

### 1) API Dentalink (automatizable)

`GET /api/v1/pagos` (cursor pagination)

Campos útiles:
- `id` (payment_id)
- `id_paciente`
- `nombre_paciente`
- `monto_pago`
- `medio_pago` (Efectivo, Transferencia, Tarjeta débito/crédito…)
- `fecha_recepcion` / `fecha_creacion`
- `id_sucursal` / `nombre_sucursal`
- `numero_referencia`

Script: `scripts/import-dentalink-pagos-api.mjs`

### 2) Excel reportes Dentalink (manual, más rico)

Ruta en Dentalink UI: **Reportes → Tratamientos y Pagos**

Exportar con:
- **todas las sucursales**
- **todos los especialistas**

Reportes prioritarios:
1. **Pagos y acciones de servicio**  
   → qué se pagó / acción de servicio asociada
2. **Pagos globales**  
   → referencia paciente, monto, fecha, medio

Colocar archivos en:
```
data/imports/pagos/
```

Script: `scripts/import-dentalink-pagos-excel.mjs`

Columnas esperadas (nombres flexibles / alias):
- paciente / nombre paciente / id paciente
- monto / total / abono / pago
- fecha / fecha pago / fecha recepción
- medio / forma de pago / método
- sucursal
- dentista / especialista (si existe)
- referencia / folio / id pago
- tratamiento / acción / prestación (reporte acciones)

## Click IDs en Elevator (ya existen)

| Campo UI | fieldKey |
|---|---|
| FBCLID (Meta) | `contact.fbclid_meta` |
| FBC cookie | `contact.fbc_meta_cookie__fbc` |
| GCLID (Google) | `contact.gclid_google_ads` |
| TTCLID (TikTok) | `contact.ttclid_tiktok` |
| UTMs | `contact.utm_*` |

## Reglas de seguridad

- **No enviar** conversiones a ads hasta aprobación explícita.
- Un pago (`payment_id`) = un evento `Compra` máximo.
- Si no hay `elevator_id` o no hay click ID usable → `manual_review`, no dispatch.
- Devoluciones/anulaciones = evento compensatorio (fase posterior).

## Scripts

```bash
# 1) Bajar pagos vía API
DENTALINK_TOKEN=... node scripts/import-dentalink-pagos-api.mjs

# 2) Importar Excel(s) soltados en data/imports/pagos
node scripts/import-dentalink-pagos-excel.mjs

# 3) Armar payloads de conversión (DRY, no envía)
ELEVATOR_API_KEY=... ELEVATOR_LOCATION_ID=... \
  node scripts/build-conversion-events.mjs --dry-run
```

## Estado roadmap

- Fase 7 del sistema de reactivación / atribución comercial.
- Depende de Fase 3 (elevator match) ya en curso.
