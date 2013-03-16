#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var async = require('async')
var _ = require('underscore')._
var winston = require('winston')

var optimist = require('optimist')
  .options('output', {
    alias: 'o'
  , 'default': 'output'
  , describe: 'Name for the output file.'
  })
  .options('export', {
    alias: 'e'
  , 'default': ''
  , describe: 'Limit exported file types. Comma separated extension list.'
  })
  .options('log', {
    alias: 'l'
  , 'default': 'info'
  , describe: 'Log level (debug, info, notice, warning, error).'
  })
  .options('autoplay', {
    alias: 'a'
  , 'default': null
  , describe: 'Autoplay sprite name'
  })
  .options('silence', {
    alias: 's'
  , 'default': 0
  , describe: 'Add special "silence" track with specified duration.'
  })
  .options('samplerate', {
    alias: 'r'
  , 'default': 44100
  , describe: 'Sample rate.'
  })
  .options('channels', {
    alias: 'c'
  , 'default': 1
  , describe: 'Number of channels (1=mono, 2=stereo).'
  })
  .options('rawparts', {
    alias: 'p'
  , 'default': ''
  , describe: 'Include raw slices(for Web Audio API) in specified formats.'
  })
  .options('help', {
    alias: 'h'
  , describe: 'Show this help message.'
  })

var argv = optimist.argv

winston.setLevels(winston.config.syslog.levels)
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {
  colorize: true
, level: argv.log
, handleExceptions: false
})
winston.debug('Parsed arguments', argv)


var SAMPLE_RATE = parseInt(argv.samplerate, 10)
var NUM_CHANNELS = parseInt(argv.channels, 10)

var files = _.uniq(argv._)

if (argv.help || !files.length) {
  if (!argv.help) {
    winston.error('No input files specified.')
  }
  winston.info('Usage: audiosprite [options] file1.mp3 file2.mp3 *.wav')
  winston.info(optimist.help())
  process.exit(1)
}

var offsetCursor = 0
var wavArgs = ['-ar', SAMPLE_RATE, '-ac', NUM_CHANNELS, '-f', 's16le']
var tempFile = mktemp('audiosprite')

winston.debug('Created temporary file', { file: tempFile })

var json = {
  resources: []
, spritemap: {}
}

spawn('ffmpeg', ['-version']).on('exit', function(code) {
  if (code) {
    winston.error('ffmpeg was not found on your path')
    process.exit(1)
  }
  if (argv.silence) {
    json.spritemap.silence = {
      start: 0
    , end: argv.silence
    , loop: true
    }
    if (!argv.autoplay) {
      json.autoplay = 'silence'
    }
    appendSilence(argv.silence + 1, tempFile, processFiles)
  } else {
    processFiles()
  }
})


function mktemp(prefix) {
  var tmpdir = require('os').tmpDir() || '.'
  return path.join(tmpdir, prefix + '.' + Math.random().toString().substr(2))
}

function spawn(name, opt) {
  winston.debug('Spawn', { cmd: [name].concat(opt).join(' ') })
  return require('child_process').spawn(name, opt)
}

function pad(num, size) {
  var str = num.toString()
  while (str.length < size) {
    str = '0' + str
  }
  return str
}

function makeRawAudioFile(src, cb) {
  var dest = mktemp('audiosprite')

  winston.debug('Start processing', { file: src})

  fs.exists(src, function(exists) {
    if (exists) {
      var ffmpeg = spawn('ffmpeg', ['-i', path.resolve(src)]
        .concat(wavArgs).concat('pipe:'))
      ffmpeg.stdout.pipe(fs.createWriteStream(dest, {flags: 'w'}))
      ffmpeg.on('exit', function(code, signal) {
        if (code) {
          return cb({
            msg: 'File could not be added',
            file: src,
            retcode: code,
            signal: signal
          })
        }
        cb(null, dest)
      })
    }
    else {
      cb({ msg: 'File does not exist', file: src })
    }
  })
}

function appendFile(name, src, dest, cb) {
  var size = 0
  var reader = fs.createReadStream(src)
  var writer = fs.createWriteStream(dest, {
    flags: 'a'
  })
  reader.on('data', function(data) {
    size += data.length
  })
  require('util').pump(reader, writer, function() {
    var duration = size / SAMPLE_RATE / NUM_CHANNELS / 2
    winston.info('File added OK', { file: src, duration: duration })
    json.spritemap[name] = {
      start: offsetCursor
    , end: offsetCursor + duration
    , loop: name === argv.autoplay
    }
    offsetCursor += duration
    appendSilence(Math.ceil(duration) - duration + 1, dest, cb)
  })
}

