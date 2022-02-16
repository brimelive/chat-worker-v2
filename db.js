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
    console.log(channel)
    // AND DELETED = 0 (remove the unnecessary check unless we want to return <message:deleted> or an error (Message you're trying to reply to has been delete))
    let {rows, error} = await database.query('SELECT * FROM CHANNELS WHERE XID = :channel', {channel})
    console.log(rows, error)
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
}