const { sync: globSync } = require('glob');
const { sync: makeDirSync } = require('mkdirp');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TEMP_FILE_PREFIX = 'audiosprite';

const defaultsOptions = {
  output: 'output',
  path: '',
  export: 'ogg,m4a,mp3,ac3',
  format: null,
  autoplay: null,
  loop: [],
  silence: 0,
  gap: 1,
  minlength: 0,
  bitrate: 128,
  vbr: -1,
  'vbr:vorbis': -1,
  samplerate: 44100,
  channels: 1,
  rawparts: '',
  ignorerounding: 0,
  logger: {
    debug() {},
    info() {},
    log() {},
  },
};

module.exports = class AudioSpriteCreator {
  constructor(
    paths = [],
    options = {},
    callback = () => {},
    resolve = () => {},
    reject = () => {},
  ) {
    this.files = AudioSpriteCreator.resolveFiles(paths);
    this.options = { ...defaultsOptions, ...options };
    this.callback = callback;
    this.resolve = resolve;
    this.reject = reject;
  }

  static resolveFiles(paths) {
    return paths
      .map((filePath) => globSync(filePath))
      .flat();
  }

  static pad(num, size) {
    let str = num.toString();
    while (str.length < size) str = `0${str}`;
    return str;
  }

  static tempProcessed(temp) {
    fs.unlinkSync(temp);
  }

  prepare() {
    this.offsetCursor = 0;
    this.wavArgs = ['-ar', this.options.samplerate, '-ac', this.options.channels, '-f', 's16le'];
    this.json = {
      resources: [],
      spritemap: {},
    };
    this.rootTemp = this.makeTemp();
    const { silence, autoplay } = this.options;

    return new Promise((resolve) => {
      if (!silence) {
        resolve();
        return;
      }
      this.json.spritemap.silence = {
        start: 0,
        end: this.options.silence,
        loop: true,
      };
      if (!autoplay) this.json.autoplay = 'silence';
      this.appendSilence().then(resolve);
    });
  }

  spawn(name, opt) {
    this.options.logger.debug('Spawn', { cmd: [name].concat(opt).join(' ') });

    return spawn(name, opt);
  }

  makeTemp(prefix = TEMP_FILE_PREFIX) {
    const tmpdir = os.tmpdir() || '.';
    const file = path.join(tmpdir, `${prefix}.${Math.random().toString().substring(2)}`);
    this.options.logger.debug('Created temporary file', { file });

    return file;
  }

  processError(errorMessage) {
    if (!errorMessage) return;

    const errorData = typeof errorMessage === 'string'
      ? errorMessage
      : JSON.stringify(errorMessage);
    const error = new Error(errorData);
    this.callback(error);
    this.reject(error);
  }

  processSuccess(data) {
    this.callback(null, data);
    this.resolve(data);
  }

  checkFiles() {
    if (!this.files.length) this.processError('No input files specified.');
  }

  makeOutputDir() {
    const outputDir = path.dirname(this.options.output);
    if (!fs.existsSync(outputDir)) makeDirSync(outputDir);
  }

  checkFFMpeg() {
    return new Promise((resolve) => {
      this.spawn('ffmpeg', ['-version']).on('exit', (code) => {
        if (code) this.processError('ffmpeg was not found on your path');
        resolve();
      });
    });
  }

  appendSilence(duration = this.options.silence + this.options.gap, tempFile = this.rootTemp) {
    return new Promise((resolve) => {
      const {
        samplerate, channels, logger,
      } = this.options;

      const buffer = Buffer.alloc(Math.round(samplerate * 2 * channels * duration));
      buffer.fill(0);
      const writeStream = fs.createWriteStream(tempFile, { flags: 'a' });
      writeStream.end(buffer);
      writeStream.on('close', () => {
        logger.info('Silence gap added', { duration });
        this.offsetCursor += duration;
        resolve();
      });
    });
  }

  create() {
    this.setFormats();
    this.processFiles()
      .then(() => this.exportFiles())
      .then(() => this.exportJson());
  }

  setFormats() {
    let formats = {
      aiff: [],
      wav: [],
      ac3: ['-acodec', 'ac3', '-ab', `${this.options.bitrate}k`],
      mp3: ['-ar', this.options.samplerate, '-f', 'mp3'],
      mp4: ['-ab', `${this.options.bitrate}k`],
      m4a: ['-ab', `${this.options.bitrate}k`, '-strict', '-2'],
      ogg: ['-acodec', 'libvorbis', '-f', 'ogg', '-ab', `${this.options.bitrate}k`],
      opus: ['-acodec', 'libopus', '-ab', `${this.options.bitrate}k`],
      webm: ['-acodec', 'libvorbis', '-f', 'webm', '-dash', '1'],
    };

    if (this.options.vbr >= 0 && this.options.vbr <= 9) {
      formats.mp3 = formats.mp3.concat(['-aq', this.options.vbr]);
    } else {
      formats.mp3 = formats.mp3.concat(['-ab', `${this.options.bitrate}k`]);
    }

    // change quality of webm output - https://trac.ffmpeg.org/wiki/TheoraVorbisEncodingGuide
    // eslint-disable-next-line sonarjs/no-duplicate-string
    if (this.options['vbr:vorbis'] >= 0 && this.options['vbr:vorbis'] <= 10) {
      formats.webm = formats.webm.concat(['-qscale:a', this.options['vbr:vorbis']]);
    } else {
      formats.webm = formats.webm.concat(['-ab', `${this.options.bitrate}k`]);
    }

    if (this.options.export.length) {
      formats = this.options.export.split(',').reduce((memo, val) => {
        // eslint-disable-next-line no-param-reassign
        if (formats[val]) memo[val] = formats[val];
        return memo;
      }, {});
    }

    this.formats = formats;
  }

  makeRawAudioFile(src) {
    const dest = this.makeTemp();
    this.options.logger.debug('Start processing', { file: src });
    const isExists = fs.existsSync(src);

    return new Promise((resolveMake, rejectMake) => {
      if (!isExists) {
        this.processError(`File does not exist: ${src}`);
        rejectMake();
      }

      let code = -1;
      let signal;
      const ffmpeg = this.spawn('ffmpeg', ['-i', path.resolve(src), ...this.wavArgs, 'pipe:']);
      const writeStream = fs.createWriteStream(dest, { flags: 'w' });
      ffmpeg.stdout.pipe(writeStream);
      Promise.all([
        new Promise((resolve) => { writeStream.on('close', resolve); }),
        new Promise((resolve) => {
          ffmpeg.on('close', (_code, _signal) => {
            code = _code;
            signal = _signal;
            resolve();
          });
        }),
      ])
        .then(() => {
          if (code) {
            this.processError({
              msg: 'File could not be added',
              file: src,
              retcode: code,
              signal,
            });
            rejectMake();
          }
          resolveMake(dest);
        });
    });
  }

  appendFile(name, src, dest) {
    const {
      autoplay, loop, samplerate, channels, minlength,
    } = this.options;
    let size = 0;
    const reader = fs.createReadStream(src);
    const writer = fs.createWriteStream(dest, { flags: 'a' });
    reader.on('data', (data) => {
      size += data.length;
    });
    reader.pipe(writer);
    return new Promise((resolve) => {
      reader.on('close', () => {
        const originalDuration = size / (samplerate * channels * 2);
        this.options.logger.info('File added OK', { file: src, duration: originalDuration });
        let extraDuration = Math.max(0, minlength - originalDuration);
        const duration = originalDuration + extraDuration;
        this.json.spritemap[name] = {
          start: this.offsetCursor,
          end: this.offsetCursor + duration,
          loop: name === autoplay || loop.includes(name),
        };
        this.offsetCursor += originalDuration;

        let delta = Math.ceil(duration) - duration;

        if (this.options.ignorerounding) {
          this.options.logger.info('Ignoring nearest second silence gap rounding');
          extraDuration = 0;
          delta = 0;
        }

        this.appendSilence(extraDuration + delta + this.options.gap, dest)
          .then(() => resolve(src));
      });
    });
  }

  exportFile(src, dest, ext, opt, store) {
    const outfile = `${dest}.${ext}`;

    return new Promise((resolve, reject) => {
      this.spawn('ffmpeg', ['-y', ...this.wavArgs, '-i', src, ...opt, outfile])
        .on('exit', (code, signal) => {
          if (code) {
            this.processError({
              msg: 'Error exporting file',
              format: ext,
              retcode: code,
              signal,
            });
            reject();
          }
          if (ext === 'aiff') {
            this.exportFileCaf(outfile, `${dest}.caf`)
              .then(
                () => {
                  if (store) this.json.resources.push(`${dest}.caf`);
                  fs.unlinkSync(outfile);
                  resolve();
                },
                reject,
              );
          } else {
            this.options.logger.info(`Exported ${ext} OK`, { file: outfile });
            if (store) this.json.resources.push(outfile);
            resolve();
          }
        });
    });
  }

  exportFileCaf(src, dest) {
    return new Promise((resolve, reject) => {
      if (process.platform !== 'darwin') resolve();

      spawn('afconvert', ['-f', 'caff', '-d', 'ima4', src, dest])
        .on('exit', (code, signal) => {
          if (code) {
            this.processError({
              msg: 'Error exporting file',
              format: 'caf',
              retcode: code,
              signal,
            });
            reject();
          }
          this.options.logger.info('Exported caf OK', { file: dest });
          resolve();
        });
    });
  }

  exportRawFiles(
    options,
    rawparts = this.options.rawparts.length ? this.options.rawparts.split(',') : null,
  ) {
    const {
      temp, path: exportPath, store,
    } = options;
    return new Promise((resolve) => {
      const ext = rawparts.shift();
      if (!ext) {
        AudioSpriteCreator.tempProcessed(temp);
        resolve();
        return;
      }
      this.exportFile(temp, exportPath, ext, this.formats[ext], store)
        .then(() => this.exportRawFiles(options, rawparts))
        .then(resolve);
    });
  }

  exportFiles(pointer = 0) {
    const keys = Object.keys(this.formats);
    const key = keys[pointer];

    return new Promise((resolve) => {
      if (!key) {
        resolve();
        return;
      }
      this.exportFile(this.rootTemp, this.options.output, key, this.formats[key], true)
        .then(() => this.exportFiles(pointer + 1))
        .then(resolve);
    });
  }

  processFiles(pointer = 0) {
    const file = this.files[pointer];
    return new Promise((resolve) => {
      if (!file) {
        resolve();
        return;
      }
      this.makeRawAudioFile(file)
        .then((temp) => {
          const name = path.basename(file).replace(/\.[a-zA-Z0-9]+$/, '');
          return this.appendFile(name, temp, this.rootTemp);
        })
        .then((temp) => (
          this.exportRawFiles({
            temp, path: `${this.options.output}_${AudioSpriteCreator.pad(pointer + 1, 3)}`, store: false,
          })
        ))
        .then(() => this.processFiles(pointer + 1))
        .then(resolve);
    });
  }

  exportJson() {
    AudioSpriteCreator.tempProcessed(this.rootTemp);
    if (this.options.autoplay) this.json.autoplay = this.options.autoplay;

    this.json.resources = this.json.resources
      .map((e) => (this.options.path ? path.join(this.options.path, path.basename(e)) : e));

    let output = {};

    switch (this.options.format) {
      case 'howler':
      case 'howler2':
        output[this.options.format === 'howler' ? 'urls' : 'src'] = [...this.json.resources];
        output.sprite = {};
        Object.keys(this.json.spritemap).forEach((key) => {
          const spriteInfo = this.json.spritemap[key];
          output.sprite[key] = [
            spriteInfo.start * 1000,
            (spriteInfo.end - spriteInfo.start) * 1000,
          ];
          if (spriteInfo.loop) output.sprite[key].push(true);
        });
        break;

      case 'createjs':
        [output.src] = this.json.resources;
        output.data = { audioSprite: [] };
        Object.keys(this.json.spritemap).forEach((key) => {
          const spriteInfo = this.json.spritemap[key];
          output.data.audioSprite.push({
            id: key,
            startTime: spriteInfo.start * 1000,
            duration: (spriteInfo.end - spriteInfo.start) * 1000,
          });
        });
        break;

      case 'default':
      default:
        output = this.json;
        break;
    }

    this.processSuccess(output);
  }
};
