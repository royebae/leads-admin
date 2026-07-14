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
 * Output: data/leads-data.json (enriched)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const LEADS_FILE = 'data/leads-data.json';
const SRC_FILE = 'src/data/leads.js';
const PAGOS_API_FILE = 'data/pagos-data.json';
const PAGOS_MERGED_FILE = 'data/pagos-merged.json';
const PAGOS_EXCEL_FILE = 'data/pagos-excel-data.json';
const PAGOS_FULL_XLSX = 'data/imports/pagos/pagos-globales-full.xlsx';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const COMMERCIAL_INTEREST_RULES = [
  { tag: 'implante_dental', label: 'Implante dental', keywords: ['IMPLANTE', 'IMPLANTOLOGIA', 'IMPLANTOLOGÍA', 'PROTESIS SOBRE IMPLANTE', 'CORONA SOBRE IMPLANTE', 'DESTAPE DE IMPLANTES'] },
  { tag: 'invisalign_ortodoncia', label: 'Invisalign / Ortodoncia', keywords: ['INVISALIGN', 'ORTODONCIA', 'ORTOPEDIA', 'BRACKETS'] },
  { tag: 'endodoncia', label: 'Endodoncia', keywords: ['ENDODONCIA'] },
  { tag: 'protesis_rehabilitacion', label: 'Prótesis / Rehabilitación', keywords: ['PROTESIS', 'PRÓTESIS', 'REHABILITACION', 'REHABILITACIÓN', 'INCRUSTACION', 'INCRUSTACIÓN', 'CORONA'] },
  { tag: 'estetica_dental', label: 'Estética dental', keywords: ['ESTETICA', 'ESTÉTICA', 'BLANQUEAMIENTO', 'BLANQUIAMIENTO', 'BOTOX', 'MEDICINA ESTETICA', 'MEDICINA ESTÉTICA'] },
  { tag: 'cirugia_dental', label: 'Cirugía dental', keywords: ['CIRUGIA', 'CIRUGÍA', 'EXTRACCION', 'EXTRACCIÓN', 'CIRUGIA BUCAL', 'CIRUGÍA BUCAL'] },
  { tag: 'periodoncia', label: 'Periodoncia', keywords: ['PERIODONCIA'] },
  { tag: 'limpieza_consulta', label: 'Limpieza / Consulta', keywords: ['LIMPIEZA', 'CONSULTA', 'PRIMERA CONSULTA', 'PRIMER CONSULTA', 'DIAGNOSTICO', 'DIAGNÓSTICO'] },
  { tag: 'odontologia_general', label: 'Odontología general', keywords: ['ODONTOLOGIA GENERAL', 'ODONTOLOGÍA GENERAL'] },
];

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function classifyCommercialInterest(lead) {
  const treatments = [
    ...(Array.isArray(lead.tratamientos) ? lead.tratamientos : []),
    lead.tratamiento_principal,
    lead.ultima_cita_tratamiento,
  ].filter(Boolean);
  const haystack = normalizeText(treatments.join(' | '));
  for (const rule of COMMERCIAL_INTEREST_RULES) {
    if (rule.keywords.some(keyword => haystack.includes(normalizeText(keyword)))) {
      return { tag: rule.tag, label: rule.label, source: treatments.join(' | ') };
    }
  }
  return { tag: null, label: lead.tratamiento_principal || 'Sin interés detectado', source: treatments.join(' | ') };
}

