'use strict';

const Discover = require('..').Discover;

let discover = new Discover();
	discover.on('device', ( device ) => {
		console.log('onDevice', device)
	})
	discover.start();