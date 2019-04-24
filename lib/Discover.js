'use strict';

const { EventEmitter } = require('events');
const http = require('http');

const SSDP = require('node-ssdp-lite');
const DenonHeos = require('./DenonHeos');

const URN = 'urn:schemas-denon-com:device:ACT-Denon:1';
const SEARCH_INTERVAL = 1000 * 30;

class Discover extends EventEmitter {

  constructor() {
    super();

    this._onResponse = this._onResponse.bind(this);
    this._devices = {};
  }

  _onResponse( msg, rinfo ) {
    const msgObj = this._msgToObject( msg );
    if( typeof msgObj['usn'] !== 'string' || !msgObj['usn'].toLowerCase().includes('denon') ) return;
    
    const req = http.get( msgObj['location'], res => {
      let body = '';
      res.on('error', err => {
        console.error('Discovery Error', err);
      }).on('data', chunk => {
          body += chunk;
      }).on('end', () => {
        let manufacturer = matchBetweenTags('manufacturer', body);
        if( manufacturer !== 'Denon' ) return;

        let friendlyName = matchBetweenTags('friendlyName', body);
        if( friendlyName ) friendlyName = friendlyName.replace('ACT-', '');
        
        let udn = matchBetweenTags('UDN', body).replace('uuid:', '');
        
        if( this._devices[udn] ) {
          this._devices[udn].address = rinfo.address;
          this._devices[udn].instance.setAddress(rinfo.address);
        } else {       
          this._devices[udn] = {
            udn,
            friendlyName: friendlyName,
            modelName: matchBetweenTags('modelName', body),
            modelNumber: matchBetweenTags('modelNumber', body),
            deviceId: matchBetweenTags('DeviceID', body),
            wlanMac: matchBetweenTags('wlanMac', body),
            address: rinfo.address,
            instance: new DenonHeos({
              address: rinfo.address,
            }),
          };

          this.emit('device', this._devices[udn]);
          this.emit(`device:${udn}`, this._devices[udn]);
        }
      });
    });
    
    req.on('error', () => {});
  }

  _msgToObject( msg ) {

    let msgObj = {};
    let msgArr = msg.split('\n');

    msgArr.forEach( msgArrItem => {
      msgArrItem = msgArrItem.split(':');
      msgArrItem = [msgArrItem.shift(), msgArrItem.join(':')]
      if( msgArrItem.length !== 2 ) return;

      msgObj[ msgArrItem[0].trim().toLowerCase() ] = msgArrItem[1].trim();
    });

    return msgObj;

  }

  start() {
    if( this._searchInterval )
      return;
      
    this._client = new SSDP();
    this._client.on('response', this._onResponse);
    this._client.search( URN );
    
    this._searchInterval = setInterval(() => {
      this._client.search(URN);
    }, SEARCH_INTERVAL);
  }

  stop() {
    if( !this._client ) return;
    
    if( this._searchInterval ) 
      clearInterval(this._searchInterval);
  }

}

module.exports = Discover;

function matchBetweenTags( tagName, input ) {

  let re = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`)

    let result = input.match( re );
    if( result && typeof result[1] === 'string' ) return result[1];
    return undefined;

}