function readOfficialPayments() {
  if (!existsSync(PAGOS_FULL_XLSX)) return [];
  const workbook = XLSX.readFile(PAGOS_FULL_XLSX, { cellDates: true });
  return workbook.SheetNames.flatMap(sheetName =>
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false })
  ).map(row => ({
    id_paciente: Number(row['# Paciente']) || null,
    id_tratamiento: Number(row['# Tratamiento']) || null,
    sucursal: row['Nombre Sucursal'] || null,
    odontologo: [row['Nombre Profesional Tratamiento'], row['Apellidos Profesional Tratamiento']].filter(Boolean).join(' ').trim() || null,
    especialidad: row['Especialidad Profesional Tratamiento'] || null,
    fecha: row['Fecha de recepción del pago'] || null,
    total_pago: Number(row['Total Pago']) || 0,
    asociado_tratamiento: Number(row['Total asociado a tratamiento']) || 0,
    medio_pago: row['Medio de pago'] || null,
    receptor_pago: row['Receptor del pago'] || null,
    convenio_tratamiento: row['Convenio Tratamiento'] === '-' ? null : row['Convenio Tratamiento'],
  })).filter(row => row.id_paciente);
}

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
const officialPayments = readOfficialPayments();
const officialByPatient = officialPayments.reduce((byPatient, payment) => {
  (byPatient[payment.id_paciente] ||= []).push(payment);
  return byPatient;
}, {});
console.log(`Official Excel rows: ${officialPayments.length} (${PAGOS_FULL_XLSX})`);

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
  const commercialInterest = classifyCommercialInterest(lead);
  lead.interes_comercial = commercialInterest.label;
  lead.interes_comercial_tag = commercialInterest.tag;
  lead.interes_comercial_fuente = commercialInterest.source;
  // Keep legacy field aligned for scripts/Elevator/backward compatibility.
  lead.treatment_tag = commercialInterest.tag;

  const pid = Number(lead.id || lead.id_paciente || lead.id_paciente_int || lead.nombre_social || 0);
  const patientPayments = pid ? paymentsByPatient[pid] : null;
  const patientOfficial = pid ? officialByPatient[pid] : null;

  if (patientOfficial?.length) {
    const sortedOfficial = [...patientOfficial].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const latest = sortedOfficial.at(-1);
    const unique = key => [...new Set(patientOfficial.map(payment => payment[key]).filter(Boolean))];
    const paid = patientOfficial.reduce((sum, payment) => sum + payment.total_pago, 0);
    const associated = patientOfficial.reduce((sum, payment) => sum + payment.asociado_tratamiento, 0);
    lead.pagos_excel_oficial = {
      total: paid, asociado_tratamientos: associated, no_asociado: paid - associated,
      transactions: patientOfficial.length, last_payment: latest?.fecha || null,
      last_treatment_id: latest?.id_tratamiento || null, last_odontologo: latest?.odontologo || null,
      last_especialidad: latest?.especialidad || null, last_receptor: latest?.receptor_pago || null,
      sucursales: unique('sucursal'), odontologos: unique('odontologo'), especialidades: unique('especialidad'),
      tratamientos_ids: unique('id_tratamiento'), medios_pago: unique('medio_pago'), convenios: unique('convenio_tratamiento'),
      source: 'pagos-globales-full.xlsx',
    };
    lead.sucursal_pago_oficial = latest?.sucursal || null;
    lead.odontologo_ultimo_pago = latest?.odontologo || null;
    lead.especialidad_ultimo_pago = latest?.especialidad || null;
  } else {
    lead.pagos_excel_oficial = null;
    lead.sucursal_pago_oficial = null;
    lead.odontologo_ultimo_pago = null;
    lead.especialidad_ultimo_pago = null;
  }

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
leads.metadata.pagos_excel_full_rows = officialPayments.length;
leads.metadata.pagos_excel_full_patients = Object.keys(officialByPatient).length;
leads.metadata.pagos_excel_full_total = officialPayments.reduce((sum, payment) => sum + payment.total_pago, 0);
leads.metadata.deuda_total = leads.leads.reduce((sum, lead) => sum + (Number(lead.deuda_total) || 0), 0);
leads.metadata.elevator_synced_count = elevatorSyncedCount;
leads.metadata.elevator_opportunities_count = elevatorOpportunitiesCount;

writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
if (existsSync('src/data')) {
  writeFileSync(SRC_FILE, `// Generated with payment enrichment\n// ${leads.metadata.pagos_enriched_at}\nexport default ${JSON.stringify(leads)};\n`);
}
console.log(`\nSaved enriched ${LEADS_FILE}`);
console.log('Done!');
