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
    deleteMessage,
    channelBanUser,
    banCheck,
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
          const connection = await amqp.connect(host)
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
          const u_channel = packet.channel.split('/').pop()
          const isChannelBanned = await banCheck(u_channel, packet.username)
          if(isChannelBanned){
            console.log(`${packet.username} is banned from ${u_channel}`)
            return channel.ack(msg)
        }
          const channelData = await channelDataLookup(u_channel)
          if(!channelData)return{error: `Channel ${u_channel} not found.`}
          const {user, error} = await self.db.user.get(packet.username)
          const isMod = await modCheck(channelData.XID, user.xid)
          const parsedMsg = await parseMessage({message, channel: u_channel})
          if(parsedMsg.type == 'delete'){
              if(!isMod){
                  console.error('User is not a mod')
                  return channel.ack(msg)
              }else {
                  const deleteQuery = await deleteMessage(parsedMsg.meta.delete.msg_id)
                  console.log(deleteQuery)
                  const deleteMsg = {
                    type: 'delete',
                    targetMsg: parsedMsg.meta.delete.msg_id,
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
    
          publish("channel/chat/receive/" + return_message.channel, return_message)
          self.db.message.store(return_message)
          channel.ack(msg)
          console.log(user)
          // Message contained a valid command, let's build the response
          if(parsedMsg.meta.command){
            console.log('This Message Contained a Valid Command')
            message.content = await parsedMsg.meta.command.RESPONSE
            message.reply_target = return_message.xid
            const chatBotName = await database.getChannelBot(u_channel)
            const chatBotUser = {
              "xid": "dK9AZWroow9jhT5ak7ge",
              "legacy_id": "603b901b0a8fe286fc6f1229",
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
              content: await parseMessage({message, channel: u_channel})
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