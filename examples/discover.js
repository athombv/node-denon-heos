'use strict';

const { Discover } = require('..');

const discover = new Discover();
discover.on('device', ( device ) => {
	console.log('onDevice', device)
})
discover.start();