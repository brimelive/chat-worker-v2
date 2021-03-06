const amqp = require('amqplib')
const publisher = require('./publisher')
const { customAlphabet } = require("nanoid");
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 20);
const item_xid = customAlphabet(alphabet, 10);
const database = require('./services/database')
const axios = require('axios')
const parseJSON = (json)=>{try{return JSON.parse(json)}catch{return false}}
String.prototype.replaceAll = function(target, value){ return this.replace(new RegExp(target.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), 'g'), value) }
const translate = require("deepl");
const {
    getReplyTarget,
    channelDataLookup,
    chatCommandsLookup,
    channelChatLangs,
    getGif,
    modCheck,
    channelVIPUser,
    vipCheck,
    deleteMessage,
    channelBanUser,
    channelModUser,
    banCheck,
    ownerCheck,
    channelChatClear
} = require('./db')
const {
    parseMentions,
    parseLinks,
    normalizeEmote,
    parseEmotes,
    escapeHTML,
    parseMessage,
} = require('./parsers')

class Consumer{
    constructor(){}
  
    async init({host = process.env.RABBIT_URI, queue = process.env.RABBIT_QUEUE, database}){
      try{
          const connection = await amqp.connect('amqp://worker:Watson334@144.202.25.204')
          const channel = await connection.createChannel()
          await channel.assertQueue(queue, {durable: true})
          console.log(`Connected to queue ${queue}.`)
          this.db = database
          return {channel, connection, queue}
      }catch(err){
          return {error: err}
      }
    }
  
