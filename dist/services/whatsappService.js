"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendUdharReminder = void 0;
const axios_1 = __importDefault(require("axios"));
const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const sendUdharReminder = async (phone, name, balance, paymentLink) => {
    if (!WHATSAPP_TOKEN) {
        console.warn("WhatsApp Token not set. Skipping message to", phone);
        return;
    }
    try {
        await axios_1.default.post(WHATSAPP_API_URL, {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
                name: 'udhar_monthly_reminder', // Ensure this matches Meta Business Manager
                language: { code: 'en_US' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: name },
                            { type: 'text', text: balance.toFixed(2) },
                            { type: 'text', text: paymentLink }
                        ]
                    }
                ]
            }
        }, {
            headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`WhatsApp reminder sent successfully to ${phone}`);
    }
    catch (error) {
        console.error('Error sending WhatsApp reminder:', error.response?.data || error.message);
    }
};
exports.sendUdharReminder = sendUdharReminder;
//# sourceMappingURL=whatsappService.js.map