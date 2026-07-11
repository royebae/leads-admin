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

import { readFileSync, writeFileSync } from 'fs';

const LEADS_FILE = 'public/leads-data.json';
const PAGOS_API_FILE = 'public/pagos-data.json';

console.log('=== Enriching leads with API payment data ===\n');

// Load data
const leads = JSON.parse(readFileSync(LEADS_FILE, 'utf-8'));
const pagosApi = JSON.parse(readFileSync(PAGOS_API_FILE, 'utf-8')).pagos;

console.log(`Leads: ${leads.leads.length}`);
console.log(`API payments: ${pagosApi.length}`);

// Build map: id_paciente → payments
const paymentsByPatient = {};
let unmatchedPayments = 0;
for (const p of pagosApi) {
  const pid = p.id_paciente;
  if (!pid) { unmatchedPayments++; continue; }
  if (!paymentsByPatient[pid]) paymentsByPatient[pid] = [];
  paymentsByPatient[pid].push(p);
}
console.log(`Unmatched payments (no id_paciente): ${unmatchedPayments}`);
console.log(`Patients with payments in API: ${Object.keys(paymentsByPatient).length}`);

// Enrich each lead
let matchedApi = 0;
let totalApiMonto = 0;
for (const lead of leads.leads) {
  const ns = lead.nombre_social;
  if (!ns) continue;
  
  const pid = parseInt(ns, 10);
  if (isNaN(pid)) continue;
  
  const patientPayments = paymentsByPatient[pid];
  if (!patientPayments || patientPayments.length === 0) continue;
  
  matchedApi++;
  
  // Calculate totals
  const montoTotal = patientPayments.reduce((s, p) => s + (p.monto_pago || 0), 0);
  totalApiMonto += montoTotal;
  
  // Breakdown by payment method
  const byMetodo = {};
  for (const p of patientPayments) {
    const metodo = p.medio_pago || 'Otro';
    if (!byMetodo[metodo]) byMetodo[metodo] = { count: 0, total: 0 };
    byMetodo[metodo].count++;
    byMetodo[metodo].total += p.monto_pago || 0;
  }
  
  // Timeline (sorted by date)
  const dates = patientPayments.map(p => p.fecha_recepcion).filter(Boolean).sort();
  
  // Store enriched data on the lead
  lead.pagos_api = {
    total: montoTotal,
    transactions: patientPayments.length,
    first_payment: dates[0] || null,
    last_payment: dates[dates.length - 1] || null,
    by_metodo: Object.fromEntries(
      Object.entries(byMetodo).sort((a, b) => b[1].total - a[1].total)
    ),
    source: 'dentalink-api'
  };
}

console.log(`\nLeads with API payment match: ${matchedApi} / ${leads.leads.length}`);
console.log(`Total API payment amount matched: $${(totalApiMonto).toLocaleString()}`);

// Update metadata
if (!leads.metadata) leads.metadata = {};
leads.metadata.pagos_api_source = 'dentalink-api';
leads.metadata.pagos_api_total = totalApiMonto;
leads.metadata.pagos_api_patients = matchedApi;
leads.metadata.pagos_api_transactions = pagosApi.length;

// Save enriched data
writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
console.log(`\nSaved enriched ${LEADS_FILE}`);
console.log('Done!');
