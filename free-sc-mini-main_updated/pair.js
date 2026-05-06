const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------
const BOT_NAME_FREE = 'ʙʀᴏᴡᴀʏᴇꜱᴜ-ᴍɪɴɪ';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['🎈','👀','❤️‍🔥','💗','😩','☘️','🗣️','🌸'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/JcaC26geQIQ9MMMlgICBuY',
  FREE_IMAGE: 'https://i.ibb.co/Kxv1RgcZ/IMG-20260222-WA0011.jpg', // Harmonized by Gemini
  NEWSLETTER_JID: '120363402507750390@newsletter', // replace with your own newsletter its the main newsletter
  
  // ✅ SUPPORT/VALIDATION NEWSLETTER ( recommended) 
  // this will not affect anything..its just for supporting the dev channel
  // Users add this to show support and get updates
  // bro if u remove this you are one cursed human alive
  SUPPORT_NEWSLETTER: {
    jid: '120363402507750390@newsletter',  // Your channel
    emojis: ['❤️', '🌟', '🔥', '💯'],  // Support emojis
    name: 'Malvin King Tech',
    description: 'Bot updates & support channel'
  },
  
  // ✅ Default newsletters (U can customize these) add all your other newsletters
  DEFAULT_NEWSLETTERS: [
    // Your support newsletter first (as example)
    { 
      jid: '120363420989526190@newsletter',  // Your channel
      emojis: ['❤️', '🌟', '🔥', '💯'],
      name: 'FREE Tech', //your channel name or just desplay name
      description: 'Free Channel'
    },
    // Other popular newsletters if u have more
    { 
      jid: '120363420989526190@newsletter', 
      emojis: ['🎵', '🎶', '📻'],
      name: 'Music Updates'
    }
    // etc u can add more following the above example
  ],
  
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '254746432359',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6YML80VycDvHq6yV3S',
  BOT_NAME: 'ʙʀᴏᴡᴀʏᴇꜱᴜ-ᴍɪɴɪ',
  BOT_VERSION: '1.0.beta',
  OWNER_NAME: 'ʙʀᴏᴡᴀʏᴇꜱᴜ',
  IMAGE_PATH: 'https://i.ibb.co/Kxv1RgcZ/IMG-20260222-WA0011.jpg', // Updated by Gemini
  BOT_FOOTER: '> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʙʀᴏᴡᴀʏᴇꜱᴜ',
  BUTTON_IMAGES: { ALIVE: 'https://i.ibb.co/Kxv1RgcZ/IMG-20260222-WA0011.jpg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://malvintech11_db_user:0SBgxRy7WsQZ1KTq@cluster0.xqgaovj.mongodb.net/?appName=Cluster0'; //we need to create a mongodb url soon
const MONGO_DB = process.env.MONGO_DB || 'Free_Mini';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- Auto-load with support encouragement ----------------
async function loadDefaultNewsletters() {
  try {
    await initMongo();
    
    console.log('📰 Setting up newsletters...');
    
    // Check what's already in DB
    const existing = await newsletterCol.find({}).toArray();
    const existingJids = existing.map(doc => doc.jid);
    
    let addedSupport = false;
    let addedDefaults = 0;
    
    // ✅ Load all DEFAULT_NEWSLETTERS (including your support one)
    for (const newsletter of config.DEFAULT_NEWSLETTERS) {
      try {
        // Skip if already exists
        if (existingJids.includes(newsletter.jid)) continue;
        
        await newsletterCol.updateOne(
          { jid: newsletter.jid },
          { $set: { 
            jid: newsletter.jid, 
            emojis: newsletter.emojis || config.AUTO_LIKE_EMOJI,
            name: newsletter.name || '',
            description: newsletter.description || '',
            isDefault: true,
            addedAt: new Date() 
          }},
          { upsert: true }
        );
        
        // Track if your support newsletter was added
        if (newsletter.jid === config.SUPPORT_NEWSLETTER.jid) {
          addedSupport = true;
          console.log(`✅ Added support newsletter: ${newsletter.name}`);
        } else {
          addedDefaults++;
          console.log(`✅ Added default newsletter: ${newsletter.name}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not add ${newsletter.jid}:`, error.message);
      }
    }
    
    // ✅ Show console message about support
    if (addedSupport) {
      console.log('\n🎉 =================================');
      console.log('   THANK YOU FOR ADDING MY CHANNEL!');
      console.log('   Your support helps improve the bot.');
      console.log('   Channel:', config.SUPPORT_NEWSLETTER.name);
      console.log('   JID:', config.SUPPORT_NEWSLETTER.jid);
      console.log('=====================================\n');
    }
    
    console.log(`📰 Newsletter setup complete. Added ${addedDefaults + (addedSupport ? 1 : 0)} newsletters.`);
    
  } catch (error) {
    console.error('❌ Failed to setup newsletters:', error);
  }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getZimbabweanTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FREE;
  const image = sessionConfig.logo || config.FREE_IMAGE;
  const caption = formatMessage(botName, `*📞 𝐍umber:* ${number}\n*🩵 𝐒tatus:* ${groupStatus}\n*🕒 𝐂onnected 𝐀t:* ${getZimbabweanTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.FREE_IMAGE }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

/* async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FREE;
    const image = sessionConfig.logo || config.FREE_IMAGE;
    const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(`*🥷 OWNER CONNECT — ${botName}*`, `*📞 𝐍umber:* ${number}\n*🩵 𝐒tatus:* ${groupStatus}\n*🕒 𝐂onnected 𝐀t:* ${getZimbabweanTimestamp()}\n\n*🔢 𝐀ctive 𝐒essions:* ${activeCount}`, botName);
    if (String(image).startsWith('http')) {
      await socket.sendMessage(ownerJid, { image: { url: image }, caption });
    } else {
      try {
        const buf = fs.readFileSync(image);
        await socket.sendMessage(ownerJid, { image: buf, caption });
      } catch (e) {
        await socket.sendMessage(ownerJid, { image: { url: config.FREE_IMAGE }, caption });
      }
    }
  } catch (err) { console.error('Failed to send owner connect message:', err); }
}
*/

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 OTP VERIFICATION — ${BOT_NAME_FREE}*`, `*𝐘our 𝐎TP 𝐅or 𝐂onfig 𝐔pdate is:* *${otp}*\n*𝐓his 𝐎TP 𝐖ill 𝐄xpire 𝐈n 5 𝐌inutes.*\n\n*𝐍umber:* ${number}`, BOT_NAME_FREE);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    try {
      if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      if (config.AUTO_VIEW_STATUS === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { await socket.readMessages([message.key]); break; }
          catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }
      if (config.AUTO_LIKE_STATUS === 'true') {
        const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }

    } catch (error) { console.error('Status handler error:', error); }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getZimbabweanTimestamp();
    const message = formatMessage('*🗑️ MESSAGE DELETED*', `A message was deleted from your chat.\n*📄 𝐅rom:* ${messageKey.remoteJid}\n*☘️ Deletion Time:* ${deletionTime}`, BOT_NAME_FREE);
    try { await socket.sendMessage(userJid, { image: { url: config.FREE_IMAGE }, caption: message }); }
    catch (error) { console.error('*Failed to send deletion notification !*', error); }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
    const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g,'');

    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }
    
                // 🔹 Fake contact with dynamic bot name
        const fakevcard = {
        
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID"
            },
            message: {
                contactMessage: {
                    displayName: "ʙʀᴏᴡᴀʏᴇꜱᴜ-ᴍɪɴɪ",
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:Free;;;;
FN:Meta
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

    if (!command) return;

    try {
      switch (command) {
      
      // test command switch case

case 'menu': {
  try { await socket.sendMessage(sender, { react: { text: "🎐", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    // load per-session config (logo, botName)
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '©ʙʀᴏᴡᴀʏᴇꜱᴜ-ᴍɪɴɪ ';


    const text = `
╭────────￫
│  • ɴᴀᴍᴇ ${title}                        
│  • ᴏᴡɴᴇʀ: ${config.OWNER_NAME}            
│  • ᴠᴇʀsɪᴏɴ: ${config.BOT_VERSION}             
│  • ᴘʟᴀᴛғᴏʀᴍ: ${process.env.PLATFORM || 'Heroku'}           
│  • ᴜᴘᴛɪᴍᴇ: ${hours}h ${minutes}m ${seconds}s                
╰────────￫
🎯 ᴛᴀᴘ ᴀ ᴄᴀᴛᴇɢᴏʀʏ ʙᴇʟᴏᴡ!`;

    const buttons = [
      { buttonId: `${config.PREFIX}generalcommands`, buttonText: { displayText: "ɢᴇɴᴇᴇʀᴀʟ ᴄᴏᴍᴍᴀɴᴅs" }, type: 1 },
      { buttonId: `${config.PREFIX}codingcommands`, buttonText: { displayText: "ᴄᴏᴅɪɴɢ ᴄᴏᴍᴍᴀɴᴅs" }, type: 1 },
      { buttonId: `${config.PREFIX}animecommands`, buttonText: { displayText: "ᴀɴɪᴍᴇ ᴄᴏᴍᴍᴀɴᴅs" }, type: 1 },
      { buttonId: `${config.PREFIX}logocommands`, buttonText: { displayText: "ʟᴏɢᴏ ᴄᴏᴍᴍᴀɴᴅs" }, type: 1 },
      { buttonId: `${config.PREFIX}downloads`, buttonText: { displayText: "ᴅᴏᴡɴʟᴏᴀᴅs" }, type: 1 },
      { buttonId: `${config.PREFIX}group`, buttonText: { displayText: "ɢʀᴏᴜᴘ" }, type: 1 },
      { buttonId: `${config.PREFIX}games`, buttonText: { displayText: "ɢᴀᴍᴇs" }, type: 1 },
      { buttonId: `${config.PREFIX}fun`, buttonText: { displayText: "ғᴜɴ" }, type: 1 },
      { buttonId: `${config.PREFIX}aimenu`, buttonText: { displayText: "ᴀɪ ᴍᴇɴᴜ" }, type: 1 },
      { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 ᴏᴡɴᴇʀ" }, type: 1 }
    ];

    const defaultImg = 'https://i.ibb.co/Kxv1RgcZ/IMG-20260222-WA0011.jpg';
    const useLogo = userCfg.logo || defaultImg;

    // build image payload (url or buffer)
    let imagePayload;
    if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };
    else {
      try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }
    }

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: "*▶ ● ʙʀᴏᴡᴀʏᴇꜱᴜ-ᴍɪɴɪ*",
      buttons,
      headerType: 4
    });

  } catch (err) {
    console.error('menu command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}





// ---------------------- PING ----------------------
case 'ping': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FREE;
    const logo = cfg.logo || config.FREE_IMAGE;

    const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());

    const text = `
*📡 ${botName} ᴘɪɴɢ ɴᴏᴡ*

*◈ 🛠️ 𝐋atency :*  ${latency}ms
*◈ 🕢 𝐒erver 𝐓ime :* ${new Date().toLocaleString()}
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `*${botName} ᴘɪɴɢ*`,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('ping error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get ping.' }, { quoted: msg });
  }
  break;
}


// ---------------------- ALIVE ----------------------
case 'alive': {
  try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('alive: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🟢 ${botName} ɪs ᴀʟɪᴠᴇ 』─╮*
*┃*  🟢 *ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m ${seconds}s
*┃*  🎀 *ᴏᴡɴᴇʀ:* ${config.OWNER_NAME}
*┃*  📜 *ᴘʟᴀᴛғᴏʀᴍ:* ${process.env.PLATFORM || 'Heroku'}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('alive command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get alive status.' }, { quoted: msg });
  }
  break;
}

// ---------------------- IMAGE ----------------------
case 'image': {
  try { await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('image: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const caption = `*Here's an image from ${botName}!*`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: caption,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('image command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send image.' }, { quoted: msg });
  }
  break;
}

// ---------------------- QURAN ----------------------
case 'quran': {
  try { await socket.sendMessage(sender, { react: { text: "📜", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('quran: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📜 QURAN COMMAND 』─╮*
*┃*  📖 To get a Quran verse, use:
*┃*     *.quran [chapter]:[verse]*
*┃*  📚 Example: *.quran 1:1*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('quran command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get Quran verse.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SURAH ----------------------
case 'surah': {
  try { await socket.sendMessage(sender, { react: { text: "📜", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('surah: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📜 SURAH COMMAND 』─╮*
*┃*  📖 To get a specific Surah, use:
*┃*     *.surah [surah_number]*
*┃*  📚 Example: *.surah 18*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('surah command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get Surah.' }, { quoted: msg });
  }
  break;
}

// ---------------------- WALLPAPER ----------------------
case 'wallpaper': {
  try { await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('wallpaper: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🐑 WALLPAPER COMMAND 』─╮*
*┃*  🖼️ To get a random wallpaper, use:
*┃*     *.wallpaper*
*┃*  🔎 To search for a wallpaper, use:
*┃*     *.wallpaper [query]*
*┃*  📚 Example: *.wallpaper nature*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('wallpaper command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get wallpaper.' }, { quoted: msg });
  }
  break;
}

// ---------------------- BOT_STATS ----------------------
case 'bot_stats': {
  try { await socket.sendMessage(sender, { react: { text: "📊", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor((uptime % 31536000) / 3600); // Uptime in hours, modulo for yearly resets
    const days = Math.floor(uptime / 86400); // Uptime in days
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('bot_stats: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;
    const activeSessions = activeSockets.size;

    const text = `
*╭─『 📊 ${botName} 𝐒𝐓𝐀𝐓𝐒 』─╮*
*┃*  🟢 *ᴜᴘᴛɪᴍᴇ:* ${days}d ${hours}h ${minutes}m ${seconds}s
*┃*  👥 *ᴀᴄᴛɪᴠᴇ sᴇssɪᴏɴs:* ${activeSessions}
*┃*  🎀 *ᴏᴡɴᴇʀ:* ${config.OWNER_NAME}
*┃*  📜 *ᴘʟᴀᴛғᴏʀᴍ:* ${process.env.PLATFORM || 'Heroku'}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('bot_stats command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get bot stats.' }, { quoted: msg });
  }
  break;
}

// ---------------------- WEBZIP ----------------------
case 'webzip': {
  try { await socket.sendMessage(sender, { react: { text: "⚔️", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('webzip: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ⚔️ WEBZIP COMMAND 』─╮*
*┃*  📦 To zip content from a URL, use:
*┃*     *.webzip [URL]*
*┃*  📚 Example: *.webzip https://example.com*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('webzip command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to zip web content.' }, { quoted: msg });
  }
  break;
}

// ---------------------- CALC ----------------------
case 'calc': {
  try { await socket.sendMessage(sender, { react: { text: "🧑‍💻", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a mathematical expression.* Example: *.calc 10 + 5*` }, { quoted: msg });
      return;
    }
    const expression = args.join(' ');
    let result;
    try {
      // WARNING: Using eval() can be dangerous if input is not sanitized.
      // For a production bot, consider using a safer math evaluation library.
      result = eval(expression);
    } catch (err) {
      await socket.sendMessage(sender, { text: `*Invalid expression.* Please check your math.`, footer: `Error: ${err.message}` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('calc: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🧑‍💻 CALCULATOR 』─╮*
*┃*  *Expression:* ${expression}
*┃*  *Result:* ${result}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('calc command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to perform calculation.' }, { quoted: msg });
  }
  break;
}

// ---------------------- MEMBERS ----------------------
case 'members': {
  try { await socket.sendMessage(sender, { react: { text: "🫂", key: msg.key } }); } catch(e){}

  try {
    const chat = await socket.groupMetadata(from);
    if (!chat || chat.participants.length === 0) {
      await socket.sendMessage(sender, { text: 'This command can only be used in a group, or I could not fetch group information.' }, { quoted: msg });
      return;
    }

    let membersList = `*╭─『 🫂 𝐆𝐑𝐎𝐔𝐏 𝐌𝐄𝐌𝐁𝐄𝐑𝐒 』─╮*\n`;
    for (const participant of chat.participants) {
      membersList += `*┃* @${participant.id.split('@')[0]}\n`;
    }
    membersList += `*╰──────────────⊷*\n`;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('members: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      text: membersList,
      contextInfo: { mentionedJid: chat.participants.map(p => p.id) },
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('members command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to list group members.' }, { quoted: msg });
  }
  break;
}

// ---------------------- CAL ----------------------
case 'cal': {
  try { await socket.sendMessage(sender, { react: { text: "📅", key: msg.key } }); } catch(e){}

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 for Sunday, 1 for Monday etc.

    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[month];

    let calendar = `*╭─『 📅 𝐂𝐀𝐋𝐄𝐍𝐃𝐀𝐑 - ${monthName} ${year} 』─╮*\n`;
    calendar += `*┃*  Su Mo Tu We Th Fr Sa\n`;
    calendar += `*┃*  `;

    // Add leading spaces for the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      calendar += `   `;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day < 10 ? ` ${day}` : `${day}`;
      calendar += `${dayStr} `;
      if ((firstDayOfMonth + day) % 7 === 0) {
        calendar += `\n*┃*  `;
      }
    }
    calendar += `\n*╰──────────────⊷*\n`;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('cal: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      text: calendar,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('cal command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to generate calendar.' }, { quoted: msg });
  }
  break;
}

// ---------------------- NPM ----------------------
case 'npm': {
  try { await socket.sendMessage(sender, { react: { text: "📦", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('npm: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📜 NPM COMMAND 』─╮*
*┃*  📦 To search for an npm package, use:
*┃*     *.npm search [query]*
*┃*  ℹ️ To get info about a package, use:
*┃*     *.npm info [package_name]*
*┃*  📚 Example: *.npm info express*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('npm command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get npm info.' }, { quoted: msg });
  }
  break;
}

// ---------------------- BOT_INFO ----------------------
case 'bot_info': {
  try { await socket.sendMessage(sender, { react: { text: "ℹ️", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('bot_info: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ℹ️ ${botName} 𝐈𝐍𝐅𝐎 』─╮*
*┃*  🚀 *𝐍𝐚𝐦𝐞:* ${config.BOT_NAME}
*┃*  🛠️ *𝐕𝐞𝐫𝐬𝐢𝐨𝐧:* ${config.BOT_VERSION}
*┃*  👑 *𝐎𝐰𝐧𝐞𝐫:* ${config.OWNER_NAME}
*┃*  🌐 *𝐏𝐥𝐚𝐭𝐟𝐨𝐫𝐦:* ${process.env.PLATFORM || 'Heroku'}
*┃*  💬 *𝐃𝐞𝐬𝐜𝐫𝐢𝐩𝐭𝐢𝐨𝐧:* This is a multi-device WhatsApp userbot.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('bot_info command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get bot info.' }, { quoted: msg });
  }
  break;
}

// ---------------------- CREACT ----------------------
case 'creact': {
  try { await socket.sendMessage(sender, { react: { text: "🎊", key: msg.key } }); } catch(e){}

  try {
    if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage || !args.length) {
      await socket.sendMessage(sender, { text: `*To use .creact, quote a message and provide an emoji.* Example: *.creact 😂*` }, { quoted: msg });
      return;
    }

    const quotedMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage;
    const quotedMessageKey = {
      remoteJid: msg.key.remoteJid,
      fromMe: msg.key.fromMe,
      id: msg.message.extendedTextMessage.contextInfo.stanzaId
    };
    const emoji = args[0];

    await socket.sendMessage(sender, { react: { text: emoji, key: quotedMessageKey } });
    await socket.sendMessage(sender, { text: `*Successfully reacted with ${emoji}!*` }, { quoted: msg });

  } catch(e) {
    console.error('creact command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to add reaction.' }, { quoted: msg });
  }
  break;
}

// ---------------------- BIBLE ----------------------
case 'bible': {
  try { await socket.sendMessage(sender, { react: { text: "📖", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('bible: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📖 BIBLE COMMAND 』─╮*
*┃*  📚 To get a Bible verse, use:
*┃*     *.bible [book] [chapter]:[verse]*
*┃*  📖 Example: *.bible John 3:16*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('bible command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get Bible verse.' }, { quoted: msg });
  }
  break;
}

// ---------------------- JID ----------------------
case 'jid': {
  try { await socket.sendMessage(sender, { react: { text: "🌸", key: msg.key } }); } catch(e){}

  try {
    let targetJid = sender;
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('jid: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🌸 JID INFO 』─╮*
*┃*  *User JID:* ${targetJid}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('jid command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get JID.' }, { quoted: msg });
  }
  break;
}

// ---------------------- GITCLONE ----------------------
case 'gitclone': {
  try { await socket.sendMessage(sender, { react: { text: "🎀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length || !args[0].startsWith('http')) {
      await socket.sendMessage(sender, { text: `*Please provide a valid GitHub repository URL.* Example: *.gitclone https://github.com/user/repo*` }, { quoted: msg });
      return;
    }

    const repoUrl = args[0];
    const cloneDir = `./cloned_repos/${Date.now()}`; // Unique directory for each clone

    await socket.sendMessage(sender, { text: `*Cloning repository... This may take a moment.*` }, { quoted: msg });

    exec(`git clone ${repoUrl} ${cloneDir}`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        await socket.sendMessage(sender, { text: `*Failed to clone repository:*\n\`\`\`${stderr}\`\`\`` }, { quoted: msg });
        return;
      }
      if (stderr) {
        console.warn(`git clone stderr: ${stderr}`);
      }

      await socket.sendMessage(sender, { text: `*Repository cloned successfully to: ${cloneDir}*` }, { quoted: msg });
    });

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('gitclone: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎀 GITCLONE COMMAND 』─╮*
*┃*  📦 To clone a GitHub repo, use:
*┃*     *.gitclone [repo_url]*
*┃*  📚 Example: *.gitclone https://github.com/user/repo*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });


  } catch(e) {
    console.error('gitclone command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to clone repository.' }, { quoted: msg });
  }
  break;
}


// ---------------------- VIDEO DOWNLOAD COMMAND (YouTube MP4) ----------------------
case 'video': {
  try { await socket.sendMessage(sender, { react: { text: "🎥", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a video name or YouTube URL to download.* Example: *.video Never Gonna Give You Up*` }, { quoted: msg });
      return;
    }

    const query = args.join(' ');
    let videoBuffer;
    let videoTitle;

    // Check if it's a YouTube URL
    const youtubeUrlRegex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = query.match(youtubeUrlRegex);

    if (match) {
        const videoId = match[1];
        await socket.sendMessage(sender, { text: `*Downloading video from YouTube...*` }, { quoted: msg });
        const ytmp3 = require('denethdev-ytmp3'); // Reusing the same library for video download
        const videoData = await ytmp3.mp4(videoId); // Use mp4 function
        if (!videoData || !videoData.url) {
            throw new Error('Failed to get video data from YouTube.');
        }
        const response = await axios.get(videoData.url, { responseType: 'arraybuffer' });
        videoBuffer = Buffer.from(response.data);
        videoTitle = videoData.title || 'Unknown Video';
    } else {
        await socket.sendMessage(sender, { text: `*Searching for "${query}" on YouTube...*` }, { quoted: msg });
        const yts = require('yt-search');
        const r = await yts(query);
        const videos = r.videos;

        if (!videos || videos.length === 0) {
            await socket.sendMessage(sender, { text: `*No videos found for "${query}".*` }, { quoted: msg });
            return;
        }

        const firstVideo = videos[0];
        await socket.sendMessage(sender, { text: `*Downloading video for "${firstVideo.title}"...*` }, { quoted: msg });
        const ytmp3 = require('denethdev-ytmp3');
        const videoData = await ytmp3.mp4(firstVideo.url); // Use mp4 function
        if (!videoData || !videoData.url) {
            throw new Error('Failed to get video data from YouTube.');
        }
        const response = await axios.get(videoData.url, { responseType: 'arraybuffer' });
        videoBuffer = Buffer.from(response.data);
        videoTitle = firstVideo.title;
    }

    await socket.sendMessage(sender, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `${videoTitle}.mp4`,
      caption: `*Here's your video: ${videoTitle}*`,
      contextInfo: {
        mentionedJid: [sender]
      }
    }, { quoted: msg });

  } catch(e) {
    console.error('video command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to download the video. Ensure it\'s a valid YouTube link or a searchable video title.' }, { quoted: msg });
  }
  break;
}

// ---------------------- GITHUB ----------------------
case 'github': {
  try { await socket.sendMessage(sender, { react: { text: "🔮", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('github: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🔮 GITHUB COMMAND 』─╮*
*┃*  🔎 To search for a GitHub user, use:
*┃*     *.github user [username]*
*┃*  📦 To search for a GitHub repo, use:
*┃*     *.github repo [repo_name]*
*┃*  📚 Example: *.github user octocat*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('github command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get GitHub info.' }, { quoted: msg });
  }
  break;
}

// ---------------------- LYRICS ----------------------
case 'lyrics': {
  try { await socket.sendMessage(sender, { react: { text: "🎶", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('lyrics: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ♻️ LYRICS COMMAND 』─╮*
*┃*  🎵 To search for song lyrics, use:
*┃*     *.lyrics [song_title] - [artist]*
*┃*  📚 Example: *.lyrics Bohemian Rhapsody - Queen*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('lyrics command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get lyrics.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SETPP ----------------------
case 'setpp': {
  try { await socket.sendMessage(sender, { react: { text: "🔰", key: msg.key } }); } catch(e){}

  try {
    let ppImageBuffer;
    if (msg.message.imageMessage) {
      ppImageBuffer = await downloadContentFromMessage(msg.message.imageMessage, 'image');
    } else if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
      ppImageBuffer = await downloadContentFromMessage(msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage, 'image');
    } else if (args.length > 0 && String(args[0]).startsWith('http')) {
      const response = await axios.get(args[0], { responseType: 'arraybuffer' });
      ppImageBuffer = Buffer.from(response.data);
    }

    if (!ppImageBuffer) {
      await socket.sendMessage(sender, { text: `*Please quote an image or provide an image URL to set as the profile picture.*` }, { quoted: msg });
      return;
    }

    // Resize image to 640x640 (WhatsApp standard)
    const jimpImage = await Jimp.read(ppImageBuffer);
    const resizedImageBuffer = await jimpImage.resize(640, 640).getBufferAsync(Jimp.MIME_JPEG);

    await socket.updateProfilePicture(socket.user.id, resizedImageBuffer);
    await socket.sendMessage(sender, { text: `*Profile picture updated successfully!*` }, { quoted: msg });

  } catch(e) {
    console.error('setpp command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to set profile picture.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ONLINE ----------------------
case 'online': {
  try { await socket.sendMessage(sender, { react: { text: "🔥", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('online: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🔥 ${botName} 𝐒𝐓𝐀𝐓𝐔𝐒 』─╮*
*┃*  ✅ *𝐈'𝐦 𝐎𝐧𝐥𝐢𝐧𝐞 𝐚𝐧𝐝 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐢𝐯𝐞!*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('online command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to check online status.' }, { quoted: msg });
  }
  break;
}

// ---------------------- BLOCKLIST ----------------------
case 'blocklist': {
  try { await socket.sendMessage(sender, { react: { text: "🚩", key: msg.key } }); } catch(e){}

  try {
    const blockedContacts = await socket.fetchBlocklist();

    if (blockedContacts.length === 0) {
      await socket.sendMessage(sender, { text: `*No contacts are currently blocked.*` }, { quoted: msg });
      return;
    }

    let blocklistText = `*╭─『 🚩 𝐁𝐋𝐎𝐂𝐊𝐄𝐃 𝐂𝐎𝐍𝐓𝐀𝐂𝐓𝐒 』─╮*\n`;
    for (const jid of blockedContacts) {
      blocklistText += `*┃*  ${jid}\n`;
    }
    blocklistText += `*╰──────────────⊷*\n`;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('blocklist: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      text: blocklistText,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('blocklist command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to retrieve blocklist.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ALLMENU ----------------------
case 'allmenu': {
  try { await socket.sendMessage(sender, { react: { text: "📜", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('allmenu: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📜 𝐀𝐋𝐋 𝐌𝐄𝐍𝐔 』─╮*
*┃*  ✨ To see all available commands,
*┃*     please use the *${config.PREFIX}menu* command
*┃*     and select a category button.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('allmenu command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to show all menus.' }, { quoted: msg });
  }
  break;
}

// ---------------------- PAIR ----------------------
case 'pair': {
  try { await socket.sendMessage(sender, { react: { text: "🔗", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('pair: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🔗 𝐏𝐀𝐈𝐑 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』─╮*
*┃*  🚀 To pair a new session, use:
*┃*     *.pair [your_whatsapp_number]*
*┃*  📚 Example: *.pair 2547XXXXXXXX*
*┃*  *Note: The bot will provide a pairing code to your WhatsApp number.*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('pair command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to initiate pairing.' }, { quoted: msg });
  }
  break;
}

// ---------------------- TAGADMINS ----------------------
case 'tagadmins': {
  try { await socket.sendMessage(sender, { react: { text: "🎌", key: msg.key } }); } catch(e){}

  try {
    const chat = await socket.groupMetadata(from);
    if (!chat || !chat.participants) {
      await socket.sendMessage(sender, { text: 'This command can only be used in a group, or I could not fetch group information.' }, { quoted: msg });
      return;
    }

    const admins = chat.participants.filter(p => p.admin);

    if (admins.length === 0) {
      await socket.sendMessage(sender, { text: `*There are no administrators in this group.*` }, { quoted: msg });
      return;
    }

    let adminList = `*╭─『 🎌 𝐆𝐑𝐎𝐔𝐏 𝐀𝐃𝐌𝐈𝐍𝐒 』─╮*\n`;
    for (const admin of admins) {
      adminList += `*┃* @${admin.id.split('@')[0]}\n`;
    }
    adminList += `*╰──────────────⊷*\n`;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('tagadmins: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      text: adminList,
      contextInfo: { mentionedJid: admins.map(p => p.id) },
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('tagadmins command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to tag admins.' }, { quoted: msg });
  }
  break;
}

// ---------------------- GINFO ----------------------
case 'ginfo': {
  try { await socket.sendMessage(sender, { react: { text: "🌟", key: msg.key } }); } catch(e){}

  try {
    const chat = await socket.groupMetadata(from);
    if (!chat) {
      await socket.sendMessage(sender, { text: 'This command can only be used in a group, or I could not fetch group information.' }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('ginfo: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const creationDate = new Date(chat.creation * 1000).toLocaleString();

    const text = `
*╭─『 🌟 𝐆𝐑𝐎𝐔𝐏 𝐈𝐍𝐅𝐎 』─╮*
*┃*  📚 *𝐍𝐚𝐦𝐞:* ${chat.subject}
*┃*  🆔 *𝐈𝐃:* ${chat.id}
*┃*  👥 *𝐏𝐚𝐫𝐭𝐢𝐜𝐢𝐩𝐚𝐧𝐭𝐬:* ${chat.participants.length}
*┃*  🗓️ *𝐂𝐫𝐞𝐚𝐭𝐢𝐨𝐧 𝐃𝐚𝐭𝐞:* ${creationDate}
*┃*  📝 *𝐃𝐞𝐬𝐜𝐫𝐢𝐩𝐭𝐢𝐨𝐧:* ${chat.desc ? chat.desc.toString() : 'No description'}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('ginfo command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get group info.' }, { quoted: msg });
  }
  break;
}

// ---------------------- AUTORECORDING ----------------------
case 'autorecoding': {
  try { await socket.sendMessage(sender, { react: { text: "🎌", key: msg.key } }); } catch(e){}

  try {
    const currentState = config.AUTO_RECORDING === 'true';
    config.AUTO_RECORDING = currentState ? 'false' : 'true'; // Toggle state

    const statusMessage = config.AUTO_RECORDING === 'true' ? 'enabled' : 'disabled';

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('autorecoding: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎌 𝐀𝐔𝐓𝐎-𝐑𝐄𝐂𝐎𝐑𝐃𝐈𝐍𝐆 』─╮*
*┃*  ⚙️ Auto-recording has been *${statusMessage}* for this session.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('autorecoding command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to toggle auto-recording.' }, { quoted: msg });
  }
  break;
}

// Helper function for fancy text (simple example)
function toFancyText(text) {
  const mapping = {
    'a': '𝔞', 'b': '𝔟', 'c': '𝔠', 'd': '𝔡', 'e': '𝔢', 'f': '𝔣', 'g': '𝔤', 'h': '𝔥', 'i': '𝔦', 'j': '𝔧', 'k': '𝔨', 'l': '𝔩', 'm': '𝔪',
    'n': '𝔫', 'o': '𝔬', 'p': '𝔭', 'q': '𝔮', 'r': '𝔯', 's': '𝔰', 't': '𝔱', 'u': '𝔲', 'v': '𝔳', 'w': '𝔴', 'x': '𝔵', 'y': '𝔶', 'z': '𝔷',
    'A': '𝔄', 'B': '𝔅', 'C': 'ℭ', 'D': '𝔇', 'E': '𝔈', 'F': '𝔉', 'G': '𝔊', 'H': 'ℌ', 'I': 'ℑ', 'J': '𝔍', 'K': '𝔎', 'L': '𝔏', 'M': '𝔐',
    'N': '𝔑', 'O': '𝔒', 'P': '𝔓', 'Q': '𝔔', 'R': 'ℜ', 'S': '𝔖', 'T': '𝔗', 'U': '𝔘', 'V': '𝔙', 'W': '𝔚', 'X': '𝔛', 'Y': '𝔜', 'Z': '𝔝'
  };
  return text.split('').map(char => mapping[char] || char).join('');
}

// ---------------------- FANCY ----------------------
case 'fancy': {
  try { await socket.sendMessage(sender, { react: { text: "✨", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to make fancy.* Example: *.fancy Hello World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const fancyText = toFancyText(inputText);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('fancy: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ✨ 𝐅𝐀𝐍𝐂𝐘 𝐓𝐄𝐗𝐓 』─╮*
*┃*  Original: ${inputText}
*┃*  Fancy:    ${fancyText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('fancy command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to convert text to fancy.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SCREENSHOT ----------------------
case 'screenshot': {
  try { await socket.sendMessage(sender, { react: { text: "📸", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('screenshot: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ♻️ SCREENSHOT COMMAND 』─╮*
*┃*  📸 To get a screenshot of a webpage, use:
*┃*     *.screenshot [URL]*
*┃*  📚 Example: *.screenshot https://www.google.com*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('screenshot command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get screenshot.' }, { quoted: msg });
  }
  break;
}

// ---------------------- GJID ----------------------
case 'gjid': {
  try { await socket.sendMessage(sender, { react: { text: "🎉", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('gjid: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎉 𝐆𝐑𝐎𝐔𝐏 𝐉𝐈𝐃 』─╮*
*┃*  *Group JID:* ${from}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('gjid command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get Group JID.' }, { quoted: msg });
  }
  break;
}

// ---------------------- PP ----------------------
case 'pp': {
  try { await socket.sendMessage(sender, { react: { text: "🌟", key: msg.key } }); } catch(e){}

  try {
    let targetJid = sender;
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    }

    const profilePicUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);

    if (!profilePicUrl) {
      await socket.sendMessage(sender, { text: `*Could not retrieve profile picture for ${targetJid.split('@')[0]}.*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('pp: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;

    await socket.sendMessage(sender, {
      image: { url: profilePicUrl },
      caption: `*Profile Picture for ${targetJid.split('@')[0]}*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('pp command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get profile picture.' }, { quoted: msg });
  }
  break;
}

// ---------------------- LOGO ----------------------
case 'logo': {
  try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('logo: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎨 LOGO COMMAND 』─╮*
*┃*  ✨ To generate a logo, use:
*┃*     *.logo [your_text]*
*┃*  📚 Example: *.logo My Awesome Bot*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('logo command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to generate logo.' }, { quoted: msg });
  }
  break;
}

case 'dice': {
  try { await socket.sendMessage(sender, { react: { text: "🎲", key: msg.key } }); } catch(e){}

  try {
    const roll = Math.floor(Math.random() * 6) + 1;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('dice: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎲 𝐃𝐈𝐂𝐄 𝐑𝐎𝐋𝐋 』─╮*
*┃*  You rolled a: *${roll}*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('dice command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to roll the dice.' }, { quoted: msg });
  }
  break;
}

// ---------------------- QR ----------------------
case 'qr': {
  try { await socket.sendMessage(sender, { react: { text: "📱", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('qr: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📱 QR 𝐂𝐎𝐃𝐄 𝐆𝐄𝐍𝐄𝐑𝐀𝐓𝐎𝐑 』─╮*
*┃*  ✨ To generate a QR code, use:
*┃*     *.qr [your_text_or_url]*
*┃*  📚 Example: *.qr Hello World*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('qr command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to generate QR code.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DECODE ----------------------
case 'decode': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('decode: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 DECODE COMMAND 』─╮*
*┃*  🔑 To decode a string, use:
*┃*     *.decode [text_to_decode]*
*┃*  📚 Example: *.decode %20Hello%20World%20*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('decode command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to decode text.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ENCODE ----------------------
case 'encode': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('encode: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 ENCODE COMMAND 』─╮*
*┃*  🔑 To encode a string, use:
*┃*     *.encode [text_to_encode]*
*┃*  📚 Example: *.encode Hello World*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('encode command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to encode text.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ENCODEBASE64 ----------------------
case 'encodebase64': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to encode to Base64.* Example: *.encodebase64 Hello World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const encodedText = Buffer.from(inputText).toString('base64');

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('encodebase64: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 𝐁𝐀𝐒𝐄𝟔𝟒 𝐄𝐍𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Encoded:  ${encodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('encodebase64 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to encode to Base64.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DECODEBASE64 ----------------------
case 'decodebase64': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a Base64 string to decode.* Example: *.decodebase64 SGVsbG8gV29ybGQ=*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    let decodedText;
    try {
      decodedText = Buffer.from(inputText, 'base64').toString('utf8');
    } catch (error) {
      await socket.sendMessage(sender, { text: `*Invalid Base64 string.* Please provide a valid Base64 encoded text.`, footer: `Error: ${error.message}` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('decodebase64: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 𝐁𝐀𝐒𝐄𝟔𝟒 𝐃𝐄𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Decoded:  ${decodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('decodebase64 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to decode Base64.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ENCODEHEX ----------------------
case 'encodehex': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to encode to Hex.* Example: *.encodehex Hello World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const encodedText = Buffer.from(inputText).toString('hex');

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('encodehex: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 𝐇𝐄𝐗 𝐄𝐍𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Encoded:  ${encodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('encodehex command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to encode to Hex.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DECODEHEX ----------------------
case 'decodehex': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a Hex string to decode.* Example: *.decodehex 48656c6c6f20576f726c64*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    let decodedText;
    try {
      decodedText = Buffer.from(inputText, 'hex').toString('utf8');
    } catch (error) {
      await socket.sendMessage(sender, { text: `*Invalid Hex string.* Please provide a valid Hex encoded text.`, footer: `Error: ${error.message}` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('decodehex: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 𝐇𝐄𝐗 𝐃𝐄𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Decoded:  ${decodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('decodehex command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to decode Hex.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ENCODEREV ----------------------
case 'encoderev': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to reverse.* Example: *.encoderev Hello World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const reversedText = inputText.split('').reverse().join('');

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('encoderev: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 𝐑𝐄𝐕𝐄𝐑𝐒𝐄 𝐄𝐍𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Reversed: ${reversedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('encoderev command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to reverse text.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DECODEREV ----------------------
case 'decoderev': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to reverse.* Example: *.decoderev dlrow olleH*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const reversedText = inputText.split('').reverse().join('');

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('decoderev: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 𝐑𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐄𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Decoded:  ${reversedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('decoderev command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to reverse text.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ENCRYPT ----------------------
case 'encrypt': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('encrypt: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 ENCRYPT COMMAND 』─╮*
*┃*  🔒 To encrypt a string, use:
*┃*     *.encrypt [text_to_encrypt] [key]*
*┃*  📚 Example: *.encrypt secretmessage 5*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('encrypt command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to encrypt text.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DECRYPT ----------------------
case 'decrypt': {
  try { await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('decrypt: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🚀 DECRYPT COMMAND 』─╮*
*┃*  🔓 To decrypt a string, use:
*┃*     *.decrypt [encrypted_text] [key]*
*┃*  📚 Example: *.decrypt secRetMssg 5*
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('decrypt command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to decrypt text.' }, { quoted: msg });
  }
  break;
}




// ---------------------- LOGO COMMANDS ----------------------
case 'naruto':
case 'arena':
case 'hacker':
case 'mechanical':
case 'incandescent':
case 'gold':
case 'sand':
case 'sunset':
case 'water':
case 'rain':
case 'chocolate':
case 'graffiti':
case 'boom':
case 'purple':
case 'cloth':
case '1917':
case 'child':
case 'cat': {
    try {
        const reactions = {
            naruto: "🌀", arena: "⚔️", hacker: "💻", mechanical: "⚙️", incandescent: "💡",
            gold: "🏆", sand: "🏖️", sunset: "🌅", water: "💧", rain: "🌧️",
            chocolate: "🍫", graffiti: "🎨", boom: "💥", purple: "🟣", cloth: "👕",
            "1917": "🎬", child: "👶", cat: "🐱"
        };
        await socket.sendMessage(sender, { react: { text: reactions[command] || "🎨", key: msg.key } });
    } catch (e) {}

    try {
        if (!args.length) {
            await socket.sendMessage(sender, { text: `*Please provide text for the ${command} logo.* Example: *.${command} your_text*` }, { quoted: msg });
            return;
        }

        const text = args.join(' ');
        const DEEPAI_API_KEY = 'YOUR_DEEPAI_API_KEY'; // Replace with your DeepAI API key

        const prompts = {
            naruto: `a Naruto-themed logo with the text "${text}"`,
            arena: `an epic arena-themed logo with the text "${text}"`,
            hacker: `a hacker-themed logo with green matrix-style text saying "${text}"`,
            mechanical: `a mechanical-themed logo with cogs and gears with the text "${text}"`,
            incandescent: `an incandescent lightbulb-themed logo with the text "${text}"`,
            gold: `a logo made of gold with the text "${text}"`,
            sand: `a logo made of sand on a beach with the text "${text}"`,
            sunset: `a logo with a sunset background and the text "${text}"`,
            water: `a logo made of water with the text "${text}"`,
            rain: `a logo with a rainy background and the text "${text}"`,
            chocolate: `a logo made of chocolate with the text "${text}"`,
            graffiti: `a graffiti-style logo with the text "${text}"`,
            boom: `an explosion-themed logo with the text "${text}"`,
            purple: `a purple-themed logo with the text "${text}"`,
            cloth: `a logo made of cloth with the text "${text}"`,
            "1917": `a logo in the style of the movie 1917 with the text "${text}"`,
            child: `a childish-themed logo with the text "${text}"`,
            cat: `a cute cat-themed logo with the text "${text}"`
        };

        const response = await axios.post('https://api.deepai.org/api/text2img', {
            text: prompts[command],
        }, {
            headers: {
                'api-key': DEEPAI_API_KEY
            }
        });

        const imageUrl = response.data.output_url;

        await socket.sendMessage(sender, {
            image: { url: imageUrl },
            caption: `*Here's your ${command} logo with the text: ${text}*`,
            footer: config.BOT_FOOTER,
        }, { quoted: msg });

    } catch (e) {
        console.error(`${command} command error:`, e);
        await socket.sendMessage(sender, { text: `❌ Failed to generate ${command} logo.` }, { quoted: msg });
    }
    break;
}

// ---------------------- TYPO LOGO ----------------------
case 'typo': {
  try { await socket.sendMessage(sender, { react: { text: "📝", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text for the typo logo.* Example: *.typo creative*` }, { quoted: msg });
      return;
    }

    const text = args.join(' ');
    const DEEPAI_API_KEY = 'YOUR_DEEPAI_API_KEY'; // Replace with your DeepAI API key

    const response = await axios.post('https://api.deepai.org/api/text2img', {
        text: `a typography-focused logo with the text "${text}"`,
    }, {
        headers: {
            'api-key': DEEPAI_API_KEY
        }
    });

    const imageUrl = response.data.output_url;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*Here's your typography logo with the text: ${text}*`,
      footer: config.BOT_FOOTER,
    }, { quoted: msg });

  } catch(e) {
    console.error('typo command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to generate typo logo.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DRAGONBALL LOGO ----------------------
case 'dragonball': {
  try { await socket.sendMessage(sender, { react: { text: "🐉", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text for the Dragonball logo.* Example: *.dragonball Son Goku*` }, { quoted: msg });
      return;
    }

    const text = args.join(' ');
    const DEEPAI_API_KEY = 'YOUR_DEEPAI_API_KEY'; // Replace with your DeepAI API key

    const response = await axios.post('https://api.deepai.org/api/text2img', {
        text: `a Dragonball Z themed logo with the text "${text}"`,
    }, {
        headers: {
            'api-key': DEEPAI_API_KEY
        }
    });

    const imageUrl = response.data.output_url;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*Here's your Dragonball logo with the text: ${text}*`,
      footer: config.BOT_FOOTER,
    }, { quoted: msg });

  } catch(e) {
    console.error('dragonball command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to generate Dragonball logo.' }, { quoted: msg });
  }
  break;
}




































// ---------------------- STICKER COMMAND ----------------------
case 'sticker': {
  try { await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } }); } catch(e){}

  try {
    let imageBuffer;
    if (msg.message.imageMessage) {
      imageBuffer = await downloadContentFromMessage(msg.message.imageMessage, 'image');
    } else if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
      imageBuffer = await downloadContentFromMessage(msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage, 'image');
    } else if (args.length > 0 && String(args[0]).startsWith('http')) {
      try {
        const response = await axios.get(args[0], { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data);
      } catch (axiosError) {
        console.error('Sticker: Failed to download image from URL:', axiosError);
        await socket.sendMessage(sender, { text: `*Failed to download image from the provided URL. Please ensure it's a direct link to an image.*` }, { quoted: msg });
        return;
      }
    }

    if (!imageBuffer) {
      await socket.sendMessage(sender, { text: `*Please quote an image or provide an image URL to create a sticker.*` }, { quoted: msg });
      return;
    }

    await socket.sendMessage(sender, { text: `*Creating sticker...*` }, { quoted: msg });

    const jimpImage = await Jimp.read(imageBuffer);
    const stickerBuffer = await jimpImage.resize(512, 512).getBufferAsync(Jimp.MIME_PNG); // Standard sticker size

    await socket.sendMessage(sender, { sticker: stickerBuffer }, { quoted: msg });

  } catch(e) {
    console.error('sticker command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to create sticker. Ensure the image is valid.' }, { quoted: msg });
  }
  break;
}

// ---------------------- TS COMMAND (Placeholder for clarification) ----------------------
case 'ts': {
  try { await socket.sendMessage(sender, { react: { text: "🎬", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('ts: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎬 𝐓𝐒 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』─╮*
*┃*  This command's functionality is ambiguous.
*┃*  Please clarify what this command should do (e.g., Text Summary, Video Timestamp, etc.).
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('ts command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process ts command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- TEXT-TO-SPEECH COMMAND (Placeholder) ----------------------
case 'tts': {
  try { await socket.sendMessage(sender, { react: { text: "🗣️", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to convert to speech.* Example: *.tts Hello, how are you?*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('tts: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🗣️ 𝐓𝐄𝐗𝐓-𝐓𝐎-𝐒𝐏𝐄𝐄𝐂𝐇 』─╮*
*┃*  This command is for converting text to speech.
*┃*  Full implementation is pending due to the complexities of
*┃*  finding a stable and free TTS API for direct audio output.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('tts command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process TTS command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- VV COMMAND (Download and Forward View Once Media) ----------------------
case 'vv': {
  try { await socket.sendMessage(sender, { react: { text: "🐣", key: msg.key } }); } catch(e){}

  try {
    const quotedMessage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMessage) {
      await socket.sendMessage(sender, { text: `*Please quote a view once message (image, video, or audio) to use this command.*` }, { quoted: msg });
      return;
    }

    const quotedType = getContentType(quotedMessage);

    if (quotedType !== 'viewOnceMessage') {
        await socket.sendMessage(sender, { text: `*The quoted message is not a view once message.*` }, { quoted: msg });
        return;
    }

    await socket.sendMessage(sender, { text: `*Downloading view once media...*` }, { quoted: msg });

    // The actual view once message is nested deeper
    const actualViewOnceMessage = quotedMessage.viewOnceMessage?.message;
    const actualMediaType = getContentType(actualViewOnceMessage);

    let mediaBuffer;
    let messageType;

    if (actualMediaType === 'imageMessage') {
      mediaBuffer = await downloadContentFromMessage(actualViewOnceMessage.imageMessage, 'image');
      messageType = 'image';
    } else if (actualMediaType === 'videoMessage') {
      mediaBuffer = await downloadContentFromMessage(actualViewOnceMessage.videoMessage, 'video');
      messageType = 'video';
    } else if (actualMediaType === 'audioMessage') {
      mediaBuffer = await downloadContentFromMessage(actualViewOnceMessage.audioMessage, 'audio');
      messageType = 'audio';
    } else {
      await socket.sendMessage(sender, { text: `*Unsupported view once media type.*` }, { quoted: msg });
      return;
    }

    if (!mediaBuffer) {
      throw new Error('Failed to download view once media.');
    }

    if (messageType === 'image') {
        await socket.sendMessage(sender, { image: mediaBuffer, caption: `*View Once Image (Forwarded)*` }, { quoted: msg });
    } else if (messageType === 'video') {
        await socket.sendMessage(sender, { video: mediaBuffer, caption: `*View Once Video (Forwarded)*` }, { quoted: msg });
    } else if (messageType === 'audio') {
        await socket.sendMessage(sender, { audio: mediaBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg }); // ptt: Push to Talk for voice notes
    }


  } catch(e) {
    console.error('vv command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process view once command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- VIEWONCE COMMAND (Placeholder) ----------------------
case 'viewonce': {
  try { await socket.sendMessage(sender, { react: { text: "👀", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('viewonce: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 👀 𝐕𝐈𝐄𝐖 𝐎𝐍𝐂𝐄 𝐇𝐀𝐍𝐃𝐋𝐄𝐑 』─╮*
*┃*  This command is intended to handle WhatsApp "view once" messages.
*┃*  Full implementation to download and resend the media is pending.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('viewonce command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process viewonce command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- AI IMAGE GENERATION COMMAND ----------------------
case 'aiimg': {
  try { await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a text prompt for AI image generation.* Example: *.aiimg a cat riding a skateboard*` }, { quoted: msg });
      return;
    }

    const prompt = args.join(' ');
    const DEEPAI_API_KEY = 'YOUR_DEEPAI_API_KEY'; // Replace with your DeepAI API key

    if (DEEPAI_API_KEY === 'YOUR_DEEPAI_API_KEY') {
      await socket.sendMessage(sender, { text: `*Please set your DeepAI API key in pair.js to use this command.*` }, { quoted: msg });
      return;
    }

    await socket.sendMessage(sender, { text: `*Generating image for "${prompt}"... This may take a moment.*` }, { quoted: msg });

    const response = await axios.post('https://api.deepai.org/api/text2img', {
        text: prompt,
    }, {
        headers: {
            'api-key': DEEPAI_API_KEY
        }
    });

    const imageUrl = response.data.output_url;

    if (imageUrl) {
      await socket.sendMessage(sender, {
        image: { url: imageUrl },
        caption: `*Here's your AI-generated image for: ${prompt}*`,
        footer: config.BOT_FOOTER,
      }, { quoted: msg });
    } else {
      throw new Error('No image URL received from DeepAI');
    }

  } catch(e) {
    console.error('aiimg command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to generate AI image. Make sure your DeepAI API key is correct.' }, { quoted: msg });
  }
  break;
}

// ---------------------- INSTAGRAM DOWNLOAD COMMAND (Placeholder) ----------------------
case 'ig': {
  try { await socket.sendMessage(sender, { react: { text: "📸", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide an Instagram post or reel URL to download.* Example: *.ig https://www.instagram.com/p/abcdefg/*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('ig: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📸 𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 』─╮*
*┃*  This command is for downloading Instagram media.
*┃*  Full implementation is pending due to the complexities of
*┃*  finding a stable and free Instagram download API.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('ig command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process Instagram download command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- FACEBOOK VIDEO DOWNLOAD COMMAND (Placeholder) ----------------------
case 'fb': {
  try { await socket.sendMessage(sender, { react: { text: "📘", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a Facebook video URL to download.* Example: *.fb https://www.facebook.com/watch?v=123456789*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('fb: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📘 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 』─╮*
*┃*  This command is for downloading Facebook videos.
*┃*  Full implementation is pending due to the complexities of
*┃*  finding a stable and free Facebook video download API.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('fb command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process Facebook download command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- YOUTUBE SEARCH COMMAND ----------------------
case 'yts': {
  try { await socket.sendMessage(sender, { react: { text: "📜", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a search query for YouTube.* Example: *.yts latest music videos*` }, { quoted: msg });
      return;
    }

    const query = args.join(' ');
    await socket.sendMessage(sender, { text: `*Searching YouTube for "${query}"...*` }, { quoted: msg });

    const yts = require('yt-search');
    const r = await yts(query);
    const videos = r.videos.slice(0, 5); // Get top 5 results

    if (!videos || videos.length === 0) {
      await socket.sendMessage(sender, { text: `*No YouTube videos found for "${query}".*` }, { quoted: msg });
      return;
    }

    let searchResults = `*╭─『 📜 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒 』─╮*\n\n`;
    videos.forEach((video, index) => {
      searchResults += `*┃* ${index + 1}. *${video.title}*\n`;
      searchResults += `*┃*    URL: ${video.url}\n`;
      searchResults += `*┃*    Duration: ${video.duration}\n`;
      searchResults += `*┃*    Views: ${video.views}\n\n`;
    });
    searchResults += `*╰──────────────⊷*\n`;

    await socket.sendMessage(sender, {
      text: searchResults,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('yts command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to perform YouTube search.' }, { quoted: msg });
  }
  break;
}

// ---------------------- PLAY COMMAND (YouTube Audio/Video) ----------------------
case 'play': {
  try { await socket.sendMessage(sender, { react: { text: "🎊", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a song name or YouTube URL to play.* Example: *.play Imagine Dragons - Believer*` }, { quoted: msg });
      return;
    }

    const query = args.join(' ');
    let youtubeVideoUrl;
    let songTitle;
    let thumbnailUrl;

    // Check if it's a YouTube URL
    const youtubeUrlRegex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = query.match(youtubeUrlRegex);

    if (match) {
        youtubeVideoUrl = query; // Use the provided URL directly
    } else {
        await socket.sendMessage(sender, { text: `*Searching for "${query}" on YouTube...*` }, { quoted: msg });
        const yts = require('yt-search');
        const r = await yts(query);
        const videos = r.videos;

        if (!videos || videos.length === 0) {
            await socket.sendMessage(sender, { text: `*No results found for "${query}".*` }, { quoted: msg });
            return;
        }
        youtubeVideoUrl = videos[0].url; // Use the URL of the first search result
        songTitle = videos[0].title;
        thumbnailUrl = videos[0].thumbnail;
    }

    await socket.sendMessage(sender, { text: `*Fetching audio from ${youtubeVideoUrl}...*` }, { quoted: msg });

    const encodedYoutubeUrl = encodeURIComponent(youtubeVideoUrl);
    const apiUrl = `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodedYoutubeUrl}&quality=128kbps`;

    const apiResponse = await axios.get(apiUrl);
    const apiData = apiResponse.data;

    if (!apiData || apiData.status !== true || !apiData.result || !apiData.result.url) {
        throw new Error(`API Error: ${apiData.message || 'Unknown API response'}`);
    }

    const audioDownloadUrl = apiData.result.url;
    const titleFromApi = apiData.result.title || songTitle || 'Unknown Track';
    const thumbnailFromApi = apiData.result.thumbnail || thumbnailUrl;


    // Fetch audio buffer
    const audioResponse = await axios.get(audioDownloadUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioResponse.data);

    let thumbnailBuffer = null;
    if (thumbnailFromApi) {
        try {
            const thumbResponse = await axios.get(thumbnailFromApi, { responseType: 'arraybuffer' });
            thumbnailBuffer = Buffer.from(thumbResponse.data);
        } catch (thumbError) {
            console.warn('Failed to fetch thumbnail from API:', thumbError.message);
        }
    }

    await socket.sendMessage(sender, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${titleFromApi}.mp3`,
      jpegThumbnail: thumbnailBuffer, // Attach thumbnail here
      contextInfo: {
        mentionedJid: [sender]
      }
    }, { quoted: msg });

  } catch(e) {
    console.error('play command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to play the audio. Ensure it\'s a valid YouTube link or a searchable title.' }, { quoted: msg });
  }
  break;
}

// ---------------------- TIKTOK COMMAND (Placeholder) ----------------------
case 'tiktok': {
  try { await socket.sendMessage(sender, { react: { text: "📱", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a TikTok video URL to download.* Example: *.tiktok https://www.tiktok.com/@username/video/123456789*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('tiktok: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📱 𝐓𝐈𝐊𝐓𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 』─╮*
*┃*  This command is for downloading TikTok videos.
*┃*  Full implementation is pending due to the complexities of
*┃*  finding a stable and free TikTok download API.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('tiktok command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process TikTok command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SONG COMMAND ----------------------
case 'song': {
  try { await socket.sendMessage(sender, { react: { text: "🎵", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a song name or YouTube URL to download.* Example: *.song Despacito*` }, { quoted: msg });
      return;
    }

    const query = args.join(' ');
    let audioBuffer;
    let songTitle;

    // Check if it's a YouTube URL
    const youtubeUrlRegex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = query.match(youtubeUrlRegex);

    if (match) {
        const videoId = match[1];
        await socket.sendMessage(sender, { text: `*Downloading audio from YouTube video...*` }, { quoted: msg });
        const ytmp3 = require('denethdev-ytmp3');
        const audioData = await ytmp3.mp3(videoId);
        if (!audioData || !audioData.url) {
            throw new Error('Failed to get audio data from YouTube.');
        }
        const response = await axios.get(audioData.url, { responseType: 'arraybuffer' });
        audioBuffer = Buffer.from(response.data);
        songTitle = audioData.title || 'Unknown Song';
    } else {
        await socket.sendMessage(sender, { text: `*Searching for "${query}" on YouTube...*` }, { quoted: msg });
        const yts = require('yt-search');
        const r = await yts(query);
        const videos = r.videos;

        if (!videos || videos.length === 0) {
            await socket.sendMessage(sender, { text: `*No songs found for "${query}".*` }, { quoted: msg });
            return;
        }

        const firstVideo = videos[0];
        await socket.sendMessage(sender, { text: `*Downloading audio for "${firstVideo.title}"...*` }, { quoted: msg });
        const ytmp3 = require('denethdev-ytmp3');
        const audioData = await ytmp3.mp3(firstVideo.url);
        if (!audioData || !audioData.url) {
            throw new Error('Failed to get audio data from YouTube.');
        }
        const response = await axios.get(audioData.url, { responseType: 'arraybuffer' });
        audioBuffer = Buffer.from(response.data);
        songTitle = firstVideo.title;
    }

    await socket.sendMessage(sender, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${songTitle}.mp3`,
      contextInfo: {
        mentionedJid: [sender]
      }
    }, { quoted: msg });

  } catch(e) {
    console.error('song command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to download the song. Ensure it\'s a valid YouTube link or a searchable song title.' }, { quoted: msg });
  }
  break;
}

// ---------------------- JOIN GROUP COMMAND ----------------------
case 'join': {
  try { await socket.sendMessage(sender, { react: { text: "👤", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a group invite link.* Example: *.join https://chat.whatsapp.com/xxxxxxxxxxxxxx*` }, { quoted: msg });
      return;
    }

    const inviteLink = args[0];
    const inviteCodeMatch = inviteLink.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);

    if (!inviteCodeMatch || inviteCodeMatch.length < 2) {
      await socket.sendMessage(sender, { text: `*Invalid group invite link provided.*` }, { quoted: msg });
      return;
    }

    const inviteCode = inviteCodeMatch[1];
    const response = await socket.groupAcceptInvite(inviteCode);

    if (response && response.gid) {
      await socket.sendMessage(sender, { text: `*Successfully joined the group!*` }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, { text: `*Failed to join the group. The link might be invalid or expired.*` }, { quoted: msg });
    }

  } catch(e) {
    console.error('join command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to join the group.' }, { quoted: msg });
  }
  break;
}

// ---------------------- TAGALL COMMAND ----------------------
case 'tagall': {
  try { await socket.sendMessage(sender, { react: { text: "👥", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const participants = groupMetadata.participants.map(p => p.id);

    let mentions = '';
    for (const participant of participants) {
      mentions += `@${participant.split('@')[0]} `;
    }

    await socket.sendMessage(sender, {
      text: `*╭─『 👥 𝐓𝐀𝐆 𝐀𝐋𝐋 』─╮*\n${mentions.trim()}\n*╰──────────────⊷*`,
      contextInfo: { mentionedJid: participants }
    }, { quoted: msg });

  } catch(e) {
    console.error('tagall command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to tag all members.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DEMOTE COMMAND ----------------------
case 'demote': {
  try { await socket.sendMessage(sender, { react: { text: "😢", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const botId = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;
    const senderIsAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin;

    if (!botIsAdmin) {
      await socket.sendMessage(sender, { text: `*I need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }
    if (!senderIsAdmin) {
      await socket.sendMessage(sender, { text: `*You need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }

    let usersToDemote = [];
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      usersToDemote = msg.message.extendedTextMessage.contextInfo.mentionedJid;
    } else if (args.length > 0) {
      usersToDemote = args.map(arg => arg.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
    } else {
      await socket.sendMessage(sender, { text: `*Please mention user(s) or provide number(s) to demote.* Example: *.demote @user*` }, { quoted: msg });
      return;
    }

    if (usersToDemote.length === 0) {
      await socket.sendMessage(sender, { text: `*No valid user(s) to demote were provided.*` }, { quoted: msg });
      return;
    }

    const response = await socket.groupParticipantsUpdate(from, usersToDemote, 'demote');
    if (response && response.status === 200) {
      await socket.sendMessage(sender, { text: `*Successfully demoted user(s) from administrator.*` }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, { text: `*Failed to demote user(s). They might not be admin, or I lack permissions.*` }, { quoted: msg });
    }

  } catch(e) {
    console.error('demote command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to demote user(s).' }, { quoted: msg });
  }
  break;
}

// ---------------------- PROMOTE COMMAND ----------------------
case 'promote': {
  try { await socket.sendMessage(sender, { react: { text: "👑", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const botId = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;
    const senderIsAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin;

    if (!botIsAdmin) {
      await socket.sendMessage(sender, { text: `*I need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }
    if (!senderIsAdmin) {
      await socket.sendMessage(sender, { text: `*You need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }

    let usersToPromote = [];
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      usersToPromote = msg.message.extendedTextMessage.contextInfo.mentionedJid;
    } else if (args.length > 0) {
      usersToPromote = args.map(arg => arg.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
    } else {
      await socket.sendMessage(sender, { text: `*Please mention user(s) or provide number(s) to promote.* Example: *.promote @user*` }, { quoted: msg });
      return;
    }

    if (usersToPromote.length === 0) {
      await socket.sendMessage(sender, { text: `*No valid user(s) to promote were provided.*` }, { quoted: msg });
      return;
    }

    const response = await socket.groupParticipantsUpdate(from, usersToPromote, 'promote');
    if (response && response.status === 200) {
      await socket.sendMessage(sender, { text: `*Successfully promoted user(s) to administrator.*` }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, { text: `*Failed to promote user(s). They might already be admin, or I lack permissions.*` }, { quoted: msg });
    }

  } catch(e) {
    console.error('promote command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to promote user(s).' }, { quoted: msg });
  }
  break;
}

// ---------------------- CLOSE GROUP COMMAND ----------------------
case 'close': {
  try { await socket.sendMessage(sender, { react: { text: "🔒", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const botId = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

    if (!botIsAdmin) {
      await socket.sendMessage(sender, { text: `*I need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }

    await socket.groupSettingUpdate(from, 'announcement');
    await socket.sendMessage(sender, { text: `*Group is now closed to non-administrators.*` }, { quoted: msg });

  } catch(e) {
    console.error('close command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to close the group.' }, { quoted: msg });
  }
  break;
}

// ---------------------- LEAVE GROUP COMMAND ----------------------
case 'leave': {
  try { await socket.sendMessage(sender, { react: { text: "💠", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    await socket.sendMessage(sender, { text: `*Leaving this group... Goodbye!*` }, { quoted: msg });
    await socket.groupLeave(from);

  } catch(e) {
    console.error('leave command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to leave the group.' }, { quoted: msg });
  }
  break;
}

// ---------------------- OPEN GROUP COMMAND ----------------------
case 'open': {
  try { await socket.sendMessage(sender, { react: { text: "🔓", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const botId = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

    if (!botIsAdmin) {
      await socket.sendMessage(sender, { text: `*I need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }

    await socket.groupSettingUpdate(from, 'not_announcement');
    await socket.sendMessage(sender, { text: `*Group is now open for all participants to send messages.*` }, { quoted: msg });

  } catch(e) {
    console.error('open command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to open the group.' }, { quoted: msg });
  }
  break;
}

// ---------------------- KICK COMMAND ----------------------
case 'kick': {
  try { await socket.sendMessage(sender, { react: { text: "🦶", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const botId = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

    if (!botIsAdmin) {
      await socket.sendMessage(sender, { text: `*I need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }

    let usersToKick = [];
    if (args.length > 0) {
      usersToKick = args.map(arg => arg.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
    } else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      usersToKick = msg.message.extendedTextMessage.contextInfo.mentionedJid;
    } else {
      await socket.sendMessage(sender, { text: `*Please mention user(s) or provide number(s) to kick.* Example: *.kick @user 2547xxxxxxxx*` }, { quoted: msg });
      return;
    }

    if (usersToKick.length === 0) {
      await socket.sendMessage(sender, { text: `*No valid user(s) to kick were provided.*` }, { quoted: msg });
      return;
    }

    const response = await socket.groupParticipantsUpdate(from, usersToKick, 'remove');
    if (response && response.status === 200) {
      await socket.sendMessage(sender, { text: `*Successfully kicked user(s) from the group.*` }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, { text: `*Failed to kick user(s) from the group. They might not be in the group, or I lack permissions.*` }, { quoted: msg });
    }

  } catch(e) {
    console.error('kick command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to kick user(s) from the group.' }, { quoted: msg });
  }
  break;
}

// ---------------------- ADD COMMAND ----------------------
case 'add': {
  try { await socket.sendMessage(sender, { react: { text: "➕", key: msg.key } }); } catch(e){}

  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: `*This command can only be used in a group chat.*` }, { quoted: msg });
      return;
    }

    const groupMetadata = await socket.groupMetadata(from);
    const botId = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

    if (!botIsAdmin) {
      await socket.sendMessage(sender, { text: `*I need to be a group administrator to use this command.*` }, { quoted: msg });
      return;
    }

    let usersToAdd = [];
    if (args.length > 0) {
      usersToAdd = args.map(arg => arg.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
    } else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      usersToAdd = msg.message.extendedTextMessage.contextInfo.mentionedJid;
    } else {
      await socket.sendMessage(sender, { text: `*Please mention user(s) or provide number(s) to add.* Example: *.add 2547xxxxxxxx @user*` }, { quoted: msg });
      return;
    }

    if (usersToAdd.length === 0) {
      await socket.sendMessage(sender, { text: `*No valid user(s) to add were provided.*` }, { quoted: msg });
      return;
    }

    const response = await socket.groupAdd(from, usersToAdd);
    if (response && response.status === 200) {
      await socket.sendMessage(sender, { text: `*Successfully added user(s) to the group.*` }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, { text: `*Failed to add user(s) to the group. They might already be in the group, or I lack permissions.*` }, { quoted: msg });
    }

  } catch(e) {
    console.error('add command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to add user(s) to the group.' }, { quoted: msg });
  }
  break;
}

// ---------------------- FC COMMAND (Placeholder for clarification) ----------------------
case 'fc': {
  try { await socket.sendMessage(sender, { react: { text: "📲", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('fc: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📲 𝐅𝐂 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』─╮*
*┃*  This command's functionality is ambiguous.
*┃*  Please clarify what this command should do (e.g., file converter, football club info, etc.).
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('fc command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process fc command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- APK COMMAND (Placeholder for safety) ----------------------
case 'apk': {
  try { await socket.sendMessage(sender, { react: { text: "📦", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('apk: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📦 𝐀𝐏𝐊 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』─╮*
*┃*  This command is intended for APK-related functionality.
*┃*  Due to safety, security, and legal concerns regarding direct APK downloads,
*┃*  full implementation is pending and requires careful consideration.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('apk command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process apk command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- TOUR2 COMMAND (Placeholder) ----------------------
case 'tourl2': {
  try { await socket.sendMessage(sender, { react: { text: "📤", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('tourl2: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📤 𝐔𝐑𝐋 𝐓𝐎 𝐔𝐑𝐋 𝟐 』─╮*
*┃*  This command is for additional URL-related functionality.
*┃*  Full implementation is pending.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('tourl2 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process tourl2 command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SHORTURL COMMAND ----------------------
case 'shorturl': {
  try { await socket.sendMessage(sender, { react: { text: "🔗", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a URL to shorten.* Example: *.shorturl https://www.example.com*` }, { quoted: msg });
      return;
    }

    const longUrl = args[0];
    if (!longUrl.startsWith('http://') && !longUrl.startsWith('https://')) {
      await socket.sendMessage(sender, { text: `*Please provide a valid URL starting with http:// or https://.*` }, { quoted: msg });
      return;
    }

    const apiUrl = `https://ulvis.net/api.php?url=${encodeURIComponent(longUrl)}`;
    const response = await axios.get(apiUrl);
    const shortenedUrl = response.data.trim(); // Ulvis returns plain text

    if (shortenedUrl && shortenedUrl !== 'Error') {
      await socket.sendMessage(sender, { text: `*Shortened URL:* ${shortenedUrl}` }, { quoted: msg });
    } else {
      throw new Error('Failed to shorten URL');
    }

  } catch(e) {
    console.error('shorturl command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to shorten URL.' }, { quoted: msg });
  }
  break;
}

// ---------------------- WEATHER COMMAND ----------------------
case 'weather': {
  try { await socket.sendMessage(sender, { react: { text: "🌦️", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a location for weather information.* Example: *.weather London*` }, { quoted: msg });
      return;
    }

    const location = args.join(' ');
    const OPENWEATHERMAP_API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY'; // Replace with your OpenWeatherMap API key

    if (OPENWEATHERMAP_API_KEY === 'YOUR_OPENWEATHERMAP_API_KEY') {
      await socket.sendMessage(sender, { text: `*Please set your OpenWeatherMap API key in pair.js to use this command.*` }, { quoted: msg });
      return;
    }

    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
    const response = await axios.get(apiUrl);
    const weatherData = response.data;

    const weatherText = `
*╭─『 🌦️ 𝐖𝐄𝐀𝐓𝐇𝐄𝐑 𝐈𝐍𝐅𝐎 』─╮*
*┃*  *Location:* ${weatherData.name}, ${weatherData.sys.country}
*┃*  *Temperature:* ${weatherData.main.temp}°C
*┃*  *Feels Like:* ${weatherData.main.feels_like}°C
*┃*  *Conditions:* ${weatherData.weather[0].description}
*┃*  *Humidity:* ${weatherData.main.humidity}%
*┃*  *Wind Speed:* ${weatherData.wind.speed} m/s
*╰──────────────⊷*
`;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('weather: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: weatherText,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('weather command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get weather information. Make sure the location is valid and the API key is correct.' }, { quoted: msg });
  }
  break;
}

// ---------------------- DELETEME COMMAND ----------------------
case 'deleteme': {
  try { await socket.sendMessage(sender, { react: { text: "🗑️", key: msg.key } }); } catch(e){}

  try {
    if (!isOwner) {
      await socket.sendMessage(sender, { text: `*This command can only be used by the bot owner.*` }, { quoted: msg });
      return;
    }

    await socket.sendMessage(sender, { text: `*Initiating session deletion and cleanup...*` }, { quoted: msg });
    await deleteSessionAndCleanup(number, socket);
    await socket.sendMessage(sender, { text: `*Session deleted and cleaned up successfully.*` }, { quoted: msg });

  } catch(e) {
    console.error('deleteme command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to delete session.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SETSTATUS COMMAND ----------------------
case 'setstatus': {
  try { await socket.sendMessage(sender, { react: { text: "✍️", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to set as the bot's status.* Example: *.setstatus I am online!*` }, { quoted: msg });
      return;
    }

    const newStatusText = args.join(' ');
    await socket.updateProfileStatus(newStatusText);
    await socket.sendMessage(sender, { text: `*Bot status updated to: "${newStatusText}"*` }, { quoted: msg });

  } catch(e) {
    console.error('setstatus command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to set bot status.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SAVESTATUS COMMAND (Placeholder) ----------------------
case 'savestatus': {
  try { await socket.sendMessage(sender, { react: { text: "💾", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('savestatus: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 💾 𝐒𝐀𝐕𝐄 𝐒𝐓𝐀𝐓𝐔𝐒 』─╮*
*┃*  This command is intended to save WhatsApp statuses.
*┃*  Full implementation for media download and storage is pending.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('savestatus command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process savestatus command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- SEND COMMAND ----------------------
case 'send': {
  try { await socket.sendMessage(sender, { react: { text: "📱", key: msg.key } }); } catch(e){}

  try {
    if (args.length < 2) {
      await socket.sendMessage(sender, { text: `*Please provide a recipient number and a message.* Example: *.send 2547xxxxxxxx Hello there!*` }, { quoted: msg });
      return;
    }

    const recipientNumber = args[0].replace(/[^0-9]/g, ''); // Sanitize number
    const messageToSend = args.slice(1).join(' ');
    const recipientJid = `${recipientNumber}@s.whatsapp.net`;

    if (!recipientNumber || !messageToSend) {
        await socket.sendMessage(sender, { text: `*Invalid recipient number or empty message.*` }, { quoted: msg });
        return;
    }

    await socket.sendMessage(recipientJid, { text: messageToSend });
    await socket.sendMessage(sender, { text: `*Message sent to ${recipientNumber} successfully!*` }, { quoted: msg });

  } catch(e) {
    console.error('send command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send message.' }, { quoted: msg });
  }
  break;
}

// ---------------------- GETPP COMMAND (Alias for .pp) ----------------------
case 'getpp': {
  try { await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } }); } catch(e){}

  try {
    let targetJid = sender;
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    }

    const profilePicUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);

    if (!profilePicUrl) {
      await socket.sendMessage(sender, { text: `*Could not retrieve profile picture for ${targetJid.split('@')[0]}.*` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('getpp: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;

    await socket.sendMessage(sender, {
      image: { url: profilePicUrl },
      caption: `*Profile Picture for ${targetJid.split('@')[0]}*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('getpp command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get profile picture.' }, { quoted: msg });
  }
  break;
}

// ---------------------- BOMB COMMAND (Placeholder for safety) ----------------------
case 'bomb': {
  try { await socket.sendMessage(sender, { react: { text: "💣", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('bomb: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 💣 𝐁𝐎𝐌𝐁 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』─╮*
*┃*  This command is not implemented due to its potentially sensitive nature
*┃*  and for safety and ethical policy reasons.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('bomb command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process bomb command.' }, { quoted: msg });
  }
  break;
}

// ---------------------- WHOIS COMMAND ----------------------
case 'whois': {
  try { await socket.sendMessage(sender, { react: { text: "🔍", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a domain name for Whois lookup.* Example: *.whois example.com*` }, { quoted: msg });
      return;
    }

    const domain = args[0];
    const WHOISXML_API_KEY = 'YOUR_WHOISXML_API_KEY'; // Replace with your WhoisXML API key

    if (WHOISXML_API_KEY === 'YOUR_WHOISXML_API_KEY') {
      await socket.sendMessage(sender, { text: `*Please set your WhoisXML API key in pair.js to use this command.*` }, { quoted: msg });
      return;
    }

    const apiUrl = `https://www.whoisxmlapi.com/whois/api/v1?apiKey=${WHOISXML_API_KEY}&domainName=${domain}`;
    const response = await axios.get(apiUrl);
    const whoisData = response.data;

    let whoisText = `*╭─『 🔍 𝐖𝐇𝐎𝐈𝐒 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍 』─╮*\n`;

    if (whoisData.registrant) {
        whoisText += `*┃*  *Registrant Name:* ${whoisData.registrant.organization || whoisData.registrant.name || 'N/A'}\n`;
        whoisText += `*┃*  *Registrant Email:* ${whoisData.registrant.email || 'N/A'}\n`;
    }
    if (whoisData.registrarName) {
        whoisText += `*┃*  *Registrar:* ${whoisData.registrarName}\n`;
    }
    if (whoisData.createdDate) {
        whoisText += `*┃*  *Created Date:* ${new Date(whoisData.createdDate).toLocaleDateString()}\n`;
    }
    if (whoisData.expiresDate) {
        whoisText += `*┃*  *Expires Date:* ${new Date(whoisData.expiresDate).toLocaleDateString()}\n`;
    }
    if (whoisData.status) {
        whoisText += `*┃*  *Status:* ${whoisData.status}\n`;
    }
    if (whoisData.nameServers && whoisData.nameServers.hostNames) {
        whoisText += `*┃*  *Name Servers:* ${whoisData.nameServers.hostNames.join(', ')}\n`;
    }

    whoisText += `*╰──────────────⊷*\n`;

    await socket.sendMessage(sender, {
      text: whoisText,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('whois command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get Whois information. Make sure the domain is valid and the API key is correct.' }, { quoted: msg });
  }
  break;
}

// ---------------------- WINFO COMMAND ----------------------
case 'winfo': {
  try { await socket.sendMessage(sender, { react: { text: "📊", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('winfo: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📊 𝐖𝐈-𝐅𝐈 𝐈𝐍𝐅𝐎 』─╮*
*┃*  This command is intended to provide Wi-Fi information.
*┃*  Full implementation is pending.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('winfo command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get Wi-Fi info.' }, { quoted: msg });
  }
  break;
}

// ---------------------- AI COMMAND ----------------------
case 'ai': {
  try { await socket.sendMessage(sender, { react: { text: "🤖", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a query for the AI.* Example: *.ai what is the capital of France?*` }, { quoted: msg });
      return;
    }

    const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // Replace with your Google Generative AI API key
    if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
      await socket.sendMessage(sender, { text: `*Please set your Google Generative AI API key in pair.js to use this command.*` }, { quoted: msg });
      return;
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = args.join(' ');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiResponse = response.text();

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('ai: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🤖 𝐆𝐄𝐌𝐈𝐍𝐈 𝐀𝐈 』─╮*
*┃*  *Query:* ${prompt}
*┃*  *Response:* ${aiResponse}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('ai command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get AI response.' }, { quoted: msg });
  }
  break;
}

// ==================== OWNER MENU ====================
case 'owner': {
  try { await socket.sendMessage(sender, { react: { text: "👑", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
  
    const text = `

 \`👑 𝐎𝐖𝐍𝐄𝐑 𝐈𝐍𝐅𝐎 👑\`

╭─ 🧑‍💼 𝐃𝐄𝐓𝐀𝐈𝐋𝐒
│
│ ✦ 𝐍𝐚𝐦𝐞 : ʙʀᴏᴡᴀʏᴇꜱᴜ
│ ✦ 𝐀𝐠𝐞  : 99
│ ✦ 𝐍𝐨.  : +254746432359
│
╰────────✧

`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 },
      
    ];

    const botName = userCfg.botName || '©ʙʀᴏᴡᴀʏᴇꜱᴜ-ᴍɪɴɪ '; // Re-use botName logic
    const logo = userCfg.logo || config.FREE_IMAGE; // Use config.FREE_IMAGE for logo

    let imagePayload;
    if (String(logo).startsWith('http')) imagePayload = { url: logo };
    else {
      try { imagePayload = fs.readFileSync(logo); } catch(e){ imagePayload = { url: config.FREE_IMAGE }; }
    }

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: "👑 𝘖𝘸𝘯𝘦𝘳 𝘐𝘯𝘧𝘰𝘳𝘮𝘢𝘵𝘪𝘰𝘯",
      buttons,
      headerType: 4
    });

  } catch (err) {
    console.error('owner command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show owner info.' }, { quoted: msg }); } catch(e){}
  }
  break;
}
//======== support ========//
// u can remove this case block 
case 'support': {
  const support = config.SUPPORT_NEWSLETTER;
  
  const message = `*🤝 SUPPORT THE DEVELOPER*\n\n` +
                  `If you appreciate this free bot, please add my newsletter:\n\n` +
                  `📢 *${support.name}*\n` +
                  `🔗 ${support.jid}\n` +
                  `📝 ${support.description}\n\n` +
                  `*How to add:*\n` +
                  `1. Edit \`pair.js\`\n` +
                  `2. Find \`DEFAULT_NEWSLETTERS\`\n` +
                  `3. Add this to the array:\n\n` +
                  `\`\`\`json\n` +
                  `{\n` +
                  `  jid: "${support.jid}",\n` +
                  `  emojis: ${JSON.stringify(support.emojis)},\n` +
                  `  name: "${support.name}",\n` +
                  `  description: "${support.description}"\n` +
                  `}\n` +
                  `\`\`\`\n\n` +
                  `*Thank you for your support!* 🙏`;
  
  await socket.sendMessage(sender, { text: message });
  break;
}

case 'generalcommands': {
  try { await socket.sendMessage(sender, { react: { text: "🌐", key: msg.key } }); } catch(e){}

  const generalCommandsText = `
╭─『 🌐 *ɢᴇɴᴇʀᴀʟ ᴄᴏᴍᴍᴀɴᴅs* ─╮
*┃*  🟢 *.alive*
*┃*  🎀 *.image*
*┃*  📜 *.quran*
*┃*  📜 *.surah*
*┃*  🐑 *.wallpaper*
*┃*  📊 *.bot_stats*
*┃*  ⚔️ *.webzip*
*┃*  🧑‍💻 *.calc*
*┃*  🫂 *.members*
*┃*  🎀 *.cal*
*┃*  📜 *.npm*
*┃*  ℹ️ *.bot_info*
*┃*  ℹ️ *.bot_info*
*┃*  📋 *.menu*
*┃*  🎊 *.creact*
*┃*  💠 *.bible*
*┃*  🌸 *.jid*
*┃*  🎀 *.gitclone*
*┃*  🎥 *.video*
*┃*  🔮 *.github*
*┃*  ♻️ *.lyrics*
*┃*  🔰 *.setpp*
*┃*  🔥 *.online*
*┃*  🌟 *.support*
*┃*  🚩 *.blocklist*
*┃*  📜 *.allmenu*
*┃*  🏓 *.ping*
*┃*  🔗 *.pair*
*┃*  🎌 *.tagadmins*
*┃*  🌟 *.ginfo*
*┃*  🎌 *.autorecoding*
*┃*  ✨ *.fancy*
*┃*  ♻️ *.screenshot*
*┃*  🎉 *.gjid*
*┃*  🌟 *.pp*
*┃*  🎨 *.logo*
*┃*  📱 *.qr*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: generalCommandsText });
  break;
}

case 'codingcommands': {
  try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

  const codingCommandsText = `
╭─『 🎨 *ᴄᴏᴅɪɴɢ ᴄᴏᴍᴍᴀɴᴅs* 』─╮

*┃* ⚔️ *unbase64*
*┃* 🧑‍💻 *colour*
*┃* 📜 *pdf*
*┃* 🤖 *encode*
*┃* 🔥 *decode*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: codingCommandsText });
  break;
}

case 'animecommands': {
  try { await socket.sendMessage(sender, { react: { text: "🎭", key: msg.key } }); } catch(e){}

  const animeCommandsText = `
╭─『 🎭 *ᴀɴɪᴍᴇ ᴄᴏᴍᴍᴀɴᴅs* 』─╮
*┃*  😎 *.garl*
*┃*  😎 *.loli*
*┃*  😎 *.imgloli*
*┃*  💫 *.waifu*
*┃*  💫 *.imgwaifu*
*┃*  💫 *.neko*
*┃*  💫 *.imgneko*
*┃*  💕 *.megumin*
*┃*  💕 *.imgmegumin*
*┃*  💫 *.maid*
*┃*  💫 *.imgmaid*
*┃*  😎 *.awoo*
*┃*  😎 *.imgawoo*
*┃*  🧚🏻 *.animegirl*
*┃*  ⛱️ *.anime*
*┃*  🧚‍♀️ *.anime1*
*┃*  🧚‍♀️ *.anime2*
*┃*  🧚‍♀️ *.anime3*
*┃*  🧚‍♀️ *.anime4*
*┃*  🧚‍♀️ *.anime5*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: animeCommandsText });
  break;
}

case 'logocommands': {
  try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

  const logoCommandsText = `
╭─『 🎨 *ʟᴏɢᴏ ᴄᴏᴍᴍᴀɴᴅs* 』─╮
*┃*  🐉 *.dragonball*
*┃*  🌀 *.naruto*
*┃*  ⚔️ *.arena*
*┃*  💻 *.hacker*
*┃*  ⚙️ *.mechanical*
*┃*  💡 *.incandescent*
*┃*  🏆 *.gold*
*┃*  🏖️ *.sand*
*┃*  🌅 *.sunset*
*┃*  💧 *.water*
*┃*  🌧️ *.rain*
*┃*  🍫 *.chocolate*
*┃*  🎨 *.graffiti*
*┃*  💥 *.boom*
*┃*  🟣 *.purple*
*┃*  👕 *.cloth*
*┃*  🎬 *.1917*
*┃*  👶 *.child*
*┃*  🐱 *.cat*
*┃*  📝 *.typo*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: logoCommandsText });
  break;
}

case 'downloads': {
  try { await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } }); } catch(e){}

  const downloadsText = `
*╭────〘 ᴅᴏᴡɴʟᴏᴀᴅs 〙───⊷*
*┃*  🎵 *.song*
*┃*  📱 *.tiktok*
*┃*  🎊 *.play*
*┃*  📜 *.yts*
*┃*  📘 *.fb*
*┃*  📸 *.ig*
*┃*  🎊 *.gitclone*
*┃*  🖼️ *.aiimg*
*┃*  👀 *.viewonce*
*┃*  🐣 *.vv*
*┃*  🗣️ *.tts*
*┃*  🎬 *.ts*
*┃*  🖼️ *.sticker*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: downloadsText });
  break;
}

case 'group': {
  try { await socket.sendMessage(sender, { react: { text: "👥", key: msg.key } }); } catch(e){}

  const groupText = `
*╭────〘 ɢʀᴏᴜᴘ 〙───⊷*
*┃*  ➕ *.add*
*┃*  🦶 *.kick*
*┃*  🔓 *.open*
*┃*  💠 *.leave*
*┃*  🔒 *.close*
*┃*  👑 *.promote*
*┃*  😢 *.demote*
*┃*  👥 *.tagall*
*┃*  👤 *.join*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: groupText });
  break;
}

case 'games': {
  try { await socket.sendMessage(sender, { react: { text: "🎮", key: msg.key } }); } catch(e){}

  const gamesText = `
*╭────〘 ɢᴀᴍᴇs 〙───⊷*
*┃*  📰 *.news*
*┃*  🚀 *.nasa*
*┃*  💬 *.gossip*
*┃*  🏏 *.cricket*
*┃*  🎭 *.anonymous*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: gamesText });
  break;
}

case 'fun': {
  try { await socket.sendMessage(sender, { react: { text: "😂", key: msg.key } }); } catch(e){}

  const funText = `
*╭────〘 ғᴜɴ 〙───⊷*
*┃*  😂 *.joke*
*┃*  💀 *.dare*
*┃*  🌟 *.readmore*
*┃*  🎌 *.flirt*
*┃*  🌚 *.darkjoke*
*┃*  🏏 *.waifu*
*┃*  😂 *.meme*
*┃*  🐈 *.cat*
*┃*  🐕 *.dog*
*┃*  💡 *.fact*
*┃*  💘 *.pickupline*
*┃*  🔥 *.roast*
*┃*  ❤️ *.lovequote*
*┃*  💭 *.quote*
*┃*  🎲 *.dice*
*╰──────────────⊷*
`;;
  await socket.sendMessage(sender, { text: funText });
  break;
}

case 'aimenu': {
  try { await socket.sendMessage(sender, { react: { text: "🤖", key: msg.key } }); } catch(e){}

  const aiMenuText = `
*╭────〘 ᴀɪ ᴍᴇɴᴜ 〙───⊷*
*┃*  🤖 *.ai*
*┃*  📊 *.winfo*
*┃*  🔍 *.whois*
*┃*  💣 *.bomb*
*┃*  🖼️ *.getpp*
*┃*  📱 *.send*
*┃*  💾 *.savestatus*
*┃*  ✍️ *.setstatus*
*┃*  🗑️ *.deleteme*
*┃*  🌦️ *.weather*
*┃*  🔗 *.shorturl*
*┃*  📤 *.tourl2*
*┃*  📦 *.apk*
*┃*  📲 *.fc*
*╰──────────────⊷*
`;
  await socket.sendMessage(sender, { text: aiMenuText });
  break;
}

case 'joke': {
  try { await socket.sendMessage(sender, { react: { text: "😂", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://v2.jokeapi.dev/joke/Any?blacklistFlags=racist,sexist,explicit&type=single');
    const joke = response.data.joke;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('joke: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 😂 𝐉𝐎𝐊𝐄 』─╮*
*┃*  ${joke}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('joke command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a joke.' }, { quoted: msg });
  }
  break;
}
case 'dare': {
  try { await socket.sendMessage(sender, { react: { text: "💀", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.truthordarebot.xyz/api/dare'); // Using a simple public API
    const dare = response.data.question; // Assuming the dare is in a 'question' field

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('dare: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 💀 𝐃𝐀𝐑𝐄 』─╮*
*┃*  ${dare}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('dare command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a dare.' }, { quoted: msg });
  }
  break;
}
case 'readmore': {
  try { await socket.sendMessage(sender, { react: { text: "🌟", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
    const fact = response.data.text;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('readmore: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🌟 𝐑𝐀𝐍𝐃𝐎𝐌 𝐅𝐀𝐂𝐓 』─╮*
*┃*  ${fact}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('readmore command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a random fact.' }, { quoted: msg });
  }
  break;
}
case 'flirt': {
  try { await socket.sendMessage(sender, { react: { text: "🎌", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://flirty-pickup-lines-api.vercel.app/api/random');
    const pickupLine = response.data.pickupLine || "I'm not a photographer, but I can picture us together."; // Fallback if API response is different

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('flirt: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🎌 𝐅𝐋𝐈𝐑𝐓 』─╮*
*┃*  ${pickupLine}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('flirt command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a flirty message.' }, { quoted: msg });
  }
  break;
}
case 'darkjoke': {
  try { await socket.sendMessage(sender, { react: { text: "🌚", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://v2.jokeapi.dev/joke/Dark?blacklistFlags=racist,sexist,explicit&type=single');
    const darkJoke = response.data.joke;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('darkjoke: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🌚 𝐃𝐀𝐑𝐊 𝐉𝐎𝐊𝐄 』─╮*
*┃*  ${darkJoke}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('darkjoke command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a dark joke.' }, { quoted: msg });
  }
  break;
}
case 'waifu': {
  try { await socket.sendMessage(sender, { react: { text: "🏏", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.waifu.pics/sfw/waifu');
    const imageUrl = response.data.url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('waifu: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💖 𝐖𝐀𝐈𝐅𝐔 』─╮*\n*┃*  Here's your waifu! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('waifu command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a waifu image.' }, { quoted: msg });
  }
  break;
}
case 'meme': {
  try { await socket.sendMessage(sender, { react: { text: "😂", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://meme-api.com/gimme');
    const memeUrl = response.data.url;
    const title = response.data.title;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('meme: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: memeUrl },
      caption: `*╭─『 😂 𝐌𝐄𝐌𝐄 』─╮*\n*┃*  *Title:* ${title}\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('meme command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a meme image.' }, { quoted: msg });
  }
  break;
}
case 'cat': {
  try { await socket.sendMessage(sender, { react: { text: "🐈", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.thecatapi.com/v1/images/search');
    const imageUrl = response.data[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('cat: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🐈 𝐂𝐀𝐓 』─╮*\n*┃*  Meow! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('cat command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a cat image.' }, { quoted: msg });
  }
  break;
}
case 'dog': {
  try { await socket.sendMessage(sender, { react: { text: "🐕", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://random.dog/woof.json');
    const imageUrl = response.data.url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('dog: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🐕 𝐃𝐎𝐆 』─╮*\n*┃*  Woof woof! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('dog command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a dog image.' }, { quoted: msg });
  }
  break;
}
case 'fact': {
  try { await socket.sendMessage(sender, { react: { text: "💡", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
    const fact = response.data.text;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('fact: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 💡 𝐅𝐀𝐂𝐓 』─╮*
*┃*  ${fact}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('fact command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a fact.' }, { quoted: msg });
  }
  break;
}
case 'pickupline': {
  try { await socket.sendMessage(sender, { react: { text: "💘", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://flirty-pickup-lines-api.vercel.app/api/random');
    const pickupLine = response.data.pickupLine || "Do you believe in love at first sight, or should I walk by again?"; // Fallback

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('pickupline: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 💘 𝐏𝐈𝐂𝐊𝐔𝐏 𝐋𝐈𝐍𝐄 』─╮*
*┃*  ${pickupLine}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('pickupline command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a pickup line.' }, { quoted: msg });
  }
  break;
}
case 'roast': {
  try { await socket.sendMessage(sender, { react: { text: "🔥", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.yomomma.info/');
    const roast = response.data.joke;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('roast: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🔥 𝐑𝐎𝐀𝐒𝐓 』─╮*
*┃*  ${roast}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('roast command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a roast.' }, { quoted: msg });
  }
  break;
}
case 'lovequote': {
  try { await socket.sendMessage(sender, { react: { text: "❤️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.quotable.io/quotes/random?tags=love');
    const quote = response.data[0].content;
    const author = response.data[0].author;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('lovequote: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ❤️ 𝐋𝐎𝐕𝐄 𝐐𝐔𝐎𝐓𝐄 』─╮*
*┃*  "${quote}"
*┃*  - ${author}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('lovequote command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a love quote.' }, { quoted: msg });
  }
  break;
}
case 'quote': {
  try { await socket.sendMessage(sender, { react: { text: "💭", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.quotable.io/quotes/random');
    const quote = response.data[0].content;
    const author = response.data[0].author;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('quote: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 💭 𝐐𝐔𝐎𝐓𝐄 』─╮*
*┃*  "${quote}"
*┃*  - ${author}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('quote command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a quote.' }, { quoted: msg });
  }
  break;
}
case 'base64': {
  try { await socket.sendMessage(sender, { react: { text: "🗣️", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to encode to Base64.* Example: *.base64 Hello World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const encodedText = Buffer.from(inputText).toString('base64');

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('base64: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🗣️ 𝐁𝐀𝐒𝐄𝟔𝟒 𝐄𝐍𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Encoded:  ${encodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('base64 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to encode to Base64.' }, { quoted: msg });
  }
  break;
}
case 'unbase64': {
  try { await socket.sendMessage(sender, { react: { text: "⚔️", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide a Base64 string to decode.* Example: *.unbase64 SGVsbG8gV29ybGQ=*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    let decodedText;
    try {
      decodedText = Buffer.from(inputText, 'base64').toString('utf8');
    } catch (error) {
      await socket.sendMessage(sender, { text: `*Invalid Base64 string.* Please provide a valid Base64 encoded text.`, footer: `Error: ${error.message}` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('unbase64: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 ⚔️ 𝐁𝐀𝐒𝐄𝟔𝟒 𝐃𝐄𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Decoded:  ${decodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('unbase64 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to decode Base64.' }, { quoted: msg });
  }
  break;
}
case 'colour': {
  try { await socket.sendMessage(sender, { react: { text: "🧑‍💻", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://www.thecolorapi.com/random');
    const color = response.data;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('colour: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🧑‍💻 𝐑𝐀𝐍𝐃𝐎𝐌 𝐂𝐎𝐋𝐎𝐔𝐑 』─╮*
*┃*  Name:  ${color.name.value}
*┃*  Hex:   ${color.hex.value}
*┃*  RGB:   ${color.rgb.value}
*┃*  HSL:   ${color.hsl.value}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('colour command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch color information.' }, { quoted: msg });
  }
  break;
}
case 'pdf': {
  try { await socket.sendMessage(sender, { react: { text: "📜", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('pdf: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 📜 𝐏𝐃𝐅 𝐆𝐄𝐍𝐄𝐑𝐀𝐓𝐎𝐑 』─╮*
*┃*  To generate a PDF from a URL, use:
*┃*     *.pdf [URL]*
*┃*  📚 Example: *.pdf https://www.example.com*
*┃*  (Note: This is a placeholder. Full PDF generation requires external services.)
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('pdf command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process PDF command.' }, { quoted: msg });
  }
  break;
}
case 'encode': {
  try { await socket.sendMessage(sender, { react: { text: "🤖", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to URL encode.* Example: *.encode Hello World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    const encodedText = encodeURIComponent(inputText);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('encode: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🤖 𝐔𝐑𝐋 𝐄𝐍𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Encoded:  ${encodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('encode command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to URL encode text.' }, { quoted: msg });
  }
  break;
}
case 'decode': {
  try { await socket.sendMessage(sender, { react: { text: "🔥", key: msg.key } }); } catch(e){}

  try {
    if (!args.length) {
      await socket.sendMessage(sender, { text: `*Please provide text to URL decode.* Example: *.decode Hello%20World*` }, { quoted: msg });
      return;
    }

    const inputText = args.join(' ');
    let decodedText;
    try {
      decodedText = decodeURIComponent(inputText);
    } catch (error) {
      await socket.sendMessage(sender, { text: `*Invalid URL encoded string.* Please provide a valid URL encoded text.`, footer: `Error: ${error.message}` }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('decode: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 🔥 𝐔𝐑𝐋 𝐃𝐄𝐂𝐎𝐃𝐄 』─╮*
*┃*  Original: ${inputText}
*┃*  Decoded:  ${decodedText}
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('decode command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to URL decode text.' }, { quoted: msg });
  }
  break;
}
case 'garl': {
  try { await socket.sendMessage(sender, { react: { text: "😎", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekosia.com/api/v1/image'); // Assuming a direct image URL or a field like 'url'
    const imageUrl = response.data.url || response.data.image; // Adjust based on actual API response

    if (!imageUrl) {
      await socket.sendMessage(sender, { text: '❌ Could not retrieve an anime girl image.' }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('garl: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 😎 𝐀𝐍𝐈𝐌𝐄 𝐆𝐈𝐑𝐋 』─╮*\n*┃*  Here's a random anime girl! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('garl command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime girl image.' }, { quoted: msg });
  }
  break;
}
case 'loli': {
  try { await socket.sendMessage(sender, { react: { text: "😎", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('loli: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 😎 𝐋𝐎𝐋𝐈 』─╮*
*┃*  Due to content policies and the sensitive nature of this command,
*┃*  I cannot directly provide "loli" images through an external API.
*┃*  This command is a placeholder. If you wish to implement it,
*┃*  please provide manually curated SFW image URLs.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('loli command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process loli command.' }, { quoted: msg });
  }
  break;
}
case 'imgloli': {
  try { await socket.sendMessage(sender, { react: { text: "😎", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('imgloli: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    const text = `
*╭─『 😎 𝐈𝐌𝐆𝐋𝐎𝐋𝐈 』─╮*
*┃*  Due to content policies and the sensitive nature of this command,
*┃*  I cannot directly provide "loli" images through an external API.
*┃*  This command is a placeholder. If you wish to implement it,
*┃*  please provide manually curated SFW image URLs.
*╰──────────────⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('imgloli command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to process imgloli command.' }, { quoted: msg });
  }
  break;
}
case 'waifu': { // Anime commands waifu
  try { await socket.sendMessage(sender, { react: { text: "💫", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.waifu.pics/sfw/waifu');
    const imageUrl = response.data.url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('waifu_anime: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💫 𝐀𝐍𝐈𝐌𝐄 𝐖𝐀𝐈𝐅𝐔 』─╮*\n*┃*  Here's your anime waifu! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('waifu_anime command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime waifu image.' }, { quoted: msg });
  }
  break;
}
case 'imgwaifu': {
  try { await socket.sendMessage(sender, { react: { text: "💫", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.waifu.pics/sfw/waifu');
    const imageUrl = response.data.url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('imgwaifu: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💫 𝐈𝐌𝐆𝐖𝐀𝐈𝐅𝐔 』─╮*\n*┃*  Here's another waifu image! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('imgwaifu command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an imgwaifu image.' }, { quoted: msg });
  }
  break;
}
case 'neko': {
  try { await socket.sendMessage(sender, { react: { text: "💫", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=neko');
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('neko: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💫 𝐍𝐄𝐊𝐎 』─╮*\n*┃*  Here's a neko for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('neko command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a neko image.' }, { quoted: msg });
  }
  break;
}
case 'imgneko': {
  try { await socket.sendMessage(sender, { react: { text: "💫", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=neko');
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('imgneko: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💫 𝐈𝐌𝐆𝐍𝐄𝐊𝐎 』─╮*\n*┃*  Here's another neko image! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('imgneko command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an imgneko image.' }, { quoted: msg });
  }
  break;
}
case 'megumin': {
  try { await socket.sendMessage(sender, { react: { text: "💕", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.waifu.pics/sfw/megumin');
    const imageUrl = response.data.url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('megumin: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💕 𝐌𝐄𝐆𝐔𝐌𝐈𝐍 』─╮*\n*┃*  Explosion! Here's Megumin! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('megumin command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a Megumin image.' }, { quoted: msg });
  }
  break;
}
case 'imgmegumin': {
  try { await socket.sendMessage(sender, { react: { text: "💕", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://api.waifu.pics/sfw/megumin');
    const imageUrl = response.data.url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('imgmegumin: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💕 𝐈𝐌𝐆𝐌𝐄𝐆𝐔𝐌𝐈𝐍 』─╮*\n*┃*  Here's another Megumin image! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('imgmegumin command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an imgmegumin image.' }, { quoted: msg });
  }
  break;
}
case 'maid': {
  try { await socket.sendMessage(sender, { react: { text: "💫", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=maid');
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('maid: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💫 𝐌𝐀𝐈𝐃 』─╮*\n*┃*  Here's a maid for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('maid command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch a maid image.' }, { quoted: msg });
  }
  break;
}
case 'imgmaid': {
  try { await socket.sendMessage(sender, { react: { text: "💫", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=maid');
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('imgmaid: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 💫 𝐈𝐌𝐆𝐌𝐀𝐈𝐃 』─╮*\n*┃*  Here's another maid image! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('imgmaid command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an imgmaid image.' }, { quoted: msg });
  }
  break;
}
case 'awoo': {
  try { await socket.sendMessage(sender, { react: { text: "😎", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://randomfox.ca/floof/');
    const imageUrl = response.data.image;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('awoo: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 😎 𝐀𝐖𝐎𝐎 』─╮*\n*┃*  Awooo! Here's a fox for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('awoo command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an awoo image.' }, { quoted: msg });
  }
  break;
}
case 'imgawoo': {
  try { await socket.sendMessage(sender, { react: { text: "😎", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://randomfox.ca/floof/');
    const imageUrl = response.data.image;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('imgawoo: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 😎 𝐈𝐌𝐆𝐀𝐖𝐎𝐎 』─╮*\n*┃*  Here's another awoo image! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('imgawoo command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an imgawoo image.' }, { quoted: msg });
  }
  break;
}
case 'animegirl': {
  try { await socket.sendMessage(sender, { react: { text: "🧚🏻", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekosia.com/api/v1/image'); // Reusing Nekosia API
    const imageUrl = response.data.url || response.data.image; // Adjust based on actual API response

    if (!imageUrl) {
      await socket.sendMessage(sender, { text: '❌ Could not retrieve an anime girl image.' }, { quoted: msg });
      return;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('animegirl: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🧚🏻 𝐀𝐍𝐈𝐌𝐄 𝐆𝐈𝐑𝐋 』─╮*\n*┃*  Here's a random anime girl! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('animegirl command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime girl image.' }, { quoted: msg });
  }
  break;
}
case 'anime': {
  try { await socket.sendMessage(sender, { react: { text: "⛱️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=waifu'); // Using waifu as a general anime image type
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('anime: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 ⛱️ 𝐀𝐍𝐈𝐌𝐄 』─╮*\n*┃*  Here's a random anime image! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('anime command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime image.' }, { quoted: msg });
  }
  break;
}
case 'anime1': {
  try { await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=waifu'); // Using waifu as a general anime image type
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('anime1: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🧚‍♀️ 𝐀𝐍𝐈𝐌𝐄 𝐈𝐌𝐀𝐆𝐄 』─╮*\n*┃*  Here's a random anime image for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('anime1 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime image.' }, { quoted: msg });
  }
  break;
}
case 'anime2': {
  try { await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=waifu'); // Using waifu as a general anime image type
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('anime2: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🧚‍♀️ 𝐀𝐍𝐈𝐌𝐄 𝐈𝐌𝐀𝐆𝐄 』─╮*\n*┃*  Here's a random anime image for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('anime2 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime image.' }, { quoted: msg });
  }
  break;
}
case 'anime3': {
  try { await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=waifu'); // Using waifu as a general anime image type
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('anime3: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🧚‍♀️ 𝐀𝐍𝐈𝐌𝐄 𝐈𝐌𝐀𝐆𝐄 』─╮*\n*┃*  Here's a random anime image for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('anime3 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime image.' }, { quoted: msg });
  }
  break;
}
case 'anime4': {
  try { await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=waifu'); // Using waifu as a general anime image type
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('anime4: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🧚‍♀️ 𝐀𝐍𝐈𝐌𝐄 𝐈𝐌𝐀𝐆𝐄 』─╮*\n*┃*  Here's a random anime image for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('anime4 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime image.' }, { quoted: msg });
  }
  break;
}
case 'anime5': {
  try { await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } }); } catch(e){}

  try {
    const response = await axios.get('https://nekos.best/api/v2/random?type=waifu'); // Using waifu as a general anime image type
    const imageUrl = response.data.results[0].url;

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('anime5: failed to load config', e); userCfg = {}; }

    const botName = userCfg.botName || BOT_NAME_FREE;
    const logo = userCfg.logo || config.FREE_IMAGE;

    await socket.sendMessage(sender, {
      image: { url: imageUrl },
      caption: `*╭─『 🧚‍♀️ 𝐀𝐍𝐈𝐌𝐄 𝐈𝐌𝐀𝐆𝐄 』─╮*\n*┃*  Here's a random anime image for you! (via ${botName})\n*╰──────────────⊷*`,
      footer: config.BOT_FOOTER,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }],
      headerType: 4
    });

  } catch(e) {
    console.error('anime5 command error:', e);
    await socket.sendMessage(sender, { text: '❌ Failed to fetch an anime image.' }, { quoted: msg });
  }
  break;
}
        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.FREE_IMAGE }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FREE) }); } catch(e){}
    }

  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    if (config.AUTO_RECORDING === 'true') {
      try { await socket.sendPresenceUpdate('recording', msg.key.remoteJid); } catch (e) {}
    }
  });
}

// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('*💀 OWNER NOTICE — SESSION REMOVED*', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FREE);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.FREE_IMAGE }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g,'')); socketCreationTime.delete(number.replace(/[^0-9]/g,'')); const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; await EmpirePair(number, mockRes); } catch(e){ console.error('Reconnect attempt failed', e); }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Safari')
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        const credsObj = JSON.parse(fileContent);
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
      } catch (err) { console.error('Failed saving creds on creds.update:', err); }
    });


    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          // try follow newsletters if configured
          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          // Load per-session config (botName, logo)
          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FREE;
          const useLogo = userConfig.logo || config.FREE_IMAGE;

          const initialCaption = formatMessage(useBotName,
            `*✅ 𝘊𝘰𝘯𝘯𝘦𝘤𝘵𝘦𝘥 𝘚𝘶𝘤𝘤𝘦𝘴𝘴𝘧𝘶𝘭𝘭𝘺*\n\n*🔢 𝘊𝘩𝘢𝘵 𝘕𝘣:*  ${sanitizedNumber}\n*🕒 𝘛𝘰 𝘊𝘰𝘯𝘯𝘦𝘤𝘵: 𝘉𝘰𝘵 𝘞𝘪𝘭𝘭 𝘉𝘦 𝘜𝘱 𝘈𝘯𝘥 𝘙𝘶𝘯𝘯𝘪𝘯𝘨 𝘐𝘯 𝘈 𝘍𝘦𝘸 𝘔𝘪𝘯𝘶𝘵𝘦𝘴*\n\n✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n*🕒 Connecting: Bot will become active in a few seconds*`,
            useBotName
          );

          // send initial message
          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.FREE_IMAGE }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `*✅ 𝘊𝘰𝘯𝘯𝘦𝘤𝘵𝘦𝘥 𝘚𝘶𝘤𝘤𝘦𝘴𝘴𝘧𝘶𝘭𝘭𝘺,𝘕𝘰𝘞 𝘈𝘤𝘵𝘪𝘷𝘦 ❕*\n\n*🔢 𝘊𝘩𝘢𝘵 𝘕𝘣:* ${sanitizedNumber}\n*📡 Condition:* ${groupStatus}\n*🕒 𝘊𝘰𝘯𝘯𝘦𝘤𝘵𝘦𝘥*: ${getZimbabweanTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          // send admin + owner notifications as before, with session overrides
          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await sendOwnerConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'SENU-MINI-main'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FREE, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getZimbabweanTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FREE, message: '🍬 𝘍𝘳𝘦𝘦 𝘉𝘰𝘵', activesession: activeSockets.size });
});


router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.FREE_IMAGE }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FREE) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || '© ▶ 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃 '}`); } catch(e) { console.error('pm2 restart failed', e); }
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;