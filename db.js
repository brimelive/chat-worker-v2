const database = require('./services/database')
const fetch = require('node-fetch');

const getReplyTarget = async ({xid, channel})=>{
    if(!xid) return false
    // AND DELETED = 0 (remove the unnecessary check unless we want to return <message:deleted> or an error (Message you're trying to reply to has been delete))
    let {rows} = await database.query('SELECT DELETED, CONTENT FROM CHAT_MESSAGES WHERE XID = :xid AND CHANNEL = :channel', {xid, channel})
    if(!rows || !rows?.length) return false
    let message = rows[0]
    if(message.DELETED) return false
    return JSON.parse(message.CONTENT)
  }
  const channelDataLookup = async (channel)=>{
    if(!channel) return false
    // AND DELETED = 0 (remove the unnecessary check unless we want to return <message:deleted> or an error (Message you're trying to reply to has been delete))
    let {rows, error} = await database.query('SELECT * FROM CHANNELS WHERE XID = :channel', {channel})
    if(rows.length > 0) return rows[0]
  }
  const ownerCheck = async(channel, user_xid)=>{
    if(!channel || !user_xid) return false
    const {rows, error} = await database.query('SELECT * FROM CHANNEL_OWNERS WHERE CHANNEL_XID = :channel AND USER_XID = :user_xid', {channel, user_xid})
    if(rows.length > 0) return true
    return false
  }
  const modCheck = async (channel, user_xid)=>{
    if(!channel || !user_xid) return false
    let {rows, error} = await database.query('SELECT * FROM CHANNEL_MODERATORS WHERE CHANNEL_XID = :channel AND USER_XID = :user_xid', {channel, user_xid})
    let isOwner = await (ownerCheck(channel, user_xid))
    if(rows.length > 0 || isOwner) return true
    return false
  }
  const banCheck = async (channel, user_xid)=>{
    if(!channel || !user_xid) return false
    let {rows, error} = await database.query('SELECT * FROM CHAT_ACL WHERE CHANNEL_XID = :channel AND USER_XID = :user_xid', {channel, user_xid})
    if(rows.length > 0) return true
    return false
  }
  const channelBanUser = async (channel, user_xid, timestamp)=>{
    if(!channel || !user_xid || !timestamp) return false
    const {result} = await database.query('INSERT INTO CHAT_ACL (USER_XID, CHANNEL_XID, TIMESTAMP) VALUES (:user_xid, :channel, :timestamp)', {user_xid, channel, timestamp})
    if(result.rowsAffected > 0) return {success: true, message: `User ${user_xid} banned on channel ${channel}`}
    return {success: false, message: `User ${user_xid} not found`}
  }
  const channelModUser = async (channel, user_xid, timestamp)=>{
    if(!channel || !user_xid || !timestamp) return false
    const {result} = await database.query('INSERT INTO CHANNEL_MODERATORS (USER_XID, CHANNEL_XID, TIMESTAMP) VALUES (:user_xid, :channel, :timestamp)', {user_xid, channel, timestamp})
    if(result.rowsAffected > 0) return {success: true, message: `User ${user_xid} added to moderators on channel ${channel}`}
    return {success: false, message: `User ${user_xid} not found`}
  }
  const chatCommandsLookup = async (channel_xid)=>{
    if(!channel_xid) return false
    // AND DELETED = 0 (remove the unnecessary check unless we want to return <message:deleted> or an error (Message you're trying to reply to has been delete))
    let {rows} = await database.query('SELECT * FROM CHAT_COMMANDS WHERE CHANNEL_XID = :channel_xid', {channel_xid})
    if(rows.length > 0) return rows
  }
  const channelChatLangs = async (channel)=>{
    if(!channel) return false
    // AND DELETED = 0 (remove the unnecessary check unless we want to return <message:deleted> or an error (Message you're trying to reply to has been delete))
    let {rows} = await database.query('SELECT DISTINCT CHAT_LANG FROM CHANNEL_CHATTERS WHERE CHANNEL_XID = :CHANNEL', {channel})
    if(rows.length > 0) return rows
  }
  const deleteMessage = async (msg_xid)=>{
    if(!msg_xid) return false
    // AND DELETED = 0 (remove the unnecessary check unless we want to return <message:deleted> or an error (Message you're trying to reply to has been delete))
    const {result} = await database.query('UPDATE CHAT_MESSAGES SET DELETED = 1 WHERE LINKED_XID = :msg_xid', {msg_xid})
    if(result.rowsAffected > 0) return {success: true, message: `Message ${msg_xid} deleted`}
    return {success: false, message: `Message ${msg_xid} not found`}
  }
  const getGif = async(message, o)=>{
    let id = message.content.split(' ').pop()
    let r = await fetch('http://api.brime.tv/v1/tenor/gif/' + id)
    let json = await r.json()
    if(json.error){
      return {}
    }
    let {src, preview} = json
  
    return {
      type: 'gif',
      parsed: '> Gif message',
      meta: {
        ...o.meta,
        attachements: [{
          type: 'image',
          mime: 'image/gif',
          src, 
          preview
        }]
      }
    }
  }
  const deleteMsg = async(message, o)=>{
    let msg_id = message.content.split(' ').pop()
    return {
      type: 'delete',
      meta: {
        ...o.meta,
        delete: {
          msg_id
        }
      }
    }
  }

module.exports = {
    getReplyTarget,
    channelDataLookup,
    chatCommandsLookup,
    channelChatLangs,
    getGif,
    modCheck,
    deleteMsg,
    deleteMessage,
    channelBanUser,
    channelModUser,
    banCheck,
    ownerCheck,
}