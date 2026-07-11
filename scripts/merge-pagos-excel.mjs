#!/usr/bin/env node
/**
 * Cruza Excel de pagos Dentalink con leads, enriquece data y
 * genera eventos de conversión (dry-run sin enviar a ads).
 *
 * Usage:
 *   node scripts/merge-pagos-excel.mjs
 *   node scripts/merge-pagos-excel.mjs --dry-run --send-ads  # cuando aprobado
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PAGOS_DIR = join(ROOT, 'data', 'imports', 'pagos');
const DATA_DIR = join(ROOT, 'public');

// Load leads data
const leadsData = JSON.parse(readFileSync(join(DATA_DIR, 'leads-data.json'), 'utf-8'));
const leads = leadsData.leads || [];

// Load Excel JSON exports
const pagosGlobales = JSON.parse(readFileSync(join(PAGOS_DIR, 'pagos-globales.json'), 'utf-8'));
const pagosAcciones = JSON.parse(readFileSync(join(PAGOS_DIR, 'pagos-acciones-servicio.json'), 'utf-8'));

console.log(`Leads: ${leads.length}, Pagos globales: ${pagosGlobales.length}, Pagos+acción: ${pagosAcciones.length}`);

// Build patient payment maps
// Globales: amount by patient
const globalByPatient = {};
for (const p of pagosGlobales) {
  const pid = p['# Paciente'];
  if (!pid) continue;
  if (!globalByPatient[pid]) globalByPatient[pid] = [];
  globalByPatient[pid].push(p);
}

// Acciones: payment details by patient
const accionesByPatient = {};
for (const p of pagosAcciones) {
  const pid = p['# Paciente'];
  if (!pid) continue;
  if (!accionesByPatient[pid]) accionesByPatient[pid] = [];
  accionesByPatient[pid].push(p);
}

// Cross-reference with leads
let matchedPagos = 0;
let matchedAcciones = 0;
const enriched = [];

for (const lead of leads) {
  const e = { ...lead };
  
  // Try match by # Paciente from Dentalink
  const pid = lead.id_paciente || lead.id_paciente_int || lead.id;
  
  let pagos = null;
  let acciones = null;
  
  if (pid) {
    const p = globalByPatient[pid];
    const a = accionesByPatient[pid];
    if (p && p.length > 0) pagos = p;
    if (a && a.length > 0) acciones = a;
  }
  
  // Fallback: match by nombre + apellido
  if (!pagos && !acciones) {
    const name = (lead.nombre || '').toLowerCase().trim();
    const apellido = (lead.apellidos || lead.apellido || '').toLowerCase().trim();
    
    if (name && apellido) {
      // Search globales
      const gp = pagosGlobales.filter(r => {
        const rn = (r['Nombre Paciente'] || '').toLowerCase().trim();
        const ra = (r['Apellidos Paciente'] || '').toLowerCase().trim();
        return rn.includes(name) && ra.includes(apellido);
      });
      if (gp.length > 0) pagos = gp;
      
      // Search acciones
      const acc = pagosAcciones.filter(r => {
        const rn = (r['Nombre Paciente'] || '').toLowerCase().trim();
        const ra = (r['Apellidos Paciente'] || '').toLowerCase().trim();
        return rn.includes(name) && ra.includes(apellido);
      });
      if (acc.length > 0) acciones = acc;
    }
  }
  
  if (pagos) matchedPagos++;
  if (acciones) matchedAcciones++;
  
  // Add payment summary
  if (pagos) {
    const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p['Total Pago'] || 0), 0);
    const medios = [...new Set(pagos.map(p => p['Medio de pago']).filter(Boolean))];
    e._pagos_globales = {
      total: totalPagado,
      count: pagos.length,
      medios,
      ultimo_pago: pagos.sort((a, b) => new Date(b['Fecha de recepción del pago'] || 0) - new Date(a['Fecha de recepción del pago'] || 0))[0]?.['Fecha de recepción del pago'],
    };
  }
  
  if (acciones) {
    const prestaciones = [...new Set(acciones.map(a => a['Nombre Prestación']).filter(Boolean))];
    e._pagos_acciones = {
      count: acciones.length,
      prestaciones: prestaciones.slice(0, 20),
      ultimo: acciones.sort((a, b) => new Date(b['Fecha de recepción del pago'] || 0) - new Date(a['Fecha de recepción del pago'] || 0))[0]?.['Fecha de recepción del pago'],
    };
  }
  
  enriched.push(e);
}

console.log(`\nResumen cruce pagos:`);
console.log(`  Con pago global:     ${matchedPagos} / ${leads.length}`);
console.log(`  Con pago+acción:     ${matchedAcciones} / ${leads.length}`);

// Stats
const conPago = enriched.filter(e => e._pagos_globales);
const sumaTotal = conPago.reduce((s, e) => s + (e._pagos_globales?.total || 0), 0);
console.log(`  Suma pagos globales: $${sumaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);

// Medio de pago distribution
const mediosCount = {};
for (const l of enriched) {
  if (!l._pagos_globales?.medios) continue;
  for (const m of l._pagos_globales.medios) {
    mediosCount[m] = (mediosCount[m] || 0) + 1;
  }
}
console.log('\nMedios de pago:', mediosCount);

// Prestaciones más comunes
const prestacionesCount = {};
for (const l of enriched) {
  if (!l._pagos_acciones?.prestaciones) continue;
  for (const p of l._pagos_acciones.prestaciones) {
    prestacionesCount[p] = (prestacionesCount[p] || 0) + 1;
  }
}
const topPrestaciones = Object.entries(prestacionesCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);
console.log('\nTop prestaciones pagadas:');
topPrestaciones.forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// Build conversion events for elevator + click IDs
const conversionEvents = [];
for (const lead of enriched) {
  if (!lead._pagos_globales || !lead.elevator_id) continue;
  
  conversionEvents.push({
    paciente_id: lead.id_paciente,
    nombre: `${lead.nombre || ''} ${lead.apellidos || ''}`.trim(),
    elevator_id: lead.elevator_id,
    pipeline_opportunity_id: lead.elevator_opportunity_id,
    total_pagado: lead._pagos_globales.total,
    count_pagos: lead._pagos_globales.count,
    medio_pagos: lead._pagos_globales.medios,
    ultimo_pago: lead._pagos_globales.ultimo_pago,
    prestaciones: lead._pagos_acciones?.prestaciones || [],
    // Click IDs to add later via Elevator read
    click_id_fb: null,
    click_id_google: null,
    click_id_tiktok: null,
  });
}

console.log(`\nConversiones potenciales (con elevator_id + pago): ${conversionEvents.length}`);

// Write enriched data
const outLeads = join(DATA_DIR, 'leads-data.json');
leadsData.leads = enriched;
leadsData._meta = {
  ...(leadsData._meta || {}),
  pagos_excel_imported_at: new Date().toISOString(),
  pagos_globales_count: pagosGlobales.length,
  pagos_acciones_count: pagosAcciones.length,
  pagos_cruce_leads: matchedPagos,
  pagos_suma_total: sumaTotal,
};

writeFileSync(outLeads, JSON.stringify(leadsData, null, 2));
console.log(`\nLeads enriquecidos guardados en ${outLeads}`);

writeFileSync(
  join(DATA_DIR, 'conversion-events.json'),
  JSON.stringify(conversionEvents, null, 2),
);
console.log(`Eventos de conversión guardados (dry-run): ${conversionEvents.length}`);

// Generate summary table
console.log('\n═══ Top 10 pacientes con más pago ═══');
conversionEvents
  .sort((a, b) => b.total_pagado - a.total_pagado)
  .slice(0, 10)
  .forEach(e => console.log(`  ${e.nombre.padEnd(30)} $${e.total_pagado.toLocaleString('es-MX')} (${e.count_pagos} pagos)`));
