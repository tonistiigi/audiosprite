const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const {
  OUTPUT, TMPDIR, AUDIOSPRITE_PATH, sounds, soundsTypes,
} = require('./consts');

function checkOutput(audiosprite, done) {
  let out = '';

  audiosprite.stdout.on('data', (dt) => {
    out += dt.toString('utf8');
  });

  let err = '';
  audiosprite.stderr.on('data', (dt) => {
    err += dt.toString('utf8');
  });

  audiosprite.on('exit', (code) => {
    console.log(out);

    let file; let
      stat;

    if (code) {
      assert.fail(`audiosprite returned with error code. debug = ${err}`);
    }

    const jsonFile = path.join(TMPDIR, `${OUTPUT}.json`);
    assert.ok(fs.existsSync(jsonFile), 'JSON file does not exist');

    let json;
    assert.doesNotThrow(() => {
      json = JSON.parse(fs.readFileSync(jsonFile));
    }, 'invalid json');

    console.log(json);

    // Test resources array.

    assert.ok(json.resources, 'no resources list');
    assert.ok(json.resources.length >= 4, 'not enough resources');

    json.resources.forEach((resource) => {
      file = path.join(TMPDIR, resource);
      assert.ok(fs.existsSync(file), `File not found: ${resource}`);
      stat = fs.statSync(file);
      assert.ok(stat.size > 9000, `File too small${resource}`);
    });

    // Test spritemap.

    assert.ok(json.spritemap.beep, 'beep not found in sprite');
    assert.strictEqual(json.spritemap.beep.start, 0, 'beep start time not 0');
    assert.ok(Math.abs(1.75 - json.spritemap.beep.end) < 0.05, 'beep end time not 1.77');
    assert.strictEqual(json.spritemap.beep.loop, false, 'beep should not be looping');

    assert.ok(json.spritemap.boop, 'boop not found in sprite');
    assert.strictEqual(json.spritemap.boop.start, 3, 'boop start time not 3');
    assert.ok(Math.abs(4.25 - json.spritemap.boop.end) < 0.05, 'boop end time not 4.27');
    assert.strictEqual(json.spritemap.boop.loop, true, 'boop should not be looping');

    assert.strictEqual(json.autoplay, 'boop', 'boop is not set as autoplay');

    // Test rawparts.

    file = path.join(TMPDIR, `${OUTPUT}_001.mp3`);
    assert.ok(fs.existsSync(file), 'no beep raw part file found');
    stat = fs.statSync(file);
    assert.ok(stat.size > 10000, 'beep raw part too small');

    file = path.join(TMPDIR, `${OUTPUT}_002.mp3`);
    assert.ok(fs.existsSync(file), 'no boop raw part file found');
    stat = fs.statSync(file);
    assert.ok(stat.size > 10000, 'boop raw part too small');

    done();
  });
}

function cleanTmpDir() {
  fs.readdirSync(TMPDIR).forEach((file) => {
    if (/^audiosprite/.test(file)) {
      fs.unlinkSync(path.join(TMPDIR, file));
    }
  });
}

function scriptSpawnTemplate(...soundsPaths) {
  return spawn(
    'node',
    [AUDIOSPRITE_PATH,
      '--rawparts=mp3',
      '-o',
      OUTPUT,
      '-l',
      'debug',
      '--autoplay',
      'boop',
      ...soundsPaths,
    ],
  );
}

function defaultTest(done) {
  this.timeout(10000);
  process.chdir(TMPDIR);
  const audiosprite = scriptSpawnTemplate(...sounds);
  checkOutput(audiosprite, done);
}

function wildcardTest(done) {
  this.timeout(10000);
  process.chdir(TMPDIR);
  const audiosprite = scriptSpawnTemplate(...soundsTypes);
  checkOutput(audiosprite, done);
}

module.exports = {
  cleanTmpDir,
  defaultTest,
  wildcardTest,
};