function appendSilence(duration, dest, cb) {
  var buffer = new Buffer(Math.round(SAMPLE_RATE * 2 * NUM_CHANNELS * duration))
  buffer.fill(null)
  var writeStream = fs.createWriteStream(dest, { flags: 'a' })
  writeStream.end(buffer)
  writeStream.on('close', function() {
    winston.info('Silence gap added', { duration: duration })
    offsetCursor += duration
    cb()
  })
}

exportFile = function(src, dest, ext, opt, store, cb) {
  var outfile = dest + '.' + ext
  spawn('ffmpeg',['-y', '-ac', NUM_CHANNELS, '-f', 's16le', '-i', src]
      .concat(opt).concat(outfile))
    .on('exit', function(code, signal) {
      if (code) {
        return cb({
          msg: 'Error exporting file',
          format: ext,
          retcode: code,
          signal: signal
        })
      }
      if (ext === 'aiff') {
        exportFileCaf(outfile, dest + '.caf', function(err) {
          if (!err && store) {
            json.resources.push(dest + '.caf')
          }
          fs.unlinkSync(outfile)
          cb()
        })
      } else {
        winston.info("Exported " + ext + " OK", { file: outfile })
        if (store) {
          json.resources.push(outfile)
        }
        cb()
      }
    })
}

function exportFileCaf(src, dest, cb) {
  if (process.platform !== 'darwin') {
    return cb(true)
  }
  spawn('afconvert', ['-f', 'caff', '-d', 'ima4', src, dest])
    .on('exit', function(code, signal) {
      if (code) {
        return cb({
          msg: 'Error exporting file',
          format: 'caf',
          retcode: code,
          signal: signal
        })
      }
      winston.info('Exported caf OK', { file: dest })
      return cb()
    })
}

function processFiles() {
  var formats = {
    aiff: []
  , ac3: '-acodec ac3'.split(' ')
  , mp3: ['-ar', SAMPLE_RATE, '-ab', '128k', '-f', 'mp3']
  , m4a: []
  , ogg: '-acodec libvorbis -f ogg'.split(' ')
  }

  if (argv.export.length) {
    formats = argv.export.split(',').reduce(function(memo, val) {
      if (formats[val]) {
        memo[val] = formats[val]
      }
      return memo
    }, {})
  }

  var rawparts = argv.rawparts.length ? argv.rawparts.split(',') : null
  var i = 0
  async.forEachSeries(files, function(file, cb) {
    i++
    makeRawAudioFile(file, function(err, tmp) {
      if (err) {
        return cb(err)
      }

      function tempProcessed() {
        fs.unlinkSync(tmp)
        cb()
      }

      var name = path.basename(file).replace(/\.[a-zA-Z0-9]+$/, '')
      appendFile(name, tmp, tempFile, function(err) {
        if (rawparts != null ? rawparts.length : void 0) {
        async.forEachSeries(rawparts, function(ext, cb) {
          winston.debug('Start export slice', { name: name, format: ext, i: i })
          exportFile(tmp, argv.output + '_' + pad(i, 3), ext, formats[ext]
            , false, cb)
          }, tempProcessed)
        } else {
          tempProcessed()
        }
      })
    })
  }, function(err) {
    if (err) {
      winston.error('Error adding file', err)
      process.exit(1)
    }
    async.forEachSeries(Object.keys(formats), function(ext, cb) {
      winston.debug('Start export', { format: ext })
      exportFile(tempFile, argv.output, ext, formats[ext], true, cb)
    }, function(err) {
      if (err) {
        winston.error('Error exporting file', err)
        process.exit(1)
      }
      if (argv.autoplay) {
        json.autoplay = argv.autoplay
      }
      var jsonfile = argv.output + '.json'
      fs.writeFileSync(jsonfile, JSON.stringify(json, null, 2))
      winston.info('Exported json OK', { file: jsonfile })
      fs.unlinkSync(tempFile)
      winston.info('All done')
    })
  })
}
