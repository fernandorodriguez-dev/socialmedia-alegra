# socialmedia-alegra

Skills, playbooks y automatizaciones de IA para el equipo de Social Media de Alegra.

| Carpeta | Qué es |
|---|---|
| `intake/` | Formulario web de solicitudes que crea issues en Linear (equipo `TMDCTMD`) |
| `intake-chat/` | El mismo intake, pero conversando con un bot en Google Chat con `/video` |

## Formulario de intake

Formulario público para pedir piezas de video. Al enviar, crea el issue en Linear con
responsable, labels, estado, fecha y solicitante mencionado.

- Se publica en **GitHub Pages** desde `intake/public/` (workflow `pages.yml`).
- La lógica y la `LINEAR_API_KEY` viven en un **Worker de Cloudflare**, no en el repo.
- Reglas de asignación y formatos se editan en `intake/public/config.json`, sin tocar código.

### Por qué hay un Worker

GitHub Pages solo sirve archivos estáticos. Si la llamada a Linear saliera del navegador,
la API key quedaría visible para cualquiera que abra el inspector. Por eso la página es
estática y el POST va a un Worker que guarda la key como secret cifrado.

El frontend no sabe dónde está la API: lee `apiBase` de `config.json`.

```
GitHub Pages (estático)          Cloudflare Worker (secret)
intake/public/index.html  ──POST──▶  intake/adapters/worker.js
        │                                    │
        └── fetch config.json                └── api.linear.app/graphql
```

### Puesta en marcha

```bash
cd intake
cp .env.example .env       # pega tu LINEAR_API_KEY
npm run dev                # http://localhost:8899
```

Para producción, ver `intake/README.md`.

### Documentación

Wiki: [Formulario de intake → Linear (v2)](https://wiki.alegra.com/doc/formulario-de-intake-linear-v2-iGmglxYc1p)

## Convenciones

- Sin dependencias en el formulario: Node 18+ y nada más.
- Ningún adaptador de hosting tiene lógica de negocio. La lógica está en `intake/core/`.
- Los secretos nunca entran al repo (lo verifica `ci.yml` en cada push).
