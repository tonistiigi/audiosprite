var assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  , spawn = require('child_process').spawn

var AUDIOSPRITE_PATH = path.join(__dirname, '../', 'cli.js')
  , OUTPUT = 'audiosprite-test-out' + ~~(Math.random() * 1e6)

var tmpdir = require('os').tmpdir() || '.'

function cleanTmpDir() {
  fs.readdirSync(tmpdir).forEach(function(file) {
    if (/^audiosprite/.test(file)) {
      fs.unlinkSync(path.join(tmpdir, file))
    }
  })
}

describe('audiosprite', function() {
  beforeEach(cleanTmpDir)
  afterEach(cleanTmpDir)

  it('generates audiosprite files', function(done) {
    this.timeout(10000)

    process.chdir(tmpdir)

    var audiosprite = spawn('node',
      [ AUDIOSPRITE_PATH
      , '--rawparts=mp3'
      , '-o'
      , OUTPUT
      , '-l'
      , 'debug'
      , '--autoplay'
      , 'boop'
      , path.join(__dirname, 'sounds/beep.mp3')
      , path.join(__dirname, 'sounds/boop.wav')
      ])
	
	  checkOutput(audiosprite, done)
  });

  it('generates audiosprite from wildcard', function(done) {
    this.timeout(10000)

    process.chdir(tmpdir)

    var audiosprite = spawn('node',
      [ AUDIOSPRITE_PATH
      , '--rawparts=mp3'
      , '-o'
      , OUTPUT
      , '-l'
      , 'debug'
      , '--autoplay'
      , 'boop'
      , path.join(__dirname, 'sounds/*.mp3')
      , path.join(__dirname, 'sounds/*.wav')
      ])
	
	  checkOutput(audiosprite, done)
  });

  function checkOutput(audiosprite, done) {
    var out = ''

    audiosprite.stdout.on('data', function(dt) {
      out += dt.toString('utf8')
    })

    var err = ''
    audiosprite.stderr.on('data', function(dt) {
      err += dt.toString('utf8')
    })


    audiosprite.on('exit', function(code, signal) {
      console.log(out)

      var file, stat;

      if (code) {
        assert.fail(code, 0, 'audiosprite returned with error code. debug = ' + err, '==');
      }

      var jsonFile = path.join(tmpdir, OUTPUT + '.json')
      assert.ok(fs.existsSync(jsonFile), 'JSON file does not exist')

      var json;
      assert.doesNotThrow(function() {
        json = JSON.parse(fs.readFileSync(jsonFile))
      }, 'invalid json')

      console.log(json)

      // Test resources array.

      assert.ok(json.resources, 'no resources list')
      assert.ok(json.resources.length >= 4, 'not enough resources')

      json.resources.forEach(function(resource) {
        file = path.join(tmpdir, resource)
        assert.ok(fs.existsSync(file), 'File not found: ' + resource)
        stat = fs.statSync(file)
        assert.ok(stat.size > 9000, 'File too small' + resource)
      })

      // Test spritemap.

      assert.ok(json.spritemap.beep, 'beep not found in sprite')
      assert.equal(json.spritemap.beep.start, 0, 'beep start time not 0')
      assert.ok(Math.abs(1.75 - json.spritemap.beep.end) < .05, 'beep end time not 1.77')
      assert.equal(json.spritemap.beep.loop, false, 'beep should not be looping')

      assert.ok(json.spritemap.boop, 'boop not found in sprite')
      assert.equal(json.spritemap.boop.start, 3, 'boop start time not 3')
      assert.ok(Math.abs(4.25 - json.spritemap.boop.end) < .05, 'boop end time not 4.27')
      assert.equal(json.spritemap.boop.loop, true, 'boop should not be looping')

      assert.equal(json.autoplay, 'boop', 'boop is not set as autoplay')

      // Test rawparts.

      file = path.join(tmpdir, OUTPUT + '_001.mp3')
      assert.ok(fs.existsSync(file), 'no beep raw part file found')
      stat = fs.statSync(file)
      assert.ok(stat.size > 10000, 'beep raw part too small')

      file = path.join(tmpdir, OUTPUT + '_002.mp3')
      assert.ok(fs.existsSync(file), 'no boop raw part file found')
      stat = fs.statSync(file)
      assert.ok(stat.size > 10000, 'boop raw part too small')

      done()
    })
  }
})
