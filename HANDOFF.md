# Handoff — Bot de intake TMD en Google Chat

Documento de traspaso. Todo lo que se hizo, lo que funciona, lo que falta y las trampas
que costaron horas. Fecha: 27 de noviembre de 2026.

---

## 1. Objetivo

Que cualquier persona del equipo pida una pieza de video **desde Google Chat** escribiendo
`/video`, y que se cree automáticamente el issue en Linear con responsable, labels, fecha
y la persona mencionada. Sin formularios externos ni pegar el correo a mano.

---

## 2. Estado actual

| Pieza | Estado | Evidencia |
|---|---|---|
| Código del bot | ✅ Completo | 30+ comprobaciones verdes en `node test/simulate.js` contra **Linear real** |
| Lógica de Linear | ✅ Verificada | Crea issue, asigna, etiqueta, menciona, sub-issues de Paid, idempotencia |
| Formulario por enlace (plan B) | ✅ **Funcionando** | `doGet` y `crearIssue` ejecutados con estado `Completed`; issue creado y borrado por el usuario |
| App de Chat creada | ✅ | `Intake TMD Multimedia`, **App Status: LIVE**, visible en el directorio, instalable |
| Permiso de Linear desde Apps Script | ✅ | `probarConexionLinear` → `Labels del equipo: 100`, `Responsables encontrados: 5 de 5` |
| **Entrega de eventos de Chat** | ❌ **BLOQUEADO** | Al escribir `/video`: *"Intake TMD Multimedia not responding"*. **No aparece ninguna ejecución de `onMessage`** |

**El problema en una frase:** Google Chat no está entregando el evento `MESSAGE` al script.
No es el código — está probado y funciona.

---

## 3. Infraestructura y identificadores

```
Linear
  workspace:  alegra
  team:       TMDCTMD  →  id 8f7a60e7-27d8-47da-b315-6b8d03f91a15
  estado inicial: "Todo"

Google Cloud
  proyecto:   gchat-growth-content
  número:     788075478040
  (creado por IT; el usuario es Owner)

Apps Script
  proyecto:   "Intake TMD Multimedia"
  scriptId:   1vDZYuO09NZ7yQ0eOg7nEP2_FX02-SBs9mKRPANdhbkPB5aCQkFfZmQb5
  vinculado al proyecto GCP 788075478040 (verificado: "Project Number 788075478040")

Google Chat API
  servicio:   chat.googleapis.com → Enabled
  app:        Intake TMD Multimedia
  conexión:   Apps Script + Deployment ID (AKfycb…)
  visibilidad: fernando.rodriguez@alegra.com

Deployments de Apps Script
  - Head (Test deployments)
  - "Untitled" — Version 2 — tipo Add-on (para Chat)
  - "v1 - prueba interna" — Version 1 — archivada
  - Version 3 — tipo Web app (el formulario por enlace)

Web app (formulario por enlace, FUNCIONA)
  https://script.google.com/a/macros/alegra.com/s/AKfycbza2SbVt2ezXjgBxNZYP1BCwYKWEwJVugl1Aq3S89WPbRmNhH63ibVGT5a89Emp0Nnr/exec

Repositorio
  https://github.com/fernandorodriguez-dev/socialmedia-alegra
  local: ~/socialmedia-alegra/

Wiki
  Bot:      https://wiki.alegra.com/doc/bot-de-intake-en-google-chat-video-l3reg5FjPm
  Playbook: https://wiki.alegra.com/doc/tmd-content-multimedia-GMjqP9WGtt
```

La `LINEAR_API_KEY` **no está en el repositorio**. Vive en dos sitios:
- `~/.secrets/alegra.env` (archivo maestro local, permisos 600)
- Propiedades del script en Apps Script (`LINEAR_API_KEY`)

---

## 4. Archivos

```
intake-chat/
  Code.gs                  pegamento con Chat: onMessage, alTocarBoton, _apiKey,
                           _transporteUrlFetch, guardar/leer estado, probarConexionLinear
  core/config.js           BOT_CONFIG: reglas de asignación, países, canales, loops, formatos
  core/flow.js             máquina de conversación + parser de texto libre
  core/linear-sync.js      cliente de Linear SÍNCRONO (Apps Script no soporta async/await)
  libreria.gs              GENERADO: concatena los 3 core. Exporta BOT_CONFIG, IntakeFlow, IntakeLinear
  scripts/build-libreria.js  regenera libreria.gs y normaliza cómo se declaran los módulos
  test/simulate.js         corre la conversación completa contra Linear real y archiva lo creado

intake-web/                plan B: formulario publicado como Web App (funciona hoy)
  Webapp.gs                doGet + crearIssue(payload)
  Index.html               formulario completo, usa google.script.run
```

**Para cambiar una regla de asignación:** editar `core/config.js` → `node scripts/build-libreria.js`
→ volver a pegar `libreria.gs` en Apps Script.

---

## 5. Reglas de asignación

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

⚠️ **Contradicción resuelta:** el playbook de la wiki decía que CRI YouTube era de Darwing.
Por indicación del SH (Fernando), CRI y DOM completos son de Katherine. **La wiki ya se corrigió.**

---

## 6. Comportamiento del bot

- `/video` sin texto → wizard pregunta paso a paso (15 preguntas).
- `/video <descripción>` → **parser** adivina país, canal, formato, duración, cantidad, loops,
  ICP y fecha desde texto libre; pregunta solo lo que falta (título, objetivo, contexto,
  aprobador, links).
  Ejemplo: `/video reel colombia 30s brand pyme` → entiende `COL · Social Media · Reel 9:16 ·
  30s · Loop - Brand · ICP Pyme` y arranca preguntando el título.
