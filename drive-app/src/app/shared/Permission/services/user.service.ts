import { Injectable, inject } from '@angular/core';
import { firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { User } from '../../models/model';
import { BaseApiService } from './base-api.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly supa = inject(SupabaseService);
  private readonly api  = inject(BaseApiService);

  async getAllUsers(): Promise<User[]> {
    try {
      const { data } = await this.runSupabase(
        this.supa.client
          .from('users')
          .select('*')
          .order('created_at', { ascending: false }),
        'users:list'
      );
      if (!data) return [];
      return data.map((d: any) => ({
        uid:         d.id,
        email:       d.email,
        displayName: d.display_name,
        role:        d.role,
        active:      d.active,
        createdAt:   new Date(d.created_at)
      }));
    } catch {
      return [];
    }
  }

  async changeRole(uid: string, role: 'admin' | 'user'): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('users').update({ role }).eq('id', uid),
      'users:updateRole'
    );
  }

  async toggleActive(uid: string, active: boolean): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('users').update({ active }).eq('id', uid),
      'users:updateActive'
    );
  }

  async updateDisplayName(uid: string, displayName: string): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('users').update({ display_name: displayName }).eq('id', uid),
      'users:updateName'
    );
  }

  async deleteUser(uid: string): Promise<void> {
    await this.runSupabase(
      this.supa.client.from('users').delete().eq('id', uid),
      'users:delete'
    );
  }

  private async runSupabase<T>(promise: PromiseLike<T>, key: string): Promise<T> {
    return firstValueFrom(
      this.api.request(
        from(promise).pipe(
          map((res: any) => {
            if (res?.error) throw res.error;
            return res as T;
          })
        ),
        key
      )
    );
  }
}