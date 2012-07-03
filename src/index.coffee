fs = require 'fs'
path = require 'path'
child_process = require 'child_process'
async = require 'async'
{_} = require 'underscore'
winston = require 'winston'

optimist = require('optimist')
  .options('output', alias: 'o', default: 'output', describe: 'Name for the output file.')
  .options('log', alias: 'l', default: 'info', describe: 'Log level (debug, info, notice, warning, error).')
  .options('autoplay', alias: 'a', default: null, describe: 'Autoplay sprite name')
  .options('silence', alias: 's', default: 0, describe: 'Add special "silence" track with specified duration.')
  .options('samplerate', alias: 'r', default: 44100, describe: 'Sample rate.')
  .options('channels', alias: 'c', default: 1, describe: 'Number of channels (1=mono, 2=stereo).')
  .options('help', alias: 'h', describe: 'Show this help message.')
argv = optimist.argv

winston.setLevels winston.config.syslog.levels
winston.remove winston.transports.Console
winston.add winston.transports.Console, colorize: true, level: argv.log, handleExceptions: true

winston.debug 'Parsed arguments', argv

SAMPLE_RATE = parseInt argv.samplerate
NUM_CHANNELS = parseInt argv.channels

files = _.uniq argv._
if argv.help || !files.length
  winston.error 'No input files specified.' unless argv.help
  winston.info 'Usage: audiosprite [options] file1.mp3 file2.mp3 *.wav'
  winston.info optimist.help()
  return

# Get temporary filename
mktemp = (prefix) ->
  tmpdir = process.env.TMPDIR || '.'
  path.join tmpdir, prefix + '.' + ~~(Math.random() * 1e6)

# Wrapper for native spawn with debugging
spawn = (name, opt) ->
  winston.debug 'Spawn', cmd: name + ' ' + opt.join ' '
  child_process.spawn name, opt

# Append s16le formatted source file to the destination file.
appendFile = (src, dest, cb) ->
  winston.debug 'Start processing', file: src
  size = 0
  fs.exists src, (exists) ->
    return cb msg: 'File does not exist' , file: src unless exists
    ffmpeg = spawn 'ffmpeg', ['-i', path.resolve src].concat(wavArgs).concat 'pipe:'
    ffmpeg.stdout.pipe fs.createWriteStream dest, flags: 'a'
    ffmpeg.stdout.on 'data', (data) -> size += data.length
    ffmpeg.on 'exit', (code, signal) ->
      return cb msg: 'File could not be added', file: src, retcode: code, signal: signal if code
      duration = size / SAMPLE_RATE / NUM_CHANNELS / 2
      winston.info 'File added OK', file: src, duration: duration
      
      name = path.basename(src).replace /\..+$/, ''
      json.spritemap[name] = start: offsetCursor, end: offsetCursor + duration, loop: name == argv.autoplay
      offsetCursor += duration
      appendSilence Math.ceil(duration) - duration + 1, dest, cb

appendSilence = (duration, dest, cb) ->
  buffer = new Buffer Math.round SAMPLE_RATE * 2 * NUM_CHANNELS * duration
  buffer.fill null
  writeStream = fs.createWriteStream dest, flags: 'a'
  writeStream.end buffer
  writeStream.on 'close', ->
    winston.info 'Silence gap added', duration: duration
    offsetCursor += duration
    cb()
  
exportFile = (src, dest, ext, opt, cb) ->
  outfile = dest + '.' + ext
  ffmpeg = spawn 'ffmpeg', ['-y', '-ac', NUM_CHANNELS, '-f', 's16le', '-i', src].concat(opt).concat outfile
  ffmpeg.on 'exit', (code, signal) ->
    return cb msg: 'Error exporting file', format: ext, retcode: code, signal: signal if code
    if ext == 'aiff'
      exportFileCaf outfile, dest + '.caf', (err) ->
        json.resources.push dest + '.caf'
        fs.unlinkSync outfile # Aiff itself is not needed.
        cb err
    else
      winston.info "Exported #{ext} OK", file: outfile
      json.resources.push outfile
      cb()

exportFileCaf = (src, dest, cb) ->
  return unless process.platform == 'darwin'
  afconvert = spawn 'afconvert', ['-f', 'caff', '-d', 'ima4', src, dest]
  afconvert.on 'exit', (code, signal) ->
    return cb msg: 'Error exporting file', format: 'caf', retcode: code, signal: signal if code
    winston.info 'Exported caf OK', file: dest
    cb()

processFiles = ->  
  async.forEachSeries files, (file, cb) ->
    appendFile file, tempFile, cb
  , (err) ->
    return winston.error 'Error processing file', err if err

    formats = [
      'aiff'
      'ac3 -acodec ac3'
      'mp3 -ab 128 -f mp3'
      'm4a'
      'ogg -acodec libvorbis -f ogg'
    ]

    async.forEachSeries formats, (format, cb) ->
      [ext, opt...] = format.split ' '
      winston.debug 'Start export', format: ext
      exportFile tempFile, argv.output, ext, opt, cb
    , (err) ->
      return winston.error 'Error exporting file', err if err

      json.autoplay = argv.autoplay if argv.autoplay

      jsonfile = argv.output + '.json'
      fs.writeFileSync jsonfile, JSON.stringify json, null, 2
      winston.info 'Exported json OK', file: jsonfile
      fs.unlinkSync tempFile
      winston.info 'All done'

offsetCursor = 0
wavArgs = ['-ar', SAMPLE_RATE, '-ac', NUM_CHANNELS, '-f', 's16le']
tempFile = mktemp 'audiosprite'
winston.debug 'Created temporary file', file: tempFile
json = resources: [], spritemap: {}

if argv.silence
  json.spritemap.silence = start: 0, end: argv.silence, loop: true
  json.autoplay = 'silence' unless argv.autoplay
  appendSilence argv.silence + 1, tempFile, processFiles
else
  processFiles()
