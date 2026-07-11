#!/usr/bin/env node
/**
 * enrich-leads-payments.mjs
 * 
 * Enriches lead data with payment history from the Dentalink HealthAtom API.
 * The API has ALL payment records (6,899 transactions, 2024-03 to 2026-07)
 * while the Excel only covers the last ~2 months.
 * 
 * Matches by: lead.nombre_social (Dentalink patient ID) ↔ pago.id_paciente
 * 
 * Output: public/leads-data.json (enriched)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const LEADS_FILE = 'public/leads-data.json';
const SRC_FILE = 'src/data/leads.js';
const PAGOS_API_FILE = 'public/pagos-data.json';
const PAGOS_MERGED_FILE = 'public/pagos-merged.json';
const PAGOS_EXCEL_FILE = 'public/pagos-excel-data.json';

console.log('=== Enriching leads with hybrid payment data ===\n');

const leads = JSON.parse(readFileSync(LEADS_FILE, 'utf-8'));
let pagosData;
let pagosSource;
if (existsSync(PAGOS_MERGED_FILE)) {
  pagosData = JSON.parse(readFileSync(PAGOS_MERGED_FILE, 'utf-8')).pagos || [];
  pagosSource = 'api+excel';
} else if (existsSync(PAGOS_API_FILE)) {
  pagosData = JSON.parse(readFileSync(PAGOS_API_FILE, 'utf-8')).pagos || [];
  pagosSource = 'dentalink-api';
} else if (existsSync(PAGOS_EXCEL_FILE)) {
  pagosData = JSON.parse(readFileSync(PAGOS_EXCEL_FILE, 'utf-8')).pagos || [];
  pagosSource = 'dentalink-excel';
} else {
  console.error('No payment dataset found');
  process.exit(1);
}

console.log(`Leads: ${leads.leads.length}`);
console.log(`Payment rows: ${pagosData.length} (${pagosSource})`);

const paymentsByPatient = {};
let unmatchedPayments = 0;
for (const p of pagosData) {
  const pid = Number(p.id_paciente || p.idPaciente || 0);
  if (!pid) { unmatchedPayments++; continue; }
  if (!paymentsByPatient[pid]) paymentsByPatient[pid] = [];
  paymentsByPatient[pid].push(p);
}
console.log(`Unmatched payments (no id_paciente): ${unmatchedPayments}`);
console.log(`Patients with payments: ${Object.keys(paymentsByPatient).length}`);

let matchedPayments = 0;
let totalMonto = 0;
for (const lead of leads.leads) {
  const pid = Number(lead.id || lead.id_paciente || lead.id_paciente_int || lead.nombre_social || 0);
  const patientPayments = pid ? paymentsByPatient[pid] : null;

  if (!patientPayments || patientPayments.length === 0) {
    lead.pagos_count = 0;
    lead.pagado_total_api = 0;
    lead.ultimo_pago_fecha = null;
    lead.medios_pago = [];
    continue;
  }

  matchedPayments++;
  const montoTotal = patientPayments.reduce((s, p) => s + (Number(p.monto_pago) || 0), 0);
  totalMonto += montoTotal;
  const dates = patientPayments.map(p => p.fecha_recepcion).filter(Boolean).sort();
  const medios = [...new Set(patientPayments.map(p => p.medio_pago).filter(Boolean))];
  const byMetodo = {};
  for (const p of patientPayments) {
    const metodo = p.medio_pago || 'Otro';
    if (!byMetodo[metodo]) byMetodo[metodo] = { count: 0, total: 0 };
    byMetodo[metodo].count++;
    byMetodo[metodo].total += Number(p.monto_pago) || 0;
  }

  lead.pagos_count = patientPayments.length;
  lead.pagado_total_api = montoTotal;
  lead.ultimo_pago_fecha = dates[dates.length - 1] || null;
  lead.medios_pago = medios;
  lead.pagos_api = {
    total: montoTotal,
    transactions: patientPayments.length,
    first_payment: dates[0] || null,
    last_payment: dates[dates.length - 1] || null,
    by_metodo: Object.fromEntries(Object.entries(byMetodo).sort((a, b) => b[1].total - a[1].total)),
    source: pagosSource,
  };
}

const elevatorSyncedCount = leads.leads.filter(l => l.elevator_id).length;
const elevatorOpportunitiesCount = leads.leads.filter(l => l.elevator_opportunity_id).length;

console.log(`\nLeads with payment match: ${matchedPayments} / ${leads.leads.length}`);
console.log(`Total payment amount matched: $${(totalMonto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
console.log(`Elevator leads synced (recount): ${elevatorSyncedCount}`);
console.log(`Elevator opportunities (recount): ${elevatorOpportunitiesCount}`);

if (!leads.metadata) leads.metadata = {};
leads.metadata.pagos_enriched_at = new Date().toISOString();
leads.metadata.pagos_api_source = pagosSource;
leads.metadata.pagos_api_total = totalMonto;
leads.metadata.pagos_api_patients = matchedPayments;
leads.metadata.pagos_api_transactions = pagosData.length;
leads.metadata.elevator_synced_count = elevatorSyncedCount;
leads.metadata.elevator_opportunities_count = elevatorOpportunitiesCount;

writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
if (existsSync('src/data')) {
  writeFileSync(SRC_FILE, `// Generated with payment enrichment\n// ${leads.metadata.pagos_enriched_at}\nexport default ${JSON.stringify(leads)};\n`);
}
console.log(`\nSaved enriched ${LEADS_FILE}`);
console.log('Done!');
