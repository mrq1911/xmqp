require('dotenv').config();

const MessageQueueBot = require('./index');
const wsEndpoint = process.env.WS_ENDPOINT;

console.log("using node", wsEndpoint);

const bot = new MessageQueueBot(wsEndpoint);
bot.start().catch(console.error);
