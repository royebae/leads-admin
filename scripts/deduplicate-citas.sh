export LD_LIBRARY_PATH=/home/hermes/.local/chrome-libs/usr/lib/x86_64-linux-gnu
ROOT="/home/hermes/leads-admin"
cd "$ROOT"

python3 - <<'PY'
import json
from collections import Counter

print("Cargando leads-data.json...")
d = json.load(open('data/leads-data.json'))
leads = d['leads']

antes = Counter()
despues = Counter()

cambios = 0

for l in leads:
    citas = l.get('citas', [])
    total_antes = len(citas)
    antes[total_antes] += 1
    
    # Deduplicar: agrupar por (fecha + hora)
    seen = {}
    for c in citas:
        key = str(c.get('fecha', '')) + '|' + str(c.get('hora', c.get('hora_inicio', '')))
        # Si ya vimos esta fecha+hora, quedarnos con la que tenga estado más "avanzado"
        if key not in seen or (
            # preferir Atendido > Cancelado > Cambio de fecha
            {'Atendido': 3, 'Atendida': 3, 'Confirmada': 2, 'Agendada': 2, 'Cancelada': 1, 'Cancelado': 1,
             'No Asistió': 1, 'No Asistio': 1, 'Cambio de fecha': 0}.get(
                str(c.get('estado', c.get('estado_cita', ''))), 2
            ) >
            {'Atendido': 3, 'Atendida': 3, 'Confirmada': 2, 'Agendada': 2, 'Cancelada': 1, 'Cancelado': 1,
             'No Asistió': 1, 'No Asistio': 1, 'Cambio de fecha': 0}.get(
                str(seen[key].get('estado', seen[key].get('estado_cita', ''))), 2
            )
        ):
            seen[key] = c
    
    citas_unicas = list(seen.values())
    total_despues = len(citas_unicas)
    despues[total_despues] += 1
    
    if total_antes != total_despues:
        cambios += 1
    
    l['citas'] = citas_unicas
    l['total_citas'] = total_despues

print(f"\nLeads procesados: {len(leads)}")
print(f"Leads con citas corregidas: {cambios}")
print(f"\nAntes (total_citas):")
for k in sorted(antes):
    print(f"  {k}: {antes[k]}")
print(f"\nDespués (citas únicas por fecha+hora):")
for k in sorted(despues):
    print(f"  {k}: {despues[k]}")

# También recalcular segmentos basado en citas únicas
# Pero no es crítico ahora - lo importante es que la UI muestre el número correcto

d['leads'] = leads
d['_meta']['citas_deduplicadas_at'] = None  # just trigger change
open('data/leads-data.json', 'w').write(json.dumps(d))
print(f"\n✅ leads-data.json actualizado")
PY
