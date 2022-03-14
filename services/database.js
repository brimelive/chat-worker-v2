require('dotenv').config({
    path: `../.env`
  })

const oracledb = require('oracledb');
const dbConfig = require('../config/database');
if (process.platform === 'win32') {
  oracledb.initOracleClient({
    libDir: 'C:\\oracle\\instantclient_19_11',
  });
}
 
// The general recommendation for simple SODA usage is to enable autocommit
oracledb.autoCommit = true;

// Fetch character LOBs as string (for easier manipulation)
oracledb.fetchAsString = [ oracledb.CLOB ]

async function initialize() {
    await oracledb.createPool(dbConfig.hrPool);
  }

  async function close() {
    await oracledb.getPool().close(0);
  }

async function query(statement, binds = [], opts = {}) {
  let conn;
  let result = [];

  opts.outFormat = oracledb.OBJECT;

  try {
    conn = await oracledb.getConnection();
    result = await conn.execute(statement, binds, opts);
    return {result, rows: result.rows};
  } catch (err) {
    console.error(err, 'Statement details below.')
    console.info(statement, binds)
    return {error: err}
  } finally {
    if (conn) { // conn assignment worked, need to close
      try {
        await conn.close();
      } catch (err) {
        console.error(err);
        return {error: err}
      }
    }
  }
}

const getUser = async (xid)=>{
  let {error, rows} = await query('SELECT XID, DISPLAYNAME, USERNAME, CHAT_COLOR, LEGACY_ID, IS_BANNED FROM USERS WHERE XID = :xid', {xid})
  if(error) return {error}
  if(!rows.length) return {error: 'NOT_FOUND', message: 'Invalid user XID provided: ' + xid}
  return {
    user: {
      xid: rows[0].XID,
      legacy_id: rows[0].LEGACY_ID,
      displayname: rows[0].DISPLAYNAME,
      username: rows[0].USERNAME,
      color: rows[0].CHAT_COLOR,
      is_banned: rows[0].IS_BANNED
    }
  }
}

const getUserBySlug = async (slug)=>{
  let {error, rows} = await query('SELECT XID, DISPLAYNAME, USERNAME, CHAT_COLOR, LEGACY_ID, IS_BANNED FROM USERS WHERE LOWER(USERNAME) = :slug', {slug})
  if(error) return {error}
  if(!rows.length) return {error: 'NOT_FOUND', message: 'Invalid user XID provided: ' + xid}
  return {
    user: {
      xid: rows[0].XID,
      legacy_id: rows[0].LEGACY_ID,
      displayname: rows[0].DISPLAYNAME,
      username: rows[0].USERNAME,
      color: rows[0].CHAT_COLOR,
      is_banned: rows[0].IS_BANNED
    }
  }
}

const getChannelCommands = async (channel)=>{
  let {error, rows} = await query('SELECT XID, COMMAND, RESPONSE FROM CHAT_COMMANDS WHERE CHANNEL_XID = :channel', {channel})
  if(error) return {error}
  if(!rows.length) return []
  return rows
}

const getChannelBot = async (channel)=>{
  let {error, rows} = await query('SELECT NAME FROM CHAT_BOT_NAMES WHERE CHANNEL_XID = :channel', {channel})
  if(error) return {error}
  if(!rows.length) return {name: 'BrimeBot'}
  return {name: rows[0].NAME}
}

const getUsers = async (users)=>{
  if(!users || !users.length) return []
  let placeholder = ''
  let values = {}
  for(let i = 0; i < users.length; ++i){
    placeholder += ':user' + i + ', '
    values[`user${i}`] = users[i]
  }
  placeholder = placeholder.slice(0, placeholder.length - 2)
  let {error, rows} = await query(`SELECT XID, DISPLAYNAME, USERNAME, CHAT_COLOR, LEGACY_ID FROM USERS WHERE LOWER(username) IN (${placeholder})`, values)
  if(error) return []
  let r = []
  for(let user of rows){
    r.push({
      xid: user.XID,
      legacy_id: user.LEGACY_ID,
      displayname: user.DISPLAYNAME,
      username: user.USERNAME,
      color: user.CHAT_COLOR
    })
  }

  return r
}

const storeMessage = async(message)=>{
  let {error} = await query('INSERT INTO CHAT_MESSAGES (XID, CHANNEL, USER_XID, TIMESTAMP, CONTENT, DELETED) VALUES (:xid, :channel, :user_xid, :timestamp, :content, :deleted)', 
  {
    xid: message.xid,
    channel: message.channel,
    user_xid: message.user.xid,
    timestamp: message.timestamp,
    content: JSON.stringify(message),
    deleted: 0
  })
}

const getURLBlacklist = async()=>{
  return ['pornhub.com']
  let {rows} = await query('SELECT HOSTNAME FROM URL_BLACKLIST', {})
  if(!rows) return []
  return rows.map(e=>e.HOSTNAME)
}

module.exports = {
    close,
    initialize,
    query,
    getChannelCommands,
    getUserBySlug,
    getChannelBot,
    getUser,    
    user: {
      get: getUser,
      getAll: getUsers
    },
    message: {
      store: storeMessage
    },
    url: {
      blacklist: {
        get: getURLBlacklist
      }
    },
    word: {
      blacklist: {
        get: ()=>[]
      }
    }
  }