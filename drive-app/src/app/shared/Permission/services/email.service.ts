import { Injectable } from '@angular/core';
import emailjs from '@emailjs/browser';

/**
 * Servicio para envío de correos usando EmailJS
 * 
 * CONFIGURACIÓN REQUERIDA:
 * 1. Regístrate en https://www.emailjs.com/ (GRATIS - 200 emails/mes)
 * 2. Crea un servicio de email (Gmail, Outlook, etc.)
 * 3. Crea una plantilla de email
 * 4. Obtén tus credenciales y actualiza environment.ts
 */
@Injectable({ providedIn: 'root' })
export class EmailService {

  constructor() {
    // Inicializar EmailJS con la Public Key
    emailjs.init('umoNgXMDvn3HqZCRS');
  }

  /**
   * Inicializa EmailJS con tu Public Key
   * Esta clave debe estar en environment.ts
   */
  init(publicKey: string): void {
    emailjs.init(publicKey);
  }

  /**
   * Envía un correo de invitación para compartir archivo
   */
  async sendShareInvitation(
    toEmail: string,
    fileName: string,
    accessLink: string,
    senderName: string,
    permission: string
  ): Promise<boolean> {
    try {
      // Parámetros que se enviarán a la plantilla de EmailJS
      const templateParams = {
        to_email: toEmail,
        file_name: fileName,
        access_link: accessLink,
        sender_name: senderName,
        permission_text: permission === 'viewer' ? 'Solo ver' : 'Editar',
        subject: `${senderName} compartió "${fileName}" contigo`
      };

      // Credenciales de EmailJS configuradas
      const serviceId = 'service_sog5uqg';    // ✅ Configurado
      const templateId = 'template_ih6bsnq';  // ✅ Configurado

      const response = await emailjs.send(
        serviceId,
        templateId,
        templateParams
      );

      console.log('✅ Correo enviado exitosamente:', response);
      return response.status === 200;
    } catch (error) {
      console.error('❌ Error enviando correo:', error);
      return false;
    }
  }

  /**
   * Reenvía una invitación existente
   */
  async resendInvitation(
    toEmail: string,
    fileName: string,
    accessLink: string,
    permission: string
  ): Promise<boolean> {
    try {
      const templateParams = {
        to_email: toEmail,
        file_name: fileName,
        access_link: accessLink,
        permission_text: permission === 'viewer' ? 'Solo ver' : 'Editar',
        subject: `Recordatorio: Tienes acceso a "${fileName}"`
      };

      // Credenciales de EmailJS configuradas
      const serviceId = 'service_sog5uqg';
      const templateId = 'template_ih6bsnq';

      const response = await emailjs.send(
        serviceId,
        templateId,
        templateParams
      );

      return response.status === 200;
    } catch (error) {
      console.error('Error reenviando invitación:', error);
      return false;
    }
  }
}
