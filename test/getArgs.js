// eslint-disable-next-line import/no-extraneous-dependencies
const minimist = require('minimist');

const minimistConfig = {
  alias: {
    output: 'o',
    path: 'u',
    export: 'e',
    format: 'f',
    log: 'l',
    autoplay: 'a',
    silence: 's',
    gap: 'g',
    minlength: 'm',
    bitrate: 'b',
    vbr: 'v',
    'vbr:vorbis': 'q',
    samplerate: 'r',
    channels: 'c',
    rawparts: 'p',
    ignorerounding: 'i',
  },
  default: {
    output: 'output', //  'Name for the output files.'
    path: '', //  'Path for files to be used on final JSON.'
    export: ['ogg', 'm4a', 'mp3', 'ac3'], //  'Limit exported file types. Comma separated extension list.'
    format: 'jukebox', //  'Format of the output JSON file (jukebox, howler, howler2, createjs).'
    log: 'info', //  'Log level (debug, info, notice, warning, error).'
    autoplay: null, //  'Autoplay sprite name.'
    loop: null, //  'Loop sprite name, can be passed multiple times.'
    silence: 0, //  'Add special "silence" track with specified duration.'
    gap: 1, //  'Silence gap between sounds (in seconds).'
    minlength: 0, //  'Minimum sound duration (in seconds).'
    bitrate: 128, //  'Bit rate. Works for: ac3, mp3, mp4, m4a, ogg.'
    vbr: -1, //  'VBR [0-9]. Works for: mp3. -1 disables VBR.'
    'vbr:vorbis': -1, //  'qscale [0-10 is highest quality]. Works for: webm. -1 disables qscale.'
    samplerate: 44100, //  'Sample rate.'
    channels: 1, //  'Number of channels (1=mono, 2=stereo).'
    rawparts: '', //  'Include raw slices(for Web Audio API) in specified formats.'
    ignorerounding: 0, //  'Bypass sound placement on whole second boundaries (0=round,1=bypass).'
  },
};

module.exports = minimist(process.argv.slice(2), minimistConfig);
