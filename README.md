#denon-heos

This is a module to control Denon Heos speakers using Node.js. Not all API calls are added yet, but it should be good enough for use.

It allows you to:

* Discover speakers
* Connect to a speaker
* Send commands (e.g. play, pause, set volume)
* Listen to events from a speaker (e.g. state changed, volume changed)

## TODO

* Add more API methods (help is welcome, see `./assets/docs/` for the specifications.
* Rewrite to promises instead of callbacks

## Installation
```
npm install denon-heos
```

## Usage
For an example, see `./examples/control.js`.

