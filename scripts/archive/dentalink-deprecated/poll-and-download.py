#!/usr/bin/env python3
"""Poll historial for report IDs 168 and 169 and download via S3 when ready."""
import urllib.request, json, re, time, os, sys

PHPSESSID = "7tk4mf24dli8ghhk57uthbv8tkg177fc"
BASE = "https://drdiente.dentalink.cl"
OUT_DIR = "/home/hermes/leads-admin/data/imports/pagos"
os.makedirs(OUT_DIR, exist_ok=True)

# New IDs with correct params: sucursal_id="all", documentos="all"
TARGETS = {"170": "pagos-globales", "171": "pagos-acciones-servicio"}

def check():
    req = urllib.request.Request(f"{BASE}/solicitudes_reportes/historial")
    req.add_header("Cookie", f"PHPSESSID={PHPSESSID}")
    resp = urllib.request.urlopen(req, timeout=30)
    html = resp.read().decode()
    # Use regex to find the big JSON array with all reports
    import re
    matches = list(re.finditer(r'\[\{"id".*?}\]', html, re.DOTALL))
    for m in matches:
        data = json.loads(m.group())
        if len(data) < 50:
            continue
        results = {}
        for item in data:
            sid = item['id']
            if sid in TARGETS:
                results[sid] = item
        return results, None
    return None, "No report data found"

import sys
print(f"Polling for reports {list(TARGETS.keys())}...")
for i in range(60):
    results, err = check()
    if err:
        print(f"  [{i+1}] Error: {err}")
        time.sleep(30)
        continue
    
    ready = True
    for sid, name in TARGETS.items():
        if sid not in results:
            print(f"  [{i+1}] ID {sid} not yet in historial")
            ready = False
            continue
        
        item = results[sid]
        estado = item.get('id_estado', '?')
        s3 = item.get('s3_path', '')
        status_str = f"estado={estado}"
        if s3:
            status_str += f" s3_path={s3[:40]}..."
        print(f"  [{i+1}] ID {sid} ({name}): {status_str}")
        
        if estado == '3' and s3:
            # Download!
            s3_url = f"https://{item['s3_bucket']}.s3.amazonaws.com/{s3}"
            out_name = f"{name}-full.xlsx"
            out_path = os.path.join(OUT_DIR, out_name)
            
            req2 = urllib.request.Request(s3_url)
            resp2 = urllib.request.urlopen(req2, timeout=120)
            data2 = resp2.read()
            with open(out_path, 'wb') as f:
                f.write(data2)
            mb = len(data2) / (1024*1024)
            print(f"    ✅ DOWNLOADED: {out_path} ({mb:.1f} MB)")
        else:
            ready = False
    
    if ready:
        print("\n✅ AMBOS REPORTES DESCARGADOS!")
        sys.exit(0)
    
    print(f"  Waiting 30s...\n")
    time.sleep(30)

print("Timeout - reports not ready yet")
