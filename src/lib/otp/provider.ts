export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

export interface OTPDeliveryProvider {
  name: string;
  sendSMS(phone: string, message: string): Promise<DeliveryResult>;
  sendWhatsApp(phone: string, message: string): Promise<DeliveryResult>;
  sendEmail(email: string, subject: string, body: string): Promise<DeliveryResult>;
  isAvailable(channel: 'sms' | 'whatsapp' | 'email'): boolean;
}
