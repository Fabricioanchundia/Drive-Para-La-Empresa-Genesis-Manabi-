# 📁 Drive App — Plataforma de Gestión de Archivos Empresarial

> Solución completa de almacenamiento, organización y colaboración de archivos en la nube, construida con Angular 21, Supabase y OnlyOffice.

---

## Tabla de Contenido

1. [Descripción General](#1-descripción-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Requisitos Previos](#4-requisitos-previos)
5. [Cómo Levantar el Proyecto](#5-cómo-levantar-el-proyecto)
   - [Lanzador maestro](#opción-a--lanzador-maestro-recomendado)
   - [El tema de la IP](#el-tema-de-la-ip--cómo-funciona-y-qué-pasa-cuando-cambia)
   - [Docker + OnlyOffice primera vez](#docker--onlyoffice--primera-vez)
6. [Módulos y Funcionalidades](#6-módulos-y-funcionalidades)
7. [Roles y Permisos](#7-roles-y-permisos)
8. [Servicios del Backend](#8-servicios-del-backend)
9. [Base de Datos — Tablas Supabase](#9-base-de-datos--tablas-supabase)
10. [Variables de Configuración](#10-variables-de-configuración)
11. [Rutas de la Aplicación](#11-rutas-de-la-aplicación)
12. [Flujo de Compartición de Archivos y Carpetas](#12-flujo-de-compartición-de-archivos-y-carpetas)
13. [Edición Colaborativa con OnlyOffice](#13-edición-colaborativa-con-onlyoffice)
14. [Tecnologías Utilizadas](#14-tecnologías-utilizadas)

---

## 1. Descripción General

**Drive App** es una plataforma web de gestión de archivos empresarial que permite a los usuarios almacenar, organizar, compartir y editar documentos de forma colaborativa en tiempo real. Funciona de manera similar a Google Drive o OneDrive, pero con infraestructura propia y control total de los datos.

### Capacidades principales

| Capacidad | Descripción |
|---|---|
| 📤 Subida de archivos | Cualquier tipo: PDF, Word, Excel, PowerPoint, imágenes, videos |
| 📂 Organización en carpetas | Estructura jerárquica de carpetas con navegación de migas de pan |
| 🤝 Compartición con permisos | Compartir archivos y carpetas con permisos de **viewer** o **editor** |
| ✏️ Edición colaborativa | Edición en tiempo real de documentos Office con múltiples usuarios simultáneos |
| 🔗 Links públicos | Generación de links públicos protegidos por token para acceso sin login |
| 📥 Descarga con nombre original | Descarga correcta de cualquier tipo de archivo con su nombre original |
| 👤 Gestión de usuarios | Panel de administración completo con control de acceso por roles |
| 📊 Registro de sesiones | Historial de inicio de sesión de todos los usuarios |

---

## 2. Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Navegador)                       │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │              Angular 21 SPA (puerto 4200 HTTPS)          │   │
│   │                                                          │   │
│   │  [ Login / Register ]  [ Dashboard ]  [ File Manager ]  │   │
│   │  [ Admin Panel ]       [ File Editor (OnlyOffice) ]      │   │
│   └──────────────────────────────────────────────────────────┘   │
└──────────────┬─────────────────────────┬────────────────────────┘
               │                         │
               ▼                         ▼
┌──────────────────────┐    ┌────────────────────────────────────┐
│   Supabase (cloud)   │    │   Servicios locales (misma máquina)│
│                      │    │                                    │
│  • Auth (JWT)        │    │  ┌─────────────────────────────┐   │
│  • PostgreSQL DB     │    │  │  OnlyOffice Document Server  │   │
│  • Storage (Bucket)  │    │  │  Docker  ·  Puerto 8080      │   │
│  • RLS Policies      │    │  └─────────────────────────────┘   │
└──────────────────────┘    │                                    │
                            │  ┌─────────────────────────────┐   │
┌──────────────────────┐    │  │  Callback Server (Node.js)   │   │
│  Cloudinary (cloud)  │    │  │  Express  ·  Puerto 3001     │   │
│                      │    │  │  Guarda cambios → Supabase   │   │
│  • Almacenamiento    │    │  └─────────────────────────────┘   │
│    de archivos CDN   │    └────────────────────────────────────┘
│  • URLs públicas     │
└──────────────────────┘
```

### Flujo de datos

```
Usuario sube archivo → Angular → Cloudinary (almacena binario)
                                        ↓
                             URL pública de Cloudinary
                                        ↓
                         Supabase DB guarda metadatos
                         (nombre, tipo, tamaño, url, dueño)

Usuario edita documento → Angular abre OnlyOffice (iframe)
                               ↓
                   OnlyOffice notifica cambio → Callback Server :3001
                               ↓
                   Callback Server descarga el archivo modificado
                               ↓
                   Sube nueva versión → Supabase Storage
```

---

## 3. Estructura del Proyecto

```
Proyecto-Drive/
│
├── README.md                          ← Este archivo
├── START-DRIVE.bat                    ← ⭐ LANZADOR MAESTRO (doble clic aquí)
│
├── drive-app/                         ← Aplicación Angular (frontend)
│   ├── start.bat                      ← Script de inicio (Windows)
│   ├── start.ps1                      ← Script PowerShell (levanta todo)
│   ├── mkcert.exe                     ← Generador de certificados SSL locales
│   ├── proxy.conf.json                ← Proxy hacia OnlyOffice y Callback
│   ├── angular.json                   ← Configuración del workspace Angular
│   ├── tsconfig.json                  ← Configuración TypeScript
│   │
│   └── src/app/
│       ├── auth/                      ← Módulo de autenticación
│       │   ├── login/                 ← Pantalla de inicio de sesión
│       │   ├── register/              ← Pantalla de registro
│       │   └── auth.guard.ts          ← Guard de rutas privadas
│       │
│       ├── dashboard/                 ← Dashboard del usuario (rol user)
│       │
│       ├── admin/                     ← Panel de administración (rol admin)
│       │   ├── admin-panel/           ← Vista principal del admin
│       │   ├── user-list/             ← Gestión de usuarios
│       │   ├── session-log/           ← Historial de sesiones
│       │   └── debug-cookies/         ← Herramienta de diagnóstico
│       │
│       ├── files/                     ← Módulo de gestión de archivos
│       │   ├── file-list/             ← Listado de archivos y carpetas
│       │   ├── file-section/          ← Acciones sobre archivos (subir, eliminar, compartir)
│       │   ├── folder-section/        ← Acciones sobre carpetas
│       │   ├── file-editor/           ← Editor OnlyOffice integrado
│       │   ├── collaborative-editor/  ← Editor colaborativo de texto plano
│       │   └── file-share/            ← Vista pública de archivo compartido
│       │
│       ├── features/public/           ← Vistas públicas (sin login)
│       │   ├── public-file.component  ← Ver archivo por link público
│       │   └── public-folder.component← Ver carpeta pública con descarga ZIP
│       │
│       └── shared/
│           ├── models/model.ts        ← Interfaces: User, DriveFile, Folder, etc.
│           ├── components/            ← Spinner global compartido
│           └── Permission/services/   ← Todos los servicios de la app
│               ├── auth.service.ts
│               ├── file.service.ts
│               ├── folder.service.ts
│               ├── share.service.ts
│               ├── cloudinary.service.ts
│               ├── supabase.service.ts
│               ├── email.service.ts
│               ├── session.service.ts
│               ├── user.service.ts
│               └── collaborative-edit.service.ts
│
└── onlyoffice-callback/               ← Servidor Node.js (backend ligero)
    ├── server.js                      ← Express API: callback + carpetas públicas
    └── package.json
```

---

## 4. Requisitos Previos

Antes de levantar el proyecto por **primera vez**, asegurarse de tener instalado:

| Herramienta | Versión mínima | Para qué se usa |
|---|---|---|
| **Node.js** | 18 LTS o superior | Angular CLI + Callback Server |
| **npm** | 9+ | Gestión de dependencias |
| **Docker Desktop** | Cualquier versión reciente | Ejecutar OnlyOffice Document Server |
| **mkcert** | Incluido en `drive-app/mkcert.exe` | Certificado SSL local (HTTPS requerido por OnlyOffice) |

> ✅ Las dependencias de Node.js (`node_modules`) y el contenedor Docker de OnlyOffice se crean **solos la primera vez** que ejecutas el script. No hay que instalar nada manualmente.

### Registrar mkcert como CA de confianza (solo una vez por máquina)

Esto es lo único que se tiene que hacer a mano, **una sola vez**, para que el navegador confíe en el certificado HTTPS:

```bat
cd drive-app
.\mkcert.exe -install
```

> Después de esto ya no se vuelve a tocar. El script genera y reutiliza los certificados automáticamente.

---

## 5. Cómo Levantar el Proyecto

### Opción A — Lanzador maestro (recomendado)

Desde la **raíz del proyecto** (`Proyecto-Drive/`), hacer doble clic en:

```
START-DRIVE.bat
```

Eso es todo. El script se encarga de todo lo demás.

---

### Opción B — Desde la carpeta drive-app

```bat
cd drive-app
start.bat
```

---

### ¿Qué hace el script automáticamente?

Cada vez que se ejecuta, el script pasa por estos pasos en orden:

```
[00:00] Detecta la IP local de la red  →  ej: 192.168.1.50
[00:01] Certificado SSL ──────────────────────────────────
        ¿Cambió la IP desde el último arranque?
          SÍ → genera nuevo certificado con mkcert  (~3s)
          NO → reutiliza el certificado existente   (instantáneo)
[00:02] Dependencias Node.js ─────────────────────────────
        ¿Existe node_modules en drive-app?
          NO → npm install (primera vez, ~30s)
          SÍ → omite (instantáneo)
        ¿Existe node_modules en onlyoffice-callback?
          NO → npm install (primera vez, ~10s)
          SÍ → omite (instantáneo)
[00:03] Docker + OnlyOffice ──────────────────────────────
        ¿Puerto 8080 responde?
          SÍ → ya está corriendo, continúa
          NO → ¿existe el contenedor onlyoffice-ds?
                 SÍ → docker start onlyoffice-ds
                 NO → docker run ... (descarga imagen la primera vez)
               Espera inteligente hasta que responda (max 90s)
[00:05] Callback Server ──────────────────────────────────
        ¿Puerto 3001 responde?
          SÍ → ya está corriendo, continúa
          NO → abre ventana nueva con: node server.js
[00:06] Angular ──────────────────────────────────────────
        ng serve --host 0.0.0.0 --ssl ... → https://<IP>:4200
```

---

### El tema de la IP — cómo funciona y qué pasa cuando cambia

La IP **se detecta sola** cada vez que se inicia el proyecto. No hay ningún archivo de configuración que editar.

```
PC en red WiFi de la empresa  →  IP: 192.168.1.50  →  App en https://192.168.1.50:4200
                                          ↓
   La empresa cambia el router o reasigna IPs
                                          ↓
              Se vuelve a ejecutar START-DRIVE.bat
                                          ↓
         Script detecta la nueva IP automáticamente: 192.168.2.80
         Regenera el certificado SSL para esa nueva IP
         Levanta todo igual → App en https://192.168.2.80:4200
```

> No hay que tocar ningún archivo. Simplemente volver a ejecutar `START-DRIVE.bat` y la nueva IP funciona sola.

#### ¿Qué pasa con `--host 0.0.0.0`?

`0.0.0.0` **no duplica** la aplicación ni el servidor. Significa *"escucha en todas las interfaces de red de esta máquina al mismo tiempo"*. Es **un solo proceso Angular** que responde desde:

| Accede desde | URL |
|---|---|
| La misma máquina | `https://localhost:4200` |
| La misma máquina | `https://127.0.0.1:4200` |
| Otra PC en la red | `https://192.168.X.X:4200` |

Sin consumo extra de memoria. Sin lentitud adicional. Un proceso, tres formas de entrar.

#### Forzar una IP manualmente

Útil cuando hay VPN activa, múltiples tarjetas de red, o se quiere usar una IP fija específica:

```bat
START-DRIVE.bat 192.168.1.100
REM  o desde drive-app:
start.bat 192.168.1.100
```

---

### URLs de acceso

Una vez levantado, la aplicación es accesible desde cualquier dispositivo en la misma red:

| Servicio | URL |
|---|---|
| **Aplicación web (red)** | `https://<IP detectada>:4200` |
| **Aplicación web (local)** | `https://localhost:4200` |
| **OnlyOffice Server** | `http://<IP>:8080` |
| **Callback Server** | `http://<IP>:3001` |
| **Health check** | `http://<IP>:3001/health` |

---

### Docker + OnlyOffice — primera vez

Si Docker no está instalado, el script lo detecta y muestra las instrucciones:

```
  [!] Docker no esta instalado o no esta corriendo.
  Instala Docker Desktop: https://www.docker.com/products/docker-desktop/
  Luego ejecuta UNA SOLA VEZ:
    docker run -d --name onlyoffice-ds -p 8080:80 --restart=unless-stopped onlyoffice/documentserver
```

Si Docker **ya está instalado** pero el contenedor no existe, el script ejecuta ese `docker run` automáticamente la primera vez. En arranques siguientes solo hace `docker start`.

---

## 6. Módulos y Funcionalidades

### 6.1 Autenticación (`/login`, `/register`)

- Registro e inicio de sesión con **email y contraseña** mediante Supabase Auth
- Generación automática de perfil de usuario en tabla `users` al registrarse
- Registro de cada inicio de sesión en tabla `session_logs`
- Redirección automática según rol:
  - `admin` → `/admin`
  - `user` → `/dashboard`

### 6.2 Dashboard (`/dashboard`) — rol usuario

Vista principal del usuario con acceso rápido a:

- **Mis archivos recientes** — archivos propios con acciones rápidas
- **Compartido conmigo** — archivos y carpetas que otros usuarios compartieron
- **Gestión de cuenta** — menú hamburguesa con navegación y cierre de sesión

### 6.3 Gestor de Archivos (`/files`) — roles admin y usuario

Vista completa del sistema de archivos personal:

- **Navegación por carpetas** con barra de migas de pan (breadcrumb)
- **Subida de archivos** con drag-and-drop y selector de carpeta destino
- **Creación / eliminación de carpetas**
- **Previsualización** de imágenes y PDFs en el navegador
- **Descarga** de cualquier tipo de archivo con su nombre original correcto
- **Compartición** por email con selección de permiso (viewer / editor)
- **Link público** con token único y opción de activar/desactivar
- **Acceso a carpetas compartidas** mediante parámetro `?folder=<id>`

### 6.4 Editor de Documentos (`/edit/:fileId`)

- Edición de documentos Word (`.docx`), Excel (`.xlsx`) y PowerPoint (`.pptx`) directamente en el navegador
- Motor de renderizado: **OnlyOffice Document Server**
- **Colaboración en tiempo real**: dos o más usuarios pueden editar el mismo documento simultáneamente
- Guardado automático (autosave) y guardado forzado (forcesave)
- Cambios sincronizados a Supabase Storage vía Callback Server

### 6.5 Panel de Administración (`/admin`) — solo rol admin

Vista de control total del sistema:

- Resumen de actividad: usuarios activos, archivos totales, espacio utilizado
- **Compartido conmigo**: archivos y carpetas que usuarios compartieron con el admin
- Navegación rápida a usuarios, sesiones y archivos

### 6.6 Gestión de Usuarios (`/admin/users`) — solo rol admin

- Lista completa de usuarios registrados
- Activar / desactivar cuentas de usuario
- Cambiar rol (admin / user)
- Ver fecha de creación y estado actual

### 6.7 Registro de Sesiones (`/admin/sessions`) — solo rol admin

- Historial cronológico de todos los inicios de sesión
- Información: usuario, email, fecha y hora exacta, IP (si disponible)

### 6.8 Vistas Públicas (sin autenticación)

| Ruta | Descripción |
|---|---|
| `/share/:id` | Ver y descargar un archivo compartido por link |
| `/public/:token` | Vista pública de archivo con token único |
| `/public-folder/:token` | Vista de carpeta pública con listado de archivos y descarga ZIP |

---

## 7. Roles y Permisos

| Permiso | `user` | `admin` |
|---|:---:|:---:|
| Registrarse / iniciar sesión | ✅ | ✅ |
| Ver y gestionar sus propios archivos | ✅ | ✅ |
| Compartir archivos y carpetas | ✅ | ✅ |
| Editar documentos colaborativamente | ✅ | ✅ |
| Ver archivos/carpetas compartidos con él | ✅ | ✅ |
| Acceder al panel de administración | ❌ | ✅ |
| Ver y gestionar todos los usuarios | ❌ | ✅ |
| Ver registro de sesiones | ❌ | ✅ |
| Activar/desactivar cuentas | ❌ | ✅ |

### Permisos de compartición

Cuando un usuario comparte un archivo o carpeta, debe seleccionar un nivel de acceso:

| Nivel | Puede ver | Puede descargar | Puede editar |
|---|:---:|:---:|:---:|
| **viewer** | ✅ | ✅ | ❌ |
| **editor** | ✅ | ✅ | ✅ |

---

## 8. Servicios del Backend

Todos los servicios viven en `drive-app/src/app/shared/Permission/services/`.

| Servicio | Responsabilidad |
|---|---|
| `supabase.service.ts` | Instancia del cliente Supabase; provee el cliente autenticado a toda la app |
| `auth.service.ts` | Login, logout, registro, observador de estado de sesión, redirección por rol |
| `file.service.ts` | CRUD de archivos: subir, listar, renombrar, eliminar, mover entre carpetas |
| `folder.service.ts` | CRUD de carpetas; `getSharedFolders()` para carpetas compartidas |
| `share.service.ts` | `shareByEmail()` y `shareFolderByEmail()`: guardan permisos en tabla `permissions` |
| `cloudinary.service.ts` | Subida de binarios a Cloudinary; obtención de URL pública |
| `email.service.ts` | Envío de notificaciones por email (EmailJS) al compartir archivos/carpetas |
| `session.service.ts` | Registro de inicios de sesión en tabla `session_logs` |
| `user.service.ts` | Listado y actualización de usuarios; activar/desactivar, cambiar rol |
| `collaborative-edit.service.ts` | Canal Supabase Realtime para presencia de editores activos en un documento |

### Callback Server (`onlyoffice-callback/server.js`)

Servidor Express independiente que actúa como intermediario entre OnlyOffice y Supabase:

| Endpoint | Método | Descripción |
|---|---|---|
| `POST /callback` | POST | OnlyOffice notifica que el usuario guardó; el server descarga el archivo y lo sube a Supabase Storage |
| `GET /public-folder/:token` | GET | Devuelve metadatos de carpeta pública + listado de archivos (bypasa RLS con service key) |
| `GET /public-folder/:token/zip` | GET | Genera y descarga un archivo ZIP con todos los archivos de la carpeta pública |
| `GET /health` | GET | Verificación de estado del servidor |

---

## 9. Base de Datos — Tablas Supabase

### `users`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | ID del usuario (= Supabase Auth UID) |
| `email` | text | Correo electrónico |
| `display_name` | text | Nombre para mostrar |
| `role` | text | `'admin'` o `'user'` |
| `active` | boolean | Si la cuenta está habilitada |
| `created_at` | timestamp | Fecha de creación |

### `files`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | ID del archivo |
| `name` | text | Nombre original del archivo |
| `type` | text | MIME type (`application/pdf`, `image/png`, etc.) |
| `size` | bigint | Tamaño en bytes |
| `url` | text | URL pública del archivo en Cloudinary/Storage |
| `storage_path` | text | Ruta en Supabase Storage para sobreescritura |
| `folder_id` | uuid (FK) | Carpeta contenedora (null = raíz) |
| `owner_id` | uuid (FK) | Usuario dueño |
| `public_link_active` | boolean | Si el link público está activo |
| `public_id` | text | Token único para link público |
| `created_at` | timestamp | Fecha de subida |
| `updated_at` | timestamp | Última modificación |

### `folders`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | ID de la carpeta |
| `name` | text | Nombre de la carpeta |
| `parent_id` | uuid (FK) | Carpeta padre (null = raíz) |
| `owner_id` | uuid (FK) | Usuario dueño |
| `public_link_active` | boolean | Si el link público está activo |
| `public_id` | text | Token único para link público de carpeta |
| `created_at` | timestamp | Fecha de creación |

### `permissions`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | ID del permiso |
| `resource_type` | text | `'file'` o `'folder'` |
| `resource_id` | uuid | ID del archivo o carpeta compartido |
| `user_id` | uuid (FK) | Usuario que recibe el acceso |
| `permission` | text | `'viewer'` o `'editor'` |
| `created_at` | timestamp | Fecha de compartición |

### `session_logs`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | ID del registro |
| `uid` | uuid (FK) | ID del usuario |
| `email` | text | Email del usuario |
| `display_name` | text | Nombre del usuario |
| `login_at` | timestamp | Fecha y hora del inicio de sesión |

### `share_links`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | ID del link |
| `file_id` | uuid (FK) | Archivo compartido |
| `file_name` | text | Nombre del archivo |
| `file_url` | text | URL del archivo |
| `created_by` | uuid (FK) | Usuario que generó el link |
| `expires_at` | timestamp | Expiración opcional |
| `active` | boolean | Si el link sigue activo |
| `access_count` | int | Contador de accesos |

---

## 10. Variables de Configuración

### Frontend — `drive-app/src/environments/environment.ts`

```typescript
export const environment = {
  production: false,

  // URL pública de la app (vacío = usa location.origin automáticamente)
  frontendUrl: '',

  // Supabase: credenciales del proyecto
  supabase: {
    url: 'https://<proyecto>.supabase.co',
    key: '<anon-public-key>'
  }
};
```

> ℹ️ La IP del servidor se detecta automáticamente en tiempo de ejecución con `location.hostname`. No se necesita configurar manualmente para desarrollo local.

### Backend — `onlyoffice-callback/server.js`

Las credenciales están definidas como constantes al inicio del archivo:

```javascript
const SUPABASE_URL          = 'https://<proyecto>.supabase.co';
const SUPABASE_KEY          = '<anon-public-key>';
const SUPABASE_SERVICE_KEY  = '<service-role-key>';   // Bypasa RLS
const BUCKET                = 'drive-files';
const PORT                  = process.env.PORT || 3001;
```

> ⚠️ La `SUPABASE_SERVICE_KEY` es una clave con privilegios totales que bypasa las políticas RLS. No debe exponerse en el frontend ni en repositorios públicos.

---

## 11. Rutas de la Aplicación

| Ruta | Componente | Acceso |
|---|---|---|
| `/` | — | Redirect → `/login` |
| `/login` | `LoginComponent` | Público |
| `/register` | `RegisterComponent` | Público |
| `/share/:id` | `FileShareComponent` | Público |
| `/public/:token` | `PublicFileComponent` | Público |
| `/public-folder/:token` | `PublicFolderComponent` | Público |
| `/dashboard` | `DashboardComponent` | Autenticado |
| `/files` | `FileListComponent` | Autenticado |
| `/edit/:fileId` | `FileEditorComponent` | Autenticado |
| `/admin` | `AdminPanelComponent` | Solo admin |
| `/admin/users` | `UserListComponent` | Solo admin |
| `/admin/sessions` | `SessionLogComponent` | Solo admin |

---

## 12. Flujo de Compartición de Archivos y Carpetas

```
Usuario A quiere compartir una carpeta con Usuario B
│
├─ Abre el modal de compartir en folder-section
├─ Selecciona permiso: "viewer" o "editor"
├─ Ingresa el email de Usuario B
│
├─ [Frontend] share.service.ts → shareFolderByEmail()
│   ├─ Busca el UID de Usuario B en tabla `users` por email
│   └─ Hace UPSERT en tabla `permissions`:
│       resource_type = 'folder'
│       resource_id   = <id de la carpeta>
│       user_id       = <uid de Usuario B>
│       permission    = 'viewer' | 'editor'
│
└─ [Frontend] email.service.ts → sendFolderEmail()
    └─ Envía notificación por email a Usuario B con link directo

Usuario B inicia sesión
│
└─ folder.service.ts → getSharedFolders()
    ├─ Consulta: permissions WHERE resource_type='folder' AND user_id=UID_B
    └─ Trae las carpetas correspondientes
        └─ Se muestran en "Compartido conmigo" del Dashboard y Admin Panel
```

---

## 13. Edición Colaborativa con OnlyOffice

```
Usuario 1 hace clic en "Editar" en un archivo .docx
│
├─ FileEditorComponent se inicializa
├─ Obtiene el JWT de sesión de Supabase
├─ Detecta el hostname actual (ej: 192.168.1.50)
├─ Construye:
│   • onlyOfficeBase  = http://192.168.1.50:8080
│   • callbackUrl     = http://192.168.1.50:3001/callback?path=...&token=...
│
└─ Renderiza el iframe de OnlyOffice con la config del documento
    • key único basado en file.id + updatedAt
    • modo co-editing: "fast" (cambios instantáneos)

Usuario 2 abre el mismo archivo
│
└─ OnlyOffice detecta el mismo key → une al mismo documento en tiempo real
    • Ambos usuarios ven los cursores y cambios del otro al instante

Usuario guarda el documento
│
├─ OnlyOffice hace POST al callbackUrl con status=2 y url del documento editado
│
└─ Callback Server (server.js):
    ├─ Descarga el archivo modificado desde la URL de OnlyOffice
    ├─ Sube el buffer a Supabase Storage en la ruta original (upsert)
    └─ Responde { error: 0 } para confirmar guardado exitoso
```

---

## 14. Tecnologías Utilizadas

### Frontend

| Tecnología | Versión | Uso |
|---|---|---|
| **Angular** | 21 | Framework principal SPA |
| **TypeScript** | 5.x | Lenguaje de programación |
| **Supabase JS** | 2.x | SDK para DB, Auth y Storage |
| **OnlyOffice API** | — | Edición de documentos en el navegador |
| **EmailJS** | 4.x | Envío de emails desde el frontend |
| **UUID** | 13.x | Generación de IDs únicos para tokens |

### Backend (Callback Server)

| Tecnología | Versión | Uso |
|---|---|---|
| **Node.js** | 18+ | Runtime del servidor |
| **Express** | 4.x | Framework HTTP |
| **Supabase JS** | 2.x | Acceso a Storage con service key |
| **JSZip** | 3.x | Generación de archivos ZIP on-demand |

### Infraestructura

| Servicio | Tipo | Uso |
|---|---|---|
| **Supabase** | Cloud (gratuito/pago) | Base de datos PostgreSQL + Auth + Storage |
| **Cloudinary** | Cloud (gratuito/pago) | CDN para almacenamiento y entrega de archivos |
| **OnlyOffice Document Server** | Docker (local) | Motor de edición de documentos Office |
| **mkcert** | Local | Certificados SSL para HTTPS en red local |

---

## Notas de Despliegue en Red Corporativa

1. **Firewall**: abrir los puertos **4200** (Angular), **8080** (OnlyOffice) y **3001** (Callback) en el firewall de Windows y en el router si se necesita acceso desde fuera de la red local.

2. **Certificado SSL**: el certificado generado por `mkcert` es válido únicamente en la máquina donde se ejecutó `mkcert -install`. En otras máquinas de la red, el navegador mostrará advertencia de certificado no confiable — se puede aceptar manualmente o instalar el CA de mkcert en cada equipo.

3. **IP fija del servidor**: se recomienda asignar una IP estática en el router para la máquina servidora, o usar el parámetro de IP manual:
   ```bat
   start.bat 192.168.X.X
   ```

4. **OnlyOffice**: el contenedor Docker debe estar creado previamente. Si se reinicia el servidor, `start.bat` lo reanuda automáticamente sin necesidad de recrearlo.

---

*Documentación generada para presentación técnica empresarial — Drive App v1.0*
