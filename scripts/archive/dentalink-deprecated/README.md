# Dentalink deprecated scripts

Estos scripts quedaron archivados porque fueron reemplazados por el pipeline híbrido formal.

## Reemplazos actuales
- Estado general / referencia operativa:
  - `scripts/dentalink-hybrid-pipeline.sh`
  - `docs/dentalink-hybrid-pipeline.md`
- Polling oficial de reportes:
  - `~/.hermes/scripts/dentalink-excel-poll.py`
- Job semanal híbrido:
  - `~/.hermes/scripts/dentalink-hybrid-weekly.sh`
- Refresh REST API:
  - `scripts/import-dentalink-pagos-api.mjs`

## Por qué se archivaron
- dependían de parsear HTML
- dependían de Playwright/UI scraping para tareas que ya resolvimos por endpoint interno
- eran exploratorios o variantes intermedias del mismo flujo
- algunos generaban Excels API simplificados que ya quedaron superseded por `import-dentalink-pagos-api.mjs`
- generaban confusión sobre cuál era el camino oficial

## Regla
No usar estos scripts salvo para arqueología/debug histórico.
