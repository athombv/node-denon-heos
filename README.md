# Denon Heos

This is a module to control Denon Heos speakers using Node.js. Not all API calls are added yet, but it should be good enough for use.

* Discover speakers (Wi-Fi & LAN)
* Send commands (e.g. play, pause, set volume)
* Listen to events from a speaker (e.g. track or volume changed)
* Automatically reconnect (even if the device's IP has changed 🎉)

## Installation
```
npm install denon-heos
```

## Example
```javascript
const { Discover } = require('denon-heos');
const discover = new Discover();
discover.on('device', ( device ) => {
  device.instance.connect().then(async () => {
    const info = await device.instance.playerGetPlayerInfo();
    console.log(info);
  }).catch(console.error);
})
discover.start();
```

For more examples, see `./examples`.

## Contributing

More API methods need to be added. Help is welcome, see `./assets/docs/` for the specifications.

