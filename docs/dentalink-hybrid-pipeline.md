# Dentalink Hybrid Pipeline

## Objetivo
Formalizar las dos fuentes válidas de Dentalink para pagos:

1. **REST API pública HealthAtom**
   - Endpoint principal: `GET /api/v1/pagos`
   - Auth: `Authorization: Token <DENTALINK_TOKEN>`
   - Uso: dashboard rápido, totales, refresco ligero, cruces por `id_pago`

2. **Endpoints internos de reportes de Dentalink Web**
   - `POST /solicitudes_reportes/solicitar/`
   - `GET /solicitudes_reportes/estado/{id}/{id_solicitud}`
   - `GET /solicitudes_reportes/download/{id}/0`
   - Auth: `PHPSESSID`
   - Uso: Excel oficial completo (43 columnas global / 53 columnas detalle)

## Regla de oro
- **REST API** = dataset reducido, bueno para app y monitoreo
- **solicitudes_reportes** = fuente oficial completa, buena para conciliación/export
- Ya **no** se debe parsear HTML para polling; el polling va por `estado` + `download`.

## Evidencia ya validada
- `pagos-globales-full.xlsx` y `detalle-full.xlsx` descargados por endpoint interno.
- Headers idénticos a los Excel oficiales históricos comparados:
  - `pagos-globales-full.xlsx` == `reporte-1-5.xlsx`
  - `detalle-full.xlsx` == `reporte-1-10.xlsx`
- La REST API **no** reemplaza el Excel completo, pero sí cuadra en total financiero único salvo un pago cero extra (`ID Pago 1395`).

## Archivos clave
- `scripts/import-dentalink-pagos-api.mjs` — baja pagos desde REST API
- `~/.hermes/scripts/dentalink-excel-poll.py` — polling directo por `estado` + `download`
- `data/imports/pagos/pagos-globales-full.xlsx` — full global oficial
- `data/imports/pagos/detalle-full.xlsx` — full detalle oficial
- `data/imports/pagos/pagos-q*.xlsx` — cortes trimestrales globales
- `data/imports/pagos/detalle-q*.xlsx` — cortes trimestrales detalle

## Flujo recomendado

### A. Refresco ligero con REST API
```bash
cd /home/hermes/leads-admin
export DENTALINK_TOKEN="..."
node scripts/import-dentalink-pagos-api.mjs
```

Resultado esperado:
- `public/pagos-data.json`
- dataset ligero para dashboard / cruces rápidos

### B. Reporte oficial completo por endpoint interno
1. Solicitar reporte(s) si hace falta.
2. Guardar `id` + `id_solicitud`.
3. Polling con:
   - `GET /solicitudes_reportes/estado/{id}/{id_solicitud}`
4. Cuando `finished`:
   - `GET /solicitudes_reportes/download/{id}/0`
5. Guardar `.xlsx` oficial en `data/imports/pagos/`

### C. Reconciliación
Usar el Excel full como source of truth de columnas enriquecidas y la REST API para:
- refresco frecuente
- checks de monto total
- detección de nuevos pagos

## Decisión operativa
- Para la app: preferir REST API por simplicidad/velocidad.
- Para auditoría/conciliación/export oficial: preferir `solicitudes_reportes`.
- Si hay conflicto entre ambas fuentes en columnas enriquecidas, manda el Excel oficial.

## Estado actual
- Poll HTML-based: **deprecado**.
- Poll endpoint-based: **activo**.
- HTML parsing para historial: **no usar** salvo depuración puntual.
