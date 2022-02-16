const database = require('./services/database')
const { customAlphabet } = require("nanoid");
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 20);
const item_xid = customAlphabet(alphabet, 10);
const {
    getReplyTarget,
    channelDataLookup,
    chatCommandsLookup,
    channelChatLangs,
    getGif,
    deleteMsg
} = require('./db')
const banParse = async(message, o)=>{
    let user = message.content.split(' ').pop()
    return {
      type: 'ban',
      meta: {
        ...o.meta,
        ban: {
          user
        }
      }
    }
  }
const parseMentions = async (message) => {
    const re = /@([^@\s]{1,})/g
    const matches = message.parsed.matchAll(re) || []
    const found = []
    const inputs = {}
    for (let match of matches) {
        let username = match[1].toLowerCase()
        found.push(username)
        if (inputs[username]) {
            if (!inputs[username].includes(match[0])) inputs[username].push(match[0])
            continue
        }
        inputs[username] = [match[0]]
    }
    const matched = (await database.user.getAll(found)).sort((a, b) => b.username.length - a.username.length)
    for (let u of matched) {
        let matches = inputs[u.username]
        for (let match of matches) {
            message.parsed = message.parsed.replaceAll(match, `<mention:${u.xid}>`)
        }
    }

    return message.meta.mentions = matched
}

const parseLinks = async (message) => {
    const URL_REGEX = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?/gi
    const matches = Array.from(message.parsed.matchAll(URL_REGEX)).sort((a, b) => b[0].length - a[0].length)
    const added = []
    const blacklist = await database.url.blacklist.get()
    for (let match of matches) {
        try {
            let r_url = match[0]
            let url = new URL(r_url)
            if (blacklist.includes(url.host)) {
                message.parsed = message.parsed.replaceAll(r_url, '<link:blocked>')
                message.raw = message.raw.replaceAll(r_url, '<link:blocked>')
                continue
            }
            if (added.includes(r_url)) continue
            added.push(r_url)

            const xid = item_xid()

            message.parsed = message.parsed.replaceAll(r_url, `<link:${xid}>`)

            let parsedSearch = {}
            url.searchParams.forEach((v, k) => {
                if (parsedSearch[k]) return parsedSearch[k].push(v)
                parsedSearch[k] = [v]
            })

            message.meta.links.push({
                xid,
                match: r_url,
                href: url.href,
                origin: url.origin,
                protocol: url.protocol,
                host: url.host,
                hash: url.hash,
                search: {
                    raw: url.search,
                    parsed: parsedSearch
                }
            })
        } catch {
            continue
        }
    }
}

const normalizeEmote = (emote)=>{
    let r = emote.replaceAll(':', '')
    return r[0].toUpperCase() + r.slice(1)
  }

const parseEmotes = async (message) => {
    const re = /(:[a-zA-Z]{3,}:)|([a-zA-Z]{3,})/g
    const matches = [...new Set(Array.from(message.parsed.matchAll(re)))].sort((a, b) => b[0].length - a[0].length) || []
    const inputs = {}
    const emotes = [{
            xid: item_xid(),
            code: 'BrimeTime',
            src: 'https://content.brimecdn.com/brime/emote/607bb7a0d2595193fc085ff9/1x'
        },
        {
            xid: item_xid(),
            code: 'Doge',
            src: 'https://content.brimecdn.com/brime/emote/607bb07bd2595193fc085ff6/1x'
        },
        {
            xid: item_xid(),
            code: 'BrimePop',
            src: 'https://content.brimecdn.com/brime/emote/60adf0acb02edcd85e096079/1x'
        },
        {
            xid: item_xid(),
            code: 'Nashed',
            src: 'https://content.brimecdn.com/brime/emote/607f931013b66ed6d03de8cc/1x'
        },
        {
            xid: item_xid(),
            code: 'OBSSweat',
            src: 'https://content.brimecdn.com/brime/emote/6098e55d791971b70b1a3d05/1x'
        },
        {
            xid: item_xid(),
            code: 'brimeDoge',
            src: 'https://content.brimecdn.com/brime/emote/60aeb56847e3a5efb5d862b9/1x'
        },
        {
            xid: item_xid(),
            code: 'Pog',
            src: 'https://content.brimecdn.com/brime/emote/607ba48ad2595193fc085ff4/1x'
        },
        {
            xid: item_xid(),
            code: 'KEKW',
            src: 'https://content.brimecdn.com/brime/emote/607ba5dcd2595193fc085ff5/1x'
        },
        {
            xid: item_xid(),
            code: 'FeelsBrimeProMan',
            src: 'https://content.brimecdn.com/brime/emote/607fa67d13b66ed6d03de93e/1x'
        },
        {
            xid: item_xid(),
            code: 'PauseChamp',
            src: 'https://content.brimecdn.com/brime/emote/607bb721d2595193fc085ff8/1x'
        },
        {
            xid: item_xid(),
            code: 'Jebaited',
            src: 'https://content.brimecdn.com/brime/emote/607bb52fd2595193fc085ff7/1x'
        },
        {
            xid: item_xid(),
            code: 'monkaW',
            src: 'https://content.brimecdn.com/brime/emote/607bb833d2595193fc085ffa/1x'
        },
        {
            xid: item_xid(),
            code: 'YEP',
            src: 'https://content.brimecdn.com/brime/emote/608c9405e2e12599035c6f61/1x'
        }
    ]

    for (let match of matches) {
        let raw = match[0]
        let code = normalizeEmote(raw)

        if (inputs[code]) {
            if (!inputs[code].includes(raw)) inputs[code].push(raw)
            continue
        }
        inputs[code] = [raw]
    }

    const sorted_inputs = Object.entries(inputs).sort((a, b) => b[0].length - a[0].length)
    const matched = []

    for (let [code, raws] of sorted_inputs) {
        let f = emotes.find(e => e.code == code)
        if (!f) return
        for (let raw of raws) {
            message.parsed = message.parsed.replaceAll(raw, `<emote:${f.xid}>`)
        }
        matched.push(f)
    }

    return message.meta.emotes = matched
}

const escapeHTML = raw => raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")

const parseMessage = async ({message, channel})=>{
  let r = {
    type: 'text',
    raw: message.content,
    parsed: escapeHTML(message.content),
    rich: {
      // type,
      // content
    },
    meta: {
      emotes: [],
      mentions: [],
      links: [],
      attachements: []
    }
  }

  // if startsWith('/') { matchCommand() -> switch, default: parseDefault() } else { parseDefault() }
  // more feasible to consume and create new commands
  // command middleware? (for ACL -> fastify like?)
  // make commands accept {}, optional {middleware: ?}
  if(message.content.startsWith('/gif')){
    r = {...r, ...await getGif(message, r)}
  }
  if(message.content.startsWith('/delete')){
    r = {...r, ...await deleteMsg(message, r)}
  }
  if(message.content.startsWith('/ban')){
    r = {...r, ...await banParse(message, r)}
  }
    else {
    await parseLinks(r)
    await parseMentions(r)
    await parseEmotes(r)
  }
  return r
}

module.exports = {
    parseMentions,
    parseLinks,
    normalizeEmote,
    parseEmotes,
    escapeHTML,
    parseMessage,
}