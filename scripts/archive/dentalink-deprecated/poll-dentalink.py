#!/usr/bin/env python3
"""
Poll Dentalink historial page for new report completion
and download via S3 direct URL.
"""
import urllib.request, json, re, time, os

PHPSESSID = "4nona79m5vtc0h20a81fk2l8m6l6vkuh"
BASE = "https://drdiente.dentalink.cl"
OUT_DIR = "/home/hermes/leads-admin/data/imports/pagos"
os.makedirs(OUT_DIR, exist_ok=True)

TARGET_IDS = {168: "pagos-globales", 169: "pagos-acciones-servicio"}
DOWNLOADED = set()

def fetch_solicitudes():
    req = urllib.request.Request(f"{BASE}/solicitudes_reportes/historial")
    req.add_header("Cookie", f"PHPSESSID={PHPSESSID}")
    resp = urllib.request.urlopen(req)
    html = resp.read().decode()
    
    # Extract dataSolicitudes JSON from script tag
    m = re.search(r'window\.dataSolicitudes\s*=\s*(\[[\s\S]*?\])\s*;', html)
    if not m:
        return None
    return json.loads(m.group(1))

def download_from_s3(s3_path, s3_bucket, out_name):
    url = f"https://{s3_bucket}.s3.amazonaws.com/{s3_path}"
    print(f"  Downloading: {url}")
    try:
        req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=60)
        data = resp.read()
        filepath = os.path.join(OUT_DIR, f"{out_name}-full.xlsx")
        with open(filepath, "wb") as f:
            f.write(data)
        size_mb = len(data) / (1024*1024)
        print(f"  ✅ Saved: {filepath} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"  S3 download failed: {e}")
        return False

def main():
    print("=== Polling Dentalink historial for new reports ===")
    max_polls = 60  # up to ~30 min (30s interval)
    
    for poll in range(1, max_polls + 1):
        print(f"\n--- Poll {poll} ---")
        
        solicitudes = fetch_solicitudes()
        if solicitudes is None:
            print("  Could not parse dataSolicitudes from page")
            time.sleep(30)
            continue
            
        print(f"  Total solicitudes: {len(solicitudes)}")
        
        for s in solicitudes:
            sid = int(s.get("id", 0))
            if sid in TARGET_IDS and sid not in DOWNLOADED:
                out_name = TARGET_IDS[sid]
                estado = s.get("id_estado")
                nombre = s.get("nombre")
                s3_path = s.get("s3_path", "")
                s3_bucket = s.get("s3_bucket", "")
                opts = json.loads(s.get("options", "{}"))
                
                print(f"\n  ID {sid}: {nombre}")
                print(f"    Estado: {s.get('estado')} (id_estado={estado})")
                print(f"    Fechas: {opts.get('fecha_inicio')} -> {opts.get('fecha_fin')}")
                print(f"    S3: {s3_path or 'pendiente'}")
                
                if estado == 3 and s3_path:
                    ok = download_from_s3(s3_path, s3_bucket, out_name)
                    if ok:
                        DOWNLOADED.add(sid)
                elif estado == 1:
                    print(f"    ⏳ Report is queued/processing...")
                elif estado == 2:
                    print(f"    ⏳ Processing...")
        
        if DOWNLOADED == set(TARGET_IDS.keys()):
            print("\n✅ AMBOS REPORTES DESCARGADOS!")
            return
        
        if poll < max_polls:
            print(f"\n  Waiting 30s...")
            time.sleep(30)
    
    print(f"\n⚠️  Reports not ready after {max_polls} polls")

if __name__ == "__main__":
    main()
