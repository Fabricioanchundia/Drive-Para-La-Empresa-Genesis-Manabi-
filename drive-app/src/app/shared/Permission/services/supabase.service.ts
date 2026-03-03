import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class SupabaseService {

  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      'https://hsfhxminaykfswskcxck.supabase.co',
      'sb_publishable_9jBbeYFX-0tK7B-Ff0_4Dw_iKkedblQ',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: false,   //  CAMBIO CLAVE
          detectSessionInUrl: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'Accept': 'application/json'
          }
        }
      }
    );
  }
}