- Quien escribe queda **identificado automáticamente** (`event.user.email`), mencionado y suscrito.
  No hay que escribir el correo.
- Comandos: `/atras`, `/cancelar`, `/todas`.
- Canal **Paid** genera 2 sub-issues: Guión (vence 4 días antes) y Grabación (2 días antes).
- Idempotente: reenviar no duplica (marcador `<!-- intake:v2.0:<llave> -->` en la descripción).

---

## 7. Trampas que costaron horas (no repetirlas)

1. **Apps Script evalúa los archivos en orden alfabético.** `Code.gs` va antes que `libreria.gs`.
   Cualquier código de nivel superior en `Code.gs` que use `IntakeFlow`/`IntakeLinear` falla.
   → La conexión del transporte se hace **dentro de cada función**, nunca al cargar el archivo.

2. **Las librerías deben declararse `var Nombre = (function(){…})();`** a nivel de archivo.
   Ni `this` ni `globalThis` funcionan en Apps Script. En Node sí sirve `module.exports`,
   por eso el patrón lleva las dos salidas.

3. **Deployment ID ≠ Script ID.** Ambos son códigos largos y se confunden:
   - Script ID: `1vDZY…` (identifica el proyecto)
   - Deployment ID: `AKfycb…` (identifica la versión publicada; es lo que Chat necesita)

4. **`onMessage` es el nombre que Chat invoca por defecto.** Se agregó un alias que llama a
   `alRecibirMensaje`. Sin eso, el mensaje llega y se pierde en silencio.

5. **Menciones de Linear:** se usa la **URL del perfil** (`https://linear.app/alegra/profiles/fer-sm`),
   no `@nombre`. El slug del perfil **no es el correo**.

6. **Los labels son por equipo.** `Social Media`, `YouTube`, `Academy`, `Paid`, `Empresa`,
   `Contador`, `Pyme` existen en 20-30 equipos distintos. Hay que resolver **solo dentro de
   TMDCTMD** o se aplica el label de otro equipo.

7. **Tipos de variable en GraphQL:** `team(id: $t)` pide `String!`;
   `issues(filter:{team:{id:{eq:$t}}})` pide `ID!`. Mezclarlos da HTTP 400.

8. **Un label no se puede anidar en un grupo heredado del workspace** (por eso `All ICPs`,
   creado por nosotros, quedó suelto y no dentro de *ICPs*).

9. **Una app de Chat LIVE no sirve hasta que el usuario la instala.** La consola no avisa.
   Esto se descubrió después de mucho tiempo: el bot estaba "LIVE y visible" pero nunca
   instalado en la cuenta. Una vez instalado, el síntoma cambió de "silencio total" a
   *"not responding"* — o sea, la instalación era un problema real y quedó resuelto.

---

## 8. Hipótesis que quedan para el "not responding"

En orden de probabilidad. **Ninguna requiere tocar el código.**

1. **La implementación registrada en Chat API no es la que tiene `onMessage`.**
   Hay varias implementaciones (Head, Add-on "Version 2", Web app "Version 3"). Si en
   *Connection settings* quedó el ID de la Web app, Chat no encuentra el handler.
   → Verificar que el Deployment ID sea el de una implementación tipo **Add-on**.

2. **Después de cambiar el Deployment ID hay que re-instalar la app.** Chat cachea la
   configuración de cuando se instaló. → Desinstalar y volver a instalar la app desde el
   directorio de Chat.

3. **Los scopes del manifiesto pueden ser insuficientes.** `appsscript.json` declara:
   ```json
   "oauthScopes": [
     "https://www.googleapis.com/auth/chat.messages",
     "https://www.googleapis.com/auth/script.external_request"
   ]
   ```
   Revisar si para recibir eventos hace falta otro scope (`chat.bot` u otro). Si se cambia,
   hay que volver a autorizar.

4. **Aprobación de scopes por el administrador.** Víctor (IT, autor del proyecto GCP) dijo:
   *"cuando ya funcione y lo quieras para todo el equipo, pedímelo en el ticket y apruebo los
   permisos (scopes) de la app"*. Es posible que la aprobación sea requisito incluso para el
   propietario.

5. **Cloud Logging no mostró nada** al enviar `/video` — ni error ni intento de entrega.
   Eso apunta fuerte a (1) o (2).

---

## 9. Próximos pasos sugeridos

1. **Verificar el Deployment ID**: en *Chat API → Configuration → Connection settings*, que el
   ID corresponda a una implementación **Add-on** recién creada (que incluya `onMessage`).
   Crear una nueva: *Deploy → New deployment → Add-on → Deploy*.
2. **Desinstalar y reinstalar la app** en Chat.
3. **Revisar Cloud Logging** del proyecto `gchat-growth-content` filtrando por
   `chat.googleapis.com`. Es el único sitio donde aparece el motivo real de la no entrega.
4. Si todo lo anterior está bien: escalar a IT con el detalle del punto 8.

---

## 10. Cómo probar sin tocar Google

```bash
cd ~/socialmedia-alegra/intake-chat
node test/simulate.js
```

Corre la conversación completa contra **Linear real**, verifica el issue creado (responsable,
labels, estado, mención, sub-issues) y lo archiva al terminar. No deja basura.

Requiere `LINEAR_API_KEY` en `~/.secrets/alegra.env`.

---

## 11. Nota sobre la llave de Linear

La `LINEAR_API_KEY` quedó visible en una captura de pantalla durante la sesión de depuración
(panel *Script Properties* de Apps Script). **Conviene rotarla**: generar una nueva en Linear,
reemplazarla en `~/.secrets/alegra.env` y en las propiedades del script de Apps Script.
