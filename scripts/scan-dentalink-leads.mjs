#!/usr/bin/env node

/**
 * Dentalink Lead Scanner
 *
 * Escanea todos los pacientes en Dentalink vía API (GET /api/v1/pacientes/{id}),
 * consulta su historial de citas y los clasifica en segmentos de reactivación.
 *
 * Uso:
 *   DENTALINK_TOKEN="token" node scripts/scan-dentalink-leads.mjs
 *
 * Modos:
 *   --output=<path>    Ruta del JSON de salida (default: ./public/leads-data.json)
 *   --max-id=<n>       ID máximo a escanear (default: 3000)
 *   --delay=<ms>       Pausa entre requests (default: 1100ms)
 *   --resume=<id>      Reanudar desde un ID específico
 */

// ── Constantes ────────────────────────────────────────────────
const DENTALINK_BASE = 'https://api.dentalink.healthatom.com/api/v1'

// Sucursales conocidas
const SUCURSAL_IDS = {
  1: 'Polanco',
  // 2: 'Roma Norte',  // pendiente confirmar
}

const ESTADOS_CITA = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
  NO_ASISTIO: 'No Asistió',
  REPROGRAMADA: 'Reprogramada',
  EN_ATENCION: 'En Atención',
}

// ── Helpers ────────────────────────────────────────────────────
async function fetchJSON(url, token) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (res.status === 429) {
    // Rate limited — esperar y reintentar
    const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10) + 1
    console.log(`  ⏳ Rate limited, esperando ${retryAfter}s...`)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    return fetchJSON(url, token)
  }
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`)
  }
  return res.json()
}

function normalizePhone(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return ''
  // Ya tiene código de país
  if (digits.length === 13 && digits.startsWith('521')) return '+52' + digits.slice(3)
  if (digits.length === 12 && digits.startsWith('52')) return '+' + digits
  if (digits.length === 10) return '+52' + digits
  // Si el raw ya tenía +, confiar
  if (String(raw).trim().startsWith('+')) return '+' + digits
  return '+' + digits
}

function classifyLead(patient, citas) {
  const now = new Date()
  const hasContact = !!(patient.email || patient.celular || patient.telefono)
  const isDisabled = patient.habilitado === 0

  if (!hasContact) return { segment: 'sin-contacto', label: 'Sin datos de contacto', priority: 0, color: '#6b7280' }
  if (isDisabled) return { segment: 'deshabilitado', label: 'Deshabilitado / dado de baja', priority: 0, color: '#9ca3af' }

  // Analizar citas
  const pastCitas = citas.filter(c => {
    if (!c.fecha) return false
    const fecha = new Date(c.fecha + 'T' + (c.hora_inicio || '00:00'))
    return fecha < now
  })
  const futureCitas = citas.filter(c => {
    if (!c.fecha) return false
    const fecha = new Date(c.fecha + 'T' + (c.hora_inicio || '00:00'))
    return fecha >= now
  })

  const hasFutureCita = futureCitas.length > 0

  // Si tiene cita futura → no es reactivable ahora
  if (hasFutureCita) {
    return { segment: 'tiene-cita', label: 'Ya tiene cita agendada', priority: 0, color: '#22c55e' }
  }

  // Buscar la cita más reciente
  const sortedCitas = [...pastCitas].sort((a, b) => {
    const dateA = new Date(a.fecha + 'T' + (a.hora_inicio || '00:00'))
    const dateB = new Date(b.fecha + 'T' + (b.hora_inicio || '00:00'))
    return dateB - dateA
  })

  const lastCita = sortedCitas[0]
  const totalCitas = citas.length

  // Sin citas nunca → PRIORIDAD MÁXIMA
  if (totalCitas === 0) {
    return { segment: 'nunca-agendo', label: 'Nunca agendó', priority: 5, color: '#ef4444' }
  }

  // Todas las citas fueron canceladas o no asistió
  const cancelledOrNoShow = citas.filter(c =>
    c.estado_cita === 'Cancelada' || c.estado_cita === 'No Asistió'
  )
  if (cancelledOrNoShow.length === totalCitas) {
    return { segment: 'solo-cancelaciones', label: 'Solo canceló / no asistió', priority: 4, color: '#f97316' }
  }

  // Última cita fue no-show
  if (lastCita && (lastCita.estado_cita === 'No Asistió' || lastCita.estado_cita === 'Cancelada')) {
    return { segment: 'ultima-no-asistio', label: 'Última cita: canceló / no asistió', priority: 3, color: '#eab308' }
  }

  // Última cita fue hace tiempo
  if (lastCita && lastCita.fecha) {
    const daysSince = Math.floor((now - new Date(lastCita.fecha)) / (1000 * 60 * 60 * 24))
    if (daysSince >= 90) {
      return { segment: 'inactivo-90d', label: `Inactivo +90 días`, priority: 3, color: '#f97316' }
    }
    if (daysSince >= 60) {
      return { segment: 'inactivo-60d', label: `Inactivo +60 días`, priority: 2, color: '#eab308' }
    }
    if (daysSince >= 30) {
      return { segment: 'inactivo-30d', label: `Inactivo +30 días`, priority: 1, color: '#84cc16' }
    }
    return { segment: 'reciente', label: 'Reciente (-30 días)', priority: 0, color: '#22c55e' }
  }

  return { segment: 'sin-citas-pasadas', label: 'Sin citas pasadas', priority: 3, color: '#a855f7' }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const token = process.env.DENTALINK_TOKEN || process.env.DENTALINK_API_TOKEN
  if (!token) {
    console.error('❌ DENTALINK_TOKEN no está definido')
    process.exit(1)
  }

  // Parse args
  const args = process.argv.slice(2)
  const outputPath = args.find(a => a.startsWith('--output='))?.split('=')[1] || './public/leads-data.json'
  const maxId = parseInt(args.find(a => a.startsWith('--max-id='))?.split('=')[1] || '3000', 10)
  const delayMs = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '1200', 10)
  const resumeId = parseInt(args.find(a => a.startsWith('--resume='))?.split('=')[1] || '1', 10)

  console.log('═══════════════════════════════════════════')
  console.log('  DENTALINK LEAD SCANNER')
  console.log('═══════════════════════════════════════════')
  console.log(`  Max ID: ${maxId}`)
  console.log(`  Delay:  ${delayMs}ms`)
  console.log(`  Resume: ${resumeId}`)
  console.log(`  Output: ${outputPath}`)
  console.log('')

  const results = []
  let exists = 0
  let withContact = 0
  let errors = 0
  let skipped = 0
  const startTime = Date.now()

  // Resumen por segmento
  const segmentCount = {}

  for (let id = resumeId; id <= maxId; id++) {
    process.stdout.write(`\r  📡 ID ${id}/${maxId} (${exists} encontrados, ${errors} errores)`)

    await new Promise(r => setTimeout(r, delayMs))

    try {
      const data = await fetchJSON(`${DENTALINK_BASE}/pacientes/${id}`, token)
      if (!data || !data.data) {
        skipped++
        continue
      }

      const patient = data.data
      exists++

      // Obtener citas del paciente
      let citas = []
      try {
        await new Promise(r => setTimeout(r, 400))
        const citasData = await fetchJSON(`${DENTALINK_BASE}/pacientes/${id}/citas`, token)
        citas = citasData?.data || []
      } catch (e) {
        // Si fallan las citas, continuar sin ellas
        console.error(`\n  ⚠️ Error fetching citas for ${id}: ${e.message}`)
      }

      // Clasificar
      const classification = classifyLead(patient, citas)

      const phone = normalizePhone(patient.celular || patient.telefono || '')
      const email = (patient.email || '').trim().toLowerCase()
      if (phone || email) withContact++

      const sucursal = SUCURSAL_IDS[patient.id_sucursal] || ''

      // Contar segmentos
      segmentCount[classification.segment] = (segmentCount[classification.segment] || 0) + 1

      results.push({
        id: patient.id,
        nombre: `${patient.nombre} ${patient.apellidos}`.trim(),
        nombre_social: patient.nombre_social || '',
        email,
        phone,
        sucursal,
        fecha_afiliacion: patient.fecha_afiliacion,
        sexo: patient.sexo || '',
        observaciones: patient.observaciones || '',
        habilitado: patient.habilitado === 1,
        fecha_deshabilitacion: patient.fecha_deshabilitacion || '',
        segment: classification.segment,
        segment_label: classification.label,
        segment_priority: classification.priority,
        segment_color: classification.color,
        total_citas: citas.length,
        ultima_cita_fecha: citas.length > 0 ? citas[citas.length - 1].fecha : null,
        ultima_cita_estado: citas.length > 0 ? citas[citas.length - 1].estado_cita : null,
        ultima_cita_tratamiento: citas.length > 0 ? (citas[citas.length - 1].nombre_tratamiento || '') : null,
        citas: citas.map(c => ({
          id: c.id,
          fecha: c.fecha,
          hora: c.hora_inicio,
          estado: c.estado_cita,
          tratamiento: c.nombre_tratamiento || '',
          dentista: c.nombre_dentista || '',
          sucursal: SUCURSAL_IDS[c.id_sucursal] || c.nombre_sucursal || '',
          anulada: c.estado_anulacion === 1,
          confirmada: c.estado_confirmacion === 1,
        })),
      })
    } catch (e) {
      errors++
      if (errors > 20) {
        console.error(`\n❌ Demasiados errores consecutivos (${errors}). Abortando.`)
        break
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
  console.log('\n\n═══════════════════════════════════════════')
  console.log('  RESULTADOS')
  console.log('═══════════════════════════════════════════')
  console.log(`  IDs escaneados:  ${maxId - resumeId + 1}`)
  console.log(`  Pacientes encontrados: ${exists}`)
  console.log(`  Con contacto:    ${withContact}`)
  console.log(`  Errores:         ${errors}`)
  console.log(`  Tiempo:          ${elapsed} min`)
  console.log('')
  console.log('  Segmentos:')
  for (const [seg, count] of Object.entries(segmentCount).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${seg.padEnd(20)} ${count}`)
  }

  // Construir el objeto de salida
  const output = {
    metadata: {
      scanned_at: new Date().toISOString(),
      total_scanned: maxId - resumeId + 1,
      total_patients: exists,
      total_with_contact: withContact,
      errors,
      scan_duration_min: parseFloat(elapsed),
    },
    segment_summary: segmentCount,
    leads: results,
  }

  // Guardar
  const fs = await import('fs/promises')
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2))
  console.log(`\n  ✅ Datos guardados en: ${outputPath}`)
  console.log(`  📊 Total leads con contacto: ${withContact}`)
  console.log('')
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
