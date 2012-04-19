fs = require 'fs'
path = require 'path'
child_process = require 'child_process'
async = require 'async'
{_} = require 'underscore'
winston = require 'winston'

optimist = require('optimist')
  .options('output', alias: 'o', default: 'output', describe: 'Name for the output file.')
  .options('log', alias: 'l', default: 'info', describe: 'Log level (debug, info, notice, warning, error).')
  .options('help', alias: 'h', describe: 'Show this help message.')
argv = optimist.argv

winston.setLevels winston.config.syslog.levels
winston.remove winston.transports.Console
winston.add winston.transports.Console, colorize: true, level: argv.log, handleExceptions: true

winston.debug 'Parsed arguments', argv

files = _.uniq argv._
if argv.help || !files.length
  winston.error 'No input files specified.' unless argv.help
  winston.info 'Usage: audio-sprite [options] file1.mp3 file2.mp3 *.wav'
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
  duration = 0
  path.exists src, (exists) ->
    return cb msg: 'File does not exist' , file: src unless exists
    ffmpeg = spawn 'ffmpeg', ['-i', path.resolve src].concat(wavArgs).concat 'pipe:'
    ffmpeg.stdout.pipe fs.createWriteStream dest, flags: 'a'
    ffmpeg.stderr.on 'data', (data) ->
      if match = data.toString('utf8').match /\s*Duration:\s+(\d+):(\d+):(\d+\.\d+)/
        duration = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3])
        winston.debug 'Parsed duration', file: src, duration: duration
    ffmpeg.on 'exit', (code, signal) ->
      return cb msg: 'File could not be added', file: src, retcode: code, signal: signal if code
      winston.info 'File added OK', file: src
      
      appendSilence Math.ceil(duration) - duration + 1, dest, cb

appendSilence = (duration, dest, cb) ->
  ffmpeg = spawn 'ffmpeg', ['-f', 's16le', '-i', 'pipe:0'].concat(wavArgs).concat 'pipe:1'
  buffer = new Buffer Math.round 44100 * 2 * numChannels * duration
  buffer.fill null
  ffmpeg.stdin.end buffer
  ffmpeg.stdout.pipe fs.createWriteStream dest, flags: 'a'
  ffmpeg.on 'exit', (code, signal) ->
    return cb msg: 'Error adding silence gap', retcode: code, signal: signal if code
    winston.info duration.toFixed(2) + 's silence gap added OK'
    cb()

exportFile = (src, dest, ext, opt, cb) ->
  outfile = dest + '.' + ext
  ffmpeg = spawn 'ffmpeg', ['-y', '-f', 's16le', '-i', src].concat(opt).concat outfile
  ffmpeg.on 'exit', (code, signal) ->
    return cb msg: 'Error exporting file', format: ext, retcode: code, signal: signal if code
    winston.info "Exported #{ext} OK", file: outfile
    if ext == 'aiff'
      exportFileCaf outfile, dest + '.caf', (err) ->
        fs.unlinkSync outfile # Aiff itself is not needed.
        cb err
    else
      cb()

exportFileCaf = (src, dest, cb) ->
  return unless process.platform == 'darwin'
  afconvert = spawn 'afconvert', ['-f', 'caff', '-d', 'ima4', src, dest]
  afconvert.on 'exit', (code, signal) ->
    return cb msg: 'Error exporting file', format: 'caf', retcode: code, signal: signal if code
    winston.info 'Exported caf OK', file: dest
    cb()

numChannels = 1 # Mono support only for now.
wavArgs = ['-ar', '44100', '-acodec', 'pcm_s16le', '-ac', numChannels, '-f', 's16le']
tempFile = mktemp 'audio-sprite'
winston.debug 'Created temporary file', file: tempFile

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

    #fs.unlinkSync tempFile
    winston.info 'All done'