    async consume({channel, queue}){
      const {emqClient, publish} = await publisher.init({idGenerator: ()=>`chat_worker#${customAlphabet(alphabet, 10)()}`})
      const self = this
      // change channel/chat/receive/geeken (static) with channel_ids (send channel info back inside return_message.channel)
      channel.consume(queue, async function(msg) {
          // Parse the message
          const packet = JSON.parse(msg.content.toString());
          console.log(packet)
          const message = parseJSON(packet.payload);
          // decide on how to handle errors
          if(!message){
            console.error(`Message from ${packet.channel} failed JSON parsing.`)
            // publish("self/chat/receive/" + packet.username, {error: 'Invalid message format (JSON parsing error).', type: 'error'})
            return channel.ack(msg)
          }
          if(message.content?.trim() == '' || message.content.trim().toLowerCase() == 'error'){
            // publish("self/chat/receive/" + packet.username, {error: 'Empty messages not allowed.', type: 'error'})
            console.error('Empty message')
            return channel.ack(msg)
          }
          if(message.content.length > 510){
            console.error(`Message length exceeded. Length: ${message.content.length} chars`)
            return channel.ack(msg)
          }
          const u_channel = packet.topic.split('/').pop()
          const isChannelBanned = await banCheck(u_channel, packet.username)
          if(isChannelBanned){
            console.log(`${packet.username} is banned from ${u_channel}`)
            return channel.ack(msg)
        }
          const channelData = await channelDataLookup(u_channel)
          if(!channelData)
          return {error: `Channel ${u_channel} not found.`}
          let {user, error} = await self.db.user.get(packet.username)
          if(error){
            console.error(`User not found`)
            return channel.ack(msg)
          }
          user.is_broadcaster = await ownerCheck(u_channel, user.xid)
          const isMod = await modCheck(channelData.XID, user.xid)
          if(isMod){
            user.is_mod = true
          }
          const isVIP = await vipCheck(channelData.XID, user.xid)
          if(isVIP){
            user.is_vip = true
          }
          const parsedMsg = await parseMessage({message, channel: u_channel})
          if(parsedMsg.type == 'delete'){
              console.log('Received deleted msg request for: '+ parsedMsg.meta.delete.msg_id)
              if(!isMod){
                  console.error('User is not a mod')
                  return channel.ack(msg)
              }else {
                  const linkedXID = await self.db.getLinkedMsgXID(parsedMsg.meta.delete.msg_id)
                  const deleteQuery = await deleteMessage(linkedXID)
                  console.log(deleteQuery)
                  const deleteMsg = {
                    type: 'delete',
                    targetMsg: linkedXID,
                    xid: nanoid(),
                    topic: packet.channel,
                    channel: u_channel,
                    user,
                    timestamp: Date.now(),
                  }
                  publish("channel/chat/receive/" + deleteMsg.channel, deleteMsg)
                  return channel.ack(msg)
              }
          }
          if(parsedMsg.type == 'mod'){
            if(!isMod){
                console.error('User is not a mod')
                return channel.ack(msg)
            }else {
                const userQuery = await database.getUserBySlug(parsedMsg.meta.mod.user)
                const modQuery = await channelModUser(u_channel, userQuery.user.xid, Date.now())
                message.content = `@${userQuery.user.username} has been knighted.`
                const modMsg = {
                  type: 'mod',
                  targetUser: parsedMsg.meta.mod.user,
                  xid: nanoid(),
                  topic: packet.channel,
                  channel: u_channel,
                  user,
                  timestamp: Date.now(),
                  reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
                  content: await parseMessage({message, channel: u_channel})
                }
                publish("channel/chat/receive/" + modMsg.channel, modMsg)
                self.db.message.store(modMsg)
                return channel.ack(msg)
            }
        }
        if(parsedMsg.type == 'vip'){
          if(!isMod){
              console.error('User is not a mod')
              return channel.ack(msg)
          }else {
              const userQuery = await database.getUserBySlug(parsedMsg.meta.vip.user)
              const vipQuery = await channelVIPUser(u_channel, userQuery.user.xid, Date.now())
              message.content = `@${userQuery.user.username} shines bright like a diamond.`
              const vipMsg = {
                type: 'mod',
                targetUser: parsedMsg.meta.vip.user,
                xid: nanoid(),
                topic: packet.channel,
                channel: u_channel,
                user,
                timestamp: Date.now(),
                reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
                content: await parseMessage({message, channel: u_channel})
              }
              publish("channel/chat/receive/" + vipMsg.channel, vipMsg)
              self.db.message.store(vipMsg)
              return channel.ack(msg)
          }
      }
          if(parsedMsg.type == 'ban'){
            if(!isMod){
                console.error('User is not a mod')
                return channel.ack(msg)
            }else {
                const banQuery = await channelBanUser(u_channel, parsedMsg.meta.ban.user, Date.now())
                const userQuery = await database.getUser(parsedMsg.meta.ban.user)
                message.content = `${userQuery.user.username} has been banned from this channel.`
                const banMsg = {
                  type: 'ban',
                  targetUser: parsedMsg.meta.ban.user,
                  xid: nanoid(),
                  topic: packet.channel,
                  channel: u_channel,
                  user,
                  timestamp: Date.now(),
                  reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
                  content: await parseMessage({message, channel: u_channel})
                }
                publish("channel/chat/receive/" + banMsg.channel, banMsg)
                return channel.ack(msg)
            }
        }
        if(parsedMsg.type == 'clear'){
          if(!isMod){
              console.error('User is not a mod')
              return channel.ack(msg)
          }else {
              message.content = `Chat has been cleared`
              const clearMsg = {
                type: 'clear',
                xid: nanoid(),
                topic: packet.channel,
                channel: u_channel,
                user,
                timestamp: Date.now(),
                reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
                content: await parseMessage({message, channel: u_channel})
              }
              publish("channel/chat/receive/" + clearMsg.channel, clearMsg)
              const now = Date.now();
              const rewindTime = now - 3600000
              channelChatClear(u_channel, rewindTime)
              return channel.ack(msg)
          }
      }
        //   if(user.is_banned == 1){
        //     console.error(`User ${packet.username} is banned.`)
        //     user.displayname = 'UNAUTHORIZED'
        //     let banned = {
        //       type: 'text',
        //       raw: 'ERROR: YOUR USER ACCOUNT IS PLATFORM BANNED',
        //       parsed: '<br>YOUR USER ACCOUNT IS PLATFORM BANNED',
        //       rich: {
        //         // type,
        //         // content
        //       },
        //       meta: {
        //         emotes: [],
        //         mentions: [],
        //         links: [],
        //         attachements: []
        //       }
        //     }
        //     const banned_message = {
        //       xid: nanoid(),
        //       topic: `private/${user.xid}`,
        //       channel: user.xid,
        //       user,
        //       timestamp: Date.now(),
        //       content: banned
        //     }
      
        //     publish("private/" + user.xid, banned_message)
        //     return channel.ack(msg)
        //   }
          if(error){
            console.error(error)
            return channel.ack(msg)
          }
  
          const return_message = {
            xid: nanoid(),
            topic: packet.channel,
            channel: u_channel,
            user,
            timestamp: Date.now(),
            reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
            content: parsedMsg
          }
          publish("channel/chat/receive/" + return_message.channel + '/source', return_message)
          const res = await axios.get('http://144.202.25.204:18083/api/v4/routes', {
          // Axios looks for the `auth` option, and, if it is set, formats a
          // basic auth header for you automatically.
          auth: {
          username: process.env.emqx_username,
          password: process.env.emqx_password
          } 
          });
          const emqxTopics = res.data.data
          let channelLangs = [];
          for (let i = 0; i < emqxTopics.length; i++) {
          if (emqxTopics[i].topic.includes(u_channel)) {
          channelLangs.push(emqxTopics[i].topic.replace(/^.*\/(.*)$/, "$1"));
          }}
          // Remove legacy receive topic where no chat lang is set
          channelLangs = channelLangs.filter(a => a !== u_channel)
          channelLangs = [ ...new Set(channelLangs) ];
          channelLangs = channelLangs.filter(a => a !== 'captions')
          channelLangs = channelLangs.filter(a => a !== 'english')
          channelLangs = channelLangs.filter(a => a !== 'source')
          // TRANSLATION STUFF
          function translateMsg(msg, lang) {
           const supportsFormality = [
            "DE",
            "FR", 
            "IT",
            "ES",
            "NL",
            "PL",
            "PT-PT", 
            "PT-BR",
            "RU"
          ]
            let formality
            if (supportsFormality.indexOf(lang) > -1) {
              // Supports formality
              formality = "less"
          } else {
              // Does not support Formality
              formality = "default"
          }
            translate({
              text: msg,
              target_lang: lang,
              auth_key: process.env.deepLKey,
              formality
              // All optional DeepL parameters available in the official documentation can be defined here as well.
          })
          .then(async result => {
              // Send the translated version of the message
              const parsedMsg2 = await parseMessage({message: {content: result.data.translations[0].text, reply_target: message.reply_target}, channel: u_channel})
              const translated_message = {
                xid: nanoid(),
                linked_xid: return_message.xid,
                topic: packet.channel,
                channel: u_channel,
                user,
                timestamp: Date.now(),
                reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
                content: parsedMsg2,
                lang: lang
              }
              publish("channel/chat/receive/" + return_message.channel + '/' + lang, translated_message)
              self.db.message.store(translated_message)
          })
          // Catch Errors. But of course, I never make mistakes, so this is a useless line *kappa*
          .catch(error => {
              console.error(error)
          })
          }
          const sender_lang = user.chat_lang.toLowerCase()
          console.log('Sender lang: ' + sender_lang)
          channelLangs = channelLangs.filter(a => a !== sender_lang)
          async function sendOnSource(sender_language){
          const base = {
            xid: nanoid(),
            linked_xid: return_message.xid,
            topic: packet.channel,
            channel: u_channel,
            user,
            timestamp: Date.now(),
            reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
            content: parsedMsg,
            lang: sender_language
          }
          publish("channel/chat/receive/" + return_message.channel + '/' + sender_language, base)
          self.db.message.store(base)
        }
        sendOnSource(sender_lang)
        console.log({sender_lang})
        console.log({channel_langs: channelLangs})
          channelLangs.forEach(async (lang) => {
            translateMsg(parsedMsg.raw, lang)
          })
          // publish("channel/chat/receive/" + return_message.channel, return_message)
          // self.db.message.store(return_message)
          channel.ack(msg)
          // Message contained a valid command, let's build the response
          if(parsedMsg.meta.command){
            console.log('This Message Contained a Valid Command')
            message.content = await parsedMsg.meta.command.RESPONSE
            message.reply_target = return_message.xid
            const chatBotName = await database.getChannelBot(u_channel)
            const chanOwnerLookup = await database.getUserBySlug(channelData.SLUG)
            const chatBotUser = {
              "xid": chanOwnerLookup.user.xid,
              "legacy_id": chanOwnerLookup.user.legacy_id,
              "displayname": chatBotName.name,
              "username": chatBotName.name,
              "color": "#a2d2ff",
              "is_bot": true,
              "is_banned": 0
            }
            const commandMsg = {
              xid: nanoid(),
              topic: packet.channel,
              channel: u_channel,
              user: chatBotUser,
              timestamp: Date.now(),
              reply: await getReplyTarget({xid: message.reply_target, channel: u_channel}),
              content: await parseMessage({message, channel: u_channel}),
              lang: sender_lang
            }
            self.db.message.store(commandMsg)
            publish("channel/chat/receive/" + commandMsg.channel, commandMsg)
          }
        }, {
              noAck: false
      });
      return {emqClient, publish, channel, message: 'Consumer initiated. Waiting for messages.'}
    }
  }
  
module.exports = new Consumer()