const express = require('express');
const cors    = require('cors');
const https   = require('https');
const http    = require('http');
const { createClient } = require('@supabase/supabase-js');
const JSZip   = require('jszip');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_KEY         = process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET               = process.env.BUCKET || 'drive-files';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[ERROR] Faltan variables de entorno. Crea el archivo .env basandote en .env.example');
  process.exit(1);
}

// Cliente admin que bypasa RLS — usa service key
const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Descarga un archivo desde una URL y retorna su buffer.
 */
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const request = proto.get(url, (res) => {
      // Seguir redirecciones
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data',  c   => chunks.push(c));
      res.on('end',   ()  => resolve(Buffer.concat(chunks)));
      res.on('error', err => reject(err));
    });
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Timeout descargando archivo'));
    });
  });
}

// ─── GET /public-folder/:token ──────────────────────────────────────────────
// Devuelve la carpeta pública + sus archivos (sin RLS bloqueando)
app.get('/public-folder/:token', async (req, res) => {
  const { token } = req.params;
  try {
    // 1. Buscar carpeta por public_id
    const { data: folder, error: folderErr } = await supaAdmin
      .from('folders')
      .select('id, name, owner_id')
      .eq('public_id', token)
      .eq('public_link_active', true)
      .maybeSingle();

    if (folderErr || !folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada o link desactivado' });
    }

    // 2. Obtener archivos de esa carpeta (admin bypassa RLS)
    const { data: files, error: filesErr } = await supaAdmin
      .from('files')
      .select('id, name, size, type, url')
      .eq('folder_id', folder.id);

    if (filesErr) {
      console.error('[PublicFolder] Error archivos:', filesErr.message);
    }

    return res.json({ folder, files: files || [] });
  } catch (err) {
    console.error('[PublicFolder] Error general:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── GET /public-folder/:token/zip ─────────────────────────────────────────
// Descarga todos los archivos de la carpeta y los sirve como .zip
app.get('/public-folder/:token/zip', async (req, res) => {
  const { token } = req.params;
  try {
    // 1. Buscar carpeta
    const { data: folder, error: folderErr } = await supaAdmin
      .from('folders')
      .select('id, name, owner_id')
      .eq('public_id', token)
      .eq('public_link_active', true)
      .maybeSingle();

    if (folderErr || !folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada' });
    }

    // 2. Obtener archivos
    const { data: files } = await supaAdmin
      .from('files')
      .select('id, name, size, type, url')
      .eq('folder_id', folder.id);

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'La carpeta no tiene archivos' });
    }

    // 3. Crear ZIP
    const zip = new JSZip();
    console.log(`[ZIP] Descargando ${files.length} archivo(s) de "${folder.name}"...`);

    const downloads = files.map(async (file) => {
      try {
        const buffer = await downloadBuffer(file.url);
        zip.file(file.name, buffer);
        console.log(`[ZIP] ✅ ${file.name}`);
      } catch (err) {
        console.warn(`[ZIP] ⚠️  Falló ${file.name}: ${err.message}`);
      }
    });

    await Promise.all(downloads);

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const zipName = `${folder.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);

  } catch (err) {
    console.error('[ZIP] Error general:', err.message);
    return res.status(500).json({ error: 'Error al generar ZIP' });
  }
});

// ─── GET /folder-contents/:folderId ─────────────────────────────────────────
// Devuelve archivos y subcarpetas de una carpeta si el usuario tiene acceso.
app.get('/folder-contents/:folderId', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const jwt = authHeader.slice(7);
  const { folderId } = req.params;

  try {
    const { data: { user }, error: authError } = await supaAdmin.auth.getUser(jwt);
    if (authError || !user) return res.status(401).json({ error: 'Token inválido' });
    const uid = user.id;

    // Verificar que el usuario tiene acceso a esta carpeta
    const { data: folder } = await supaAdmin
      .from('folders')
      .select('id, name, owner_id, public_link_active')
      .eq('id', folderId)
      .maybeSingle();

    if (!folder) return res.status(404).json({ error: 'Carpeta no encontrada' });

    const isOwner   = folder.owner_id === uid;
    const isPublic  = folder.public_link_active === true;
    let hasAccess   = isOwner || isPublic;

    if (!hasAccess) {
      const { data: perm } = await supaAdmin
        .from('permissions')
        .select('id')
        .eq('resource_type', 'folder')
        .eq('resource_id', folderId)
        .eq('user_id', uid)
        .maybeSingle();
      hasAccess = !!perm;
    }

    if (!hasAccess) return res.status(403).json({ error: 'Sin permiso' });

    // Obtener archivos y subcarpetas en paralelo
    const [filesRes, foldersRes] = await Promise.all([
      supaAdmin
        .from('files')
        .select('id,name,type,size,url,public_id,folder_id,owner_id,public_link_active,shared_with,created_at,updated_at')
        .eq('folder_id', folderId)
        .order('created_at', { ascending: false }),
      supaAdmin
        .from('folders')
        .select('id,name,parent_id,owner_id,created_at')
        .eq('parent_id', folderId)
        .order('created_at', { ascending: true })
    ]);

    return res.json({
      files:   filesRes.data  || [],
      folders: foldersRes.data || []
    });
  } catch (err) {
    console.error('[FolderContents] Error:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ─── GET /folder-by-id/:folderId ────────────────────────────────────────────
// Devuelve una carpeta por ID si el usuario es dueño o tiene permiso.
app.get('/folder-by-id/:folderId', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const jwt = authHeader.slice(7);
  const { folderId } = req.params;

  try {
    const { data: { user }, error: authError } = await supaAdmin.auth.getUser(jwt);
    if (authError || !user) return res.status(401).json({ error: 'Token inválido' });

    const uid = user.id;

    // Buscar carpeta con supaAdmin (sin RLS)
    const { data: folder, error: folderErr } = await supaAdmin
      .from('folders')
      .select('id, name, parent_id, owner_id, created_at')
      .eq('id', folderId)
      .maybeSingle();

    if (folderErr || !folder) return res.status(404).json({ error: 'Carpeta no encontrada' });

    // Verificar acceso: dueño, link público activo, o tiene permiso
    const isOwner  = folder.owner_id === uid;
    let hasAccess  = isOwner;

    if (!hasAccess) {
      // Comprobar si tiene una entrada en permissions
      const { data: perm } = await supaAdmin
        .from('permissions')
        .select('id, permission')
        .eq('resource_type', 'folder')
        .eq('resource_id', folderId)
        .eq('user_id', uid)
        .maybeSingle();
      hasAccess = !!perm;
    }

    if (!hasAccess) return res.status(403).json({ error: 'Sin permiso' });

    return res.json({ folder });
  } catch (err) {
    console.error('[FolderById] Error:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ─── GET /shared-folders ────────────────────────────────────────────────────
// Devuelve las carpetas compartidas con el usuario autenticado.
// Bypasea RLS porque supaAdmin usa service key.
app.get('/shared-folders', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const jwt = authHeader.slice(7);

  try {
    // Verificar JWT y obtener UID real del usuario
    const { data: { user }, error: authError } = await supaAdmin.auth.getUser(jwt);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const uid = user.id;

    // 1. Obtener permisos del usuario para carpetas
    const { data: perms, error: permsErr } = await supaAdmin
      .from('permissions')
      .select('resource_id, permission')
      .eq('resource_type', 'folder')
      .eq('user_id', uid);

    if (permsErr) {
      console.error('[SharedFolders] Error permisos:', permsErr.message);
      return res.status(500).json({ error: 'Error al obtener permisos' });
    }

    if (!perms || perms.length === 0) {
      return res.json({ folders: [] });
    }

    const folderIds = perms.map(p => p.resource_id);

    // 2. Obtener carpetas — supaAdmin bypasea RLS (igual que getPublicFolder)
    const { data: folders, error: foldersErr } = await supaAdmin
      .from('folders')
      .select('id, name, parent_id, owner_id, created_at')
      .in('id', folderIds)
      .order('created_at', { ascending: false });

    if (foldersErr) {
      console.error('[SharedFolders] Error carpetas:', foldersErr.message);
      return res.status(500).json({ error: 'Error al obtener carpetas' });
    }

    // 3. Combinar carpeta + su permiso
    const result = (folders || []).map(f => {
      const perm = perms.find(p => p.resource_id === f.id);
      return {
        ...f,
        sharedPermission: (perm?.permission === 'editor' || perm?.permission === 'edit')
          ? 'editor'
          : 'viewer'
      };
    });

    return res.json({ folders: result });
  } catch (err) {
    console.error('[SharedFolders] Error general:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── POST /callback ─────────────────────────────────────────────────────────
/**
 * POST /callback?path=<storagePath>&token=<supabaseJWT>
 * OnlyOffice llama este endpoint cuando el usuario guarda.
 */
app.post('/callback', async (req, res) => {
  const { status, url } = req.body;
  const storagePath     = req.query.path;
  const token           = req.query.token;

  console.log(`[Callback] status=${status} | path=${storagePath}`);

  res.json({ error: 0 });

  if ((status === 2 || status === 6) && url && storagePath) {
    try {
      const fileBuffer = await downloadBuffer(url);
      const supaHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
        global: { headers: supaHeaders }
      });
      const { error: uploadError } = await supa.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
          upsert: true,
          contentType: 'application/octet-stream'
        });
      if (uploadError) {
        console.error('[Callback] ❌ Error al subir:', uploadError.message);
      } else {
        console.log('[Callback] ✅ Guardado exitosamente:', storagePath);
      }
    } catch (err) {
      console.error('[Callback] ❌ Error general:', err.message);
    }
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  // Mostrar todas las IPs disponibles para acceso remoto
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log(`\n✅ OnlyOffice Callback Server listo en puerto ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Red:     http://${ip}:${PORT}`));
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log('🔑 Service key configurada — RLS bypaseado para carpetas públicas.\n');
});
