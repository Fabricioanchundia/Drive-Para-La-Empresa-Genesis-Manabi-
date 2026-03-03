const express = require('express');
const cors    = require('cors');
const https   = require('https');
const http    = require('http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const SUPABASE_URL  = 'https://hsfhxminaykfswskcxck.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_9jBbeYFX-0tK7B-Ff0_4Dw_iKkedblQ';
const BUCKET        = 'drive-files';

/**
 * Descarga un archivo desde una URL y retorna su buffer.
 */
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      const chunks = [];
      res.on('data',  c   => chunks.push(c));
      res.on('end',   ()  => resolve(Buffer.concat(chunks)));
      res.on('error', err => reject(err));
    }).on('error', reject);
  });
}

/**
 * POST /callback?path=<storagePath>&token=<supabaseJWT>
 *
 * OnlyOffice llama este endpoint cuando el usuario guarda.
 * status 2 = listo para guardar
 * status 6 = force save
 */
app.post('/callback', async (req, res) => {
  const { status, url } = req.body;
  const storagePath     = req.query.path;
  const token           = req.query.token;

  console.log(`[Callback] status=${status} | path=${storagePath}`);

  // Responder INMEDIATAMENTE para que OnlyOffice no reintente
  res.json({ error: 0 });

  if ((status === 2 || status === 6) && url && storagePath) {
    try {
      // 1. Descargar el archivo desde la URL temporal de OnlyOffice
      const fileBuffer = await downloadBuffer(url);

      // 2. Crear cliente Supabase con el JWT del usuario (respeta RLS)
      const supaHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
        global: { headers: supaHeaders }
      });

      // 3. Subir el archivo al mismo path (upsert=true reemplaza el existente)
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ OnlyOffice callback server corriendo en http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
