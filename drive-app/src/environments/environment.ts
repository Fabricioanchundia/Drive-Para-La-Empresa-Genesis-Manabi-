// Configuración de entorno para desarrollo
// NOTA: Este proyecto usa Supabase, no Firebase
// Firebase está configurado pero no se usa activamente

export const environment = {
  production: false,
  // URL pública de la app para links compartidos
  // Dejada vacía para usar automáticamente location.origin
  // Esto permite que funcione con localhost, IP local, o cualquier otra URL
  frontendUrl: '',
  
  // Firebase config (actualmente no usado, el proyecto usa Supabase)
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  
  // Supabase config (ver supabase.service.ts para credenciales)
  supabase: {
    url: 'https://hsfhxminaykfswskcxck.supabase.co',
    key: 'sb_publishable_9jBbeYFX-0tK7B-Ff0_4Dw_iKkedblQ'
  }
};
