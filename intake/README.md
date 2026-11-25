# Intake · formulario → Linear

Cada envío crea el issue en el equipo `TMDCTMD` con responsable, labels, estado, fecha
y solicitante mencionado.

## Estructura

```
public/
  index.html        el formulario
  config.json       ← fuente única de verdad (equipo, reglas, formatos, apiBase)
core/
  linear.js         cliente GraphQL + resolvers
  handler.js        validación, reglas, armado del issue
adapters/
  worker.js         Cloudflare Worker (producción)
  netlify.js        Netlify (alternativa, misma lógica)
  node.js           servidor local para probar
```

## Desarrollo

```bash
cp .env.example .env
npm run dev            # http://localhost:8899
```

## Publicar

### 1. Página (GitHub Pages)

Automático: cada push a `main` que toque `public/` despliega el formulario.
La URL queda como `https://alegra-team.github.io/socialmedia-alegra/`.

Activar una vez en **Settings → Pages → Source: GitHub Actions**.

### 2. API (Cloudflare Worker)

```bash
npm i -g wrangler
wrangler login
wrangler secret put LINEAR_API_KEY    # queda cifrada, no en el repo
npm run deploy:worker
```

Copia la URL del Worker en `public/config.json`:

```json
"apiBase": "https://tmd-intake.<tu-subdominio>.workers.dev"
```

Vuelve a hacer push para que Pages tome el cambio.

## Reglas de asignación

Se evalúan en orden; gana la primera que coincide. Lo que no coincide va a Ashley.

| Versión | Canal | Responsable |
|---|---|---|
| COL | YouTube | Pablo Muñoz |
| MEX | YouTube | Ashley Mondragón |
| COL / MEX | Social Media (Reels) | Darwing López |
| CRI / DOM | YouTube y Social Media | Katherine Ríos |
| cualquiera | Academy, Producto | Aura Fuentes |
| cualquiera | PDC | Katherine Ríos |
| resto | resto | Ashley Mondragón |

Cambiar una regla = editar `public/config.json`. Nada más. El formulario muestra el
responsable calculado antes de enviar, con la regla que lo justifica.

## Qué hace cada envío

1. Valida: fecha no vencida, links `https://`, correo `@alegra.com`, campos condicionales
   (pantallas obligatorias con *Loop - Product*).
2. Resuelve los labels **solo dentro de `TMDCTMD`**: hay nombres repetidos en otros equipos
   y tomarlos prestados hace que el label se pierda.
3. Resuelve al solicitante por correo, lo menciona y lo suscribe.
4. Crea el issue en estado `Todo`.
5. Comenta la trazabilidad y los avisos.
6. Con canal **Paid** crea dos sub-issues con entregable explícito: *Guión* (4 días antes)
   y *Grabación* (2 días antes).
7. Es idempotente: reenviar el mismo formulario devuelve el issue ya creado.

## Notas de la API de Linear

- Las menciones usan la **URL del perfil** (`https://linear.app/alegra/profiles/fer-sm`),
  no `@nombre`. El slug no siempre es el correo: se toma el campo `url` del usuario.
- `team(id: $t)` pide `String!`; `filter: { team: { id: { eq: $t } } }` pide `ID!`.
- Los labels son por equipo. Aplicar el de otro equipo falla aunque el nombre coincida.
