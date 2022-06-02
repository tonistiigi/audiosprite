const path = require('path');
const os = require('os');

const AUDIOSPRITE_PATH = path.join(__dirname, '../test', 'cli.js');
const OUTPUT = `audiosprite-test-out${Math.trunc((Math.random() * 1e6))}`;
const TMPDIR = os.tmpdir() || '.';

const sounds = [
  path.join(__dirname, 'sounds/beep.mp3'),
  path.join(__dirname, 'sounds/boop.wav'),
];

const soundsTypes = [
  path.join(__dirname, 'sounds/*.mp3'),
  path.join(__dirname, 'sounds/*.wav'),
];

module.exports = {
  AUDIOSPRITE_PATH,
  OUTPUT,
  TMPDIR,
  sounds,
  soundsTypes,
};
