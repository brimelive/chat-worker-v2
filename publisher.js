
const mqtt = require('mqtt')

async function init({host = 'wss://chat.brime.tv/ws', idGenerator = ()=>{}, options = {}}){
    return new Promise((resolve, reject)=>{
      const clientId = idGenerator()
        const config = {
            keepalive: 60,
            clientId,
            protocolId: 'MQTT',
            protocolVersion: 4,
            rejectUnauthorized: false,
            clean: true,
            reconnectPeriod: 1000,
            connectTimeout: 30 * 1000,
            will: {
              topic: 'WillMsg',
              payload: 'Connection Closed abnormally..!',
              qos: 0,
              retain: false
            },
            ...options
          }
    
          const client = mqtt.connect(host, config)
          const publish = (topic, message)=>{
            client.publish(topic, JSON.stringify(message), 
            { qos: 0, retain: false })
            console.log(`Published message ${message.xid} (channel: ${message.channel}) to ${topic}`)
          }

          client.on('connect', ()=>{
            console.log(`Publisher connected. ID: ${clientId}`)
              resolve({client, publish})
          })
    })
}

module.exports = {init}