# Intake desde Google Chat

Un bot para pedir piezas de video sin salir de Google Chat. Escribes **`/video`**,
el bot pregunta dato por dato, y al final crea el issue en Linear con responsable,
labels, fecha y tu mención.

No necesita servidor, ni hosting, ni cuenta nueva: vive dentro de Google, en
Apps Script, y la llave de Linear se guarda en la configuración de Google.

## Cómo se ve

```
Tú:  /video
Bot: ¿Cómo se llama la pieza?
Tú:  Reel MCP launch — Colombia v1
Bot: ¿Qué debe lograr esta pieza?
...
Bot: Revisa y confirma
     • Versión: COL · Canal: Social Media
     • Se asigna a: Darwing López (COL/MEX · Reels)
     [Crear en Linear]  [Cancelar]
```

Al confirmar, el bot responde en la sala con el número del issue, el enlace y a
quién le quedó. La persona queda mencionada y suscrita: le llegan las respuestas
del editor.

Comandos durante la conversación: `/atras` para volver, `/cancelar` para salir,
`/todas` para ver todas las opciones de una pregunta.

## Estructura

| Archivo | Qué hace |
|---|---|
| `Code.gs` | Habla con Google Chat: recibe, responde, guarda el avance |
| `core/config.js` | Reglas de asignación, países, canales, loops, formatos |
| `core/flow.js` | La conversación: preguntas, validaciones, resumen |
| `core/linear-sync.js` | Crea el issue en Linear (síncrono, como exige Apps Script) |
| `test/simulate.js` | Simula la conversación entera contra Linear real |

## Probar antes de instalar

```bash
node test/simulate.js
```

Crea issues de verdad en Linear, verifica que quedaron bien (responsable, labels,
estado, mención) y los archiva al terminar. También comprueba que la configuración
del bot no se haya desincronizado del formulario web.

## Instalación

### 1. Crear el proyecto

1. Entra a https://script.google.com y pulsa **Nuevo proyecto**.
2. Ponle nombre: `Intake TMD`.
3. Borra el contenido de `Código.gs` y pega el de `Code.gs`.
4. Pulsa **+** al lado de *Archivos* → **Secuencia de comandos**, nombra el archivo
   `libreria` y pega el contenido de `libreria.gs`. Ese archivo ya trae las tres
   librerías juntas (`config`, `flow`, `linear-sync`) para no pegar tres veces.
   Se regenera con `node scripts/build-libreria.js`.

### 2. Cargar el manifiesto

1. **Configuración del proyecto** (el engranaje) → marca
   *Mostrar el archivo de manifiesto "appsscript.json"*.
2. Vuelve al editor, abre `appsscript.json` y reemplaza todo por el contenido
   de `appsscript.json` de esta carpeta.

### 3. Guardar la llave de Linear

1. **Configuración del proyecto** → **Propiedades de la secuencia de comandos**
   → **Añadir propiedad**.
2. Nombre: `LINEAR_API_KEY`. Valor: la llave de Linear.
3. Guardar.

La llave queda en los servidores de Google, nadie del equipo la ve y no toca el
repositorio.

### 4. Comprobar que conecta

En el editor elige la función `probarConexionLinear` y pulsa **Ejecutar**.
La primera vez Google pide permisos: acéptalos. En el registro tiene que decir:

```
Labels del equipo: 99
Estados: ...
Responsables encontrados: 5 de 5
```

Si dice menos de 5, alguien cambió de correo y hay que ajustar `core/config.js`.

### 5. Publicar el bot en Chat

Aquí cambia según la versión de la consola de Google, así que conviene hacerlo
acompañado: mándame una captura de la pantalla **Implementar → Nueva implementación**
y te digo exactamente dónde hacer clic. En corto son tres cosas:
dar de alta la app en Google Chat, apuntarla a esta implementación y agregarla a
la sala de Content Multimedia.

## Mantenimiento

- **Cambiar quién edita qué**: `core/config.js`, arreglo `assigneeRules`.
  El test verifica que siga coincidiendo con el formulario web.
- **Agregar un país o canal**: las listas `versiones` y `canales`.
- **Cambiar una pregunta**: `core/flow.js`, arreglo de pasos.

Después de cualquier cambio, corre `node test/simulate.js` antes de republicar.

## Lo que ya está verificado

Contra Linear real:

- Conversación completa de 15 preguntas hasta el issue creado.
- Asignación correcta en los cuatro casos: COL YouTube, MEX YouTube, Reels, CRI/DOM.
- Canal Paid crea los dos sub-issues, con el guión venciendo antes que la grabación.
- Reenviar el mismo formulario no duplica el issue.
- Rechaza fechas pasadas, links sin `https://` y Loop Product sin pantallas.
- `/video` arranca; "video de ayer" no.
