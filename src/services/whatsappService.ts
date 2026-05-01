import axios from 'axios';

/**
 * WhatsApp Service using Twilio or Meta API placeholder
 * To use Twilio:
 * - ACCOUNT_SID
 * - AUTH_TOKEN
 * - FROM_NUMBER (whatsapp:+14155238886)
 */

export class WhatsAppService {
  static async sendUdharReminder(phone: string, name: string, amount: number) {
    const message = `Hello ${name}, your total udhar at FreshMart is Rs. ${amount.toFixed(2)}. Please clear your dues. Thank you!`;
    
    console.log(`[WhatsApp] Sending to ${phone}: ${message}`);

    // Example Twilio integration
    /*
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = require('twilio')(accountSid, authToken);

    try {
      await client.messages.create({
        body: message,
        from: 'whatsapp:+14155238886', // Twilio Sandbox or registered number
        to: `whatsapp:${phone}`
      });
      return true;
    } catch (error) {
      console.error("WhatsApp Send Failed:", error);
      return false;
    }
    */
    
    return true; // Mock success
  }
}
