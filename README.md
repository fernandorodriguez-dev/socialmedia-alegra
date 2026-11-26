# socialmedia-alegra

Skills, playbooks y automatizaciones de IA para el equipo de Social Media de Alegra.

| Carpeta | Qué es |
|---|---|
| `intake-chat/` | Bot de Google Chat (`/video`) que crea las solicitudes de video en Linear |

## Bot de intake

En la sala del equipo, cualquiera escribe **`/video`**. El bot pregunta dato por dato
y al final crea el issue en Linear con responsable, labels, fecha y la persona mencionada.

No hay servidor, ni hosting, ni cuenta nueva: funciona dentro de Google, con Apps Script,
y la llave de Linear se guarda en la configuración de Google, nunca en este repositorio.

```
Tú:  /video
Bot: ¿Cómo se llama la pieza?
…
Bot: Revisa y confirma
     • Versión: COL · Canal: Social Media
     • Se asigna a: Darwing López (COL/MEX · Reels)
     [Crear en Linear]  [Cancelar]
```

### Reglas de asignación

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

Cambiar una regla es editar `intake-chat/core/config.js`. Nada más.

### Probar sin desplegar

```bash
cd intake-chat
node test/simulate.js
```

Corre la conversación completa contra Linear real, verifica que el issue quedó bien
y lo archiva al terminar.

### Instalar

Ver [`intake-chat/README.md`](intake-chat/README.md).

### Documentación

- Wiki: [Bot de intake en Google Chat](https://wiki.alegra.com/doc/bot-de-intake-en-google-chat-video-l3reg5FjPm)
- Playbook del equipo: [TMD Content Multimedia](https://wiki.alegra.com/doc/tmd-content-multimedia-GMjqP9WGtt)

## Convenciones

- Sin dependencias: Node 18+ para probar, Apps Script para correr.
- Los secretos nunca entran al repo (lo verifica `ci.yml` en cada push).
- La lógica de la conversación vive en `core/flow.js`, separada del código de Google,
  para poder probarla sin desplegar.
