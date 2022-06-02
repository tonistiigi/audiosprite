import type {
  Options,
  DefaultOutput, Export, HowlerOutput, Howler2Output, CreateJSOutput, HowlerSprite, CreateJSSprite,
} from './consts';
import defaultsOptions from './consts';
import path from 'path';
import fs from 'fs';
import makeDir from 'mkdirp';
import {
  spawn, ChildProcessWithoutNullStreams,
} from 'child_process';
import os from 'os';
import { getExportFormatsOptions, getPromisesChain } from './utils';

class AudiosSpriteCreator {
  files: Array<string>;
  options: Options;
  offsetCursor: number;
  json: DefaultOutput;
  rootTemp: string;
  formats: Export;

  constructor(
    paths: Array<string>,
    options: Options,
  ) {
    this.files = [...paths];
    this.options = { ...defaultsOptions, ...options };
    this.formats = getExportFormatsOptions(this.options);
    this.offsetCursor = 0;
    this.json = {
      resources: [],
      spritemap: {},
    };
  }

  get wavArgs(): (string)[] {
    return ['-ar', `${this.options.samplerate}`, '-ac', `${this.options.channels}`, '-f', 's16le'];
  }

  checkFiles(): Promise<void> {
    if (!this.files.length) return Promise.reject('No input files specified');
    return Promise.resolve();
  }

  createOutputDir(): Promise<void> {
    const outputDir = path.dirname(this.options.output);

    return new Promise((resolve) => {
      fs.stat(outputDir, (error) => {
        if (error) makeDir.sync(outputDir);
        resolve();
      })
    });
  }

  spawn(name: string, options: Array<string>): ChildProcessWithoutNullStreams {
    const { debug } = this.options.logger;
    debug('Spawn', { cmd: [name, ...options].join(' ') });

    return spawn(name, options);
  }

  checkFFMpeg(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.spawn('ffmpeg', ['-version'])
        .on('exit', (code) => {
          if (code) reject('ffmpeg was not found on your path');
          else resolve();
        });
    });
  }

  makeTemp(prefix = 'audiosprite') : string {
    const tmpdir = os.tmpdir() || '.';
    const file = path.join(tmpdir, `${prefix}.${Math.random().toString().substring(2)}`);
    this.options.logger.debug('Created temporary file', { file });

    return file;
  }

  appendSilence(duration = this.options.silence + this.options.gap, tempFile = this.rootTemp): Promise<void> {
    const { samplerate, channels, logger } = this.options;

    const buffer = Buffer.alloc(Math.round(samplerate * 2 * channels * duration));
    buffer.fill(0);
    const writeStream = fs.createWriteStream(tempFile, { flags: 'a' });
    writeStream.end(buffer);

    return new Promise((resolve) => {

      writeStream.on('close', () => {
        logger.info('Silence gap added', { duration });
        this.offsetCursor += duration;
        resolve();
      });
    });
  }

  prepare(): Promise<void> {
    this.rootTemp = this.makeTemp();
    const { silence, autoplay } = this.options;

    if (!silence) return Promise.resolve();

    this.json.spritemap.silence = {
      start: 0,
      end: this.options.silence,
      loop: true,
    };
    if (!autoplay) this.json.autoplay = 'silence';

    return this.appendSilence();
  }

  makeRawAudioFile(src: string): Promise<string> {
    const dest = this.makeTemp();
    this.options.logger.debug('Start processing', { file: src });
    const isExists = fs.existsSync(src);
    if (!isExists) return Promise.reject(`File does not exist: ${src}`);

    const ffmpeg = this.spawn('ffmpeg', ['-i', path.resolve(src), ...this.wavArgs, 'pipe:']);
    const writeStream = fs.createWriteStream(dest, { flags: 'w' });
    ffmpeg.stdout.pipe(writeStream);

    return Promise.all<void>([
      new Promise((resolve) => { writeStream.on('close', resolve); }),
      new Promise((resolve, reject) => {
        ffmpeg.on('close', (retcode, signal) => {
          if (retcode) {
            reject({
              msg: 'File could not be added', file: src, retcode, signal,
            });
          } else resolve();
        });
      }),
    ])
      .then(() => Promise.resolve(dest));
  }

  appendFile(file: string, src: string): Promise<string> {
    const name = path.basename(file).replace(/\.[a-zA-Z0-9]+$/, '');
    const {
      autoplay, loop, samplerate, channels, minlength,
    } = this.options;
    let size = 0;
    const reader = fs.createReadStream(src);
    const writer = fs.createWriteStream(this.rootTemp, { flags: 'a' });
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

        this.appendSilence(extraDuration + delta + this.options.gap, this.rootTemp)
          .then(() => resolve(src));
      });
    });
  }

  exportFileCaf(src: string, dest: string): Promise<void> {
    if (process.platform !== 'darwin') return Promise.resolve();
    return new Promise((resolve, reject) => {
      spawn('afconvert', ['-f', 'caff', '-d', 'ima4', src, dest])
        .on('exit', (code, signal) => {
          if (code) {
            reject({
              msg: 'Error exporting file',
              format: 'caf',
              retcode: code,
              signal,
            });
            return;
          }
          this.options.logger.info('Exported caf OK', { file: dest });
          resolve();
        });
    });
  }

  exportFile(src: string, dest: string, ext: string, opt: string[], store: boolean): Promise<void> {
    const outfile = `${dest}.${ext}`;

    return new Promise((resolve, reject) => {
      this.spawn('ffmpeg', ['-y', ...this.wavArgs, '-i', src, ...opt, outfile])
        .on('exit', (code, signal) => {
          if (code) {
            reject({
              msg: 'Error exporting file',
              format: ext,
              retcode: code,
              signal,
            });
            return;
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

  exportRawFiles(temp: string, index: number): Promise<void> {
    const exportPath = `${this.options.output}_${index}`;
    return getPromisesChain(
      ...this.options.rawparts
        .split(',')
        .map((ext) => (
          () => this.exportFile(temp, exportPath, ext, this.formats[ext], false)
        ))
      )
      .then(() => {
        fs.unlinkSync(temp);
        return Promise.resolve();
      })
  }

  processFile(file: string, index: number): Promise<void> {
    return this.makeRawAudioFile(file)
      .then((temp) => this.appendFile(file, temp))
      .then((temp) => this.exportRawFiles(temp, index));
  }

  processFiles(): Promise<void> {
    const promiseFunctions = this.files.map((file, index) => (() => this.processFile(file, index)));
    return getPromisesChain(...promiseFunctions);
  }

  exportFiles(): Promise<void> {
    const promiseFunctions = Object.keys(this.formats)
      .map((key) => (() => this.exportFile(this.rootTemp, this.options.output, key, this.formats[key], true)));
    return getPromisesChain(...promiseFunctions);
  }

  exportJson(): Promise<DefaultOutput | HowlerOutput | Howler2Output | CreateJSOutput> {
    fs.unlinkSync(this.rootTemp);
    if (this.options.autoplay) this.json.autoplay = this.options.autoplay;
    this.json.resources = this.json.resources
      .map((e) => (this.options.path ? path.join(this.options.path, path.basename(e)) : e));

    const { format } = this.options;

    if (format === 'createjs') {
      const audioSprite = [];
      Object.keys(this.json.spritemap).forEach((key) => {
        const spriteInfo = this.json.spritemap[key];
        const audiospriteInstance: CreateJSSprite = {
          id: key,
          startTime: spriteInfo.start * 1000,
          duration: (spriteInfo.end - spriteInfo.start) * 1000,
        };
        audioSprite.push(audiospriteInstance);
      });
      const output: CreateJSOutput = { src: this.json.resources[0], data: { audioSprite } };
      return Promise.resolve(output);
    }

    const sprite: HowlerSprite = {};
    Object.keys(this.json.spritemap).forEach((key) => {
      const spriteInfo = this.json.spritemap[key];
      sprite[key] = [
        spriteInfo.start * 1000,
        (spriteInfo.end - spriteInfo.start) * 1000,
      ];
      if (spriteInfo.loop) sprite[key].push(true);
    });

    if (format === 'howler') {
      const output: HowlerOutput = { sprite, urls: this.json.resources };
      return Promise.resolve(output);
    }

    if (format === 'howler2') {
      const output: Howler2Output = { sprite, src: this.json.resources };
      return Promise.resolve(output);
    }

    return Promise.resolve(this.json);
  }
}

export default AudiosSpriteCreator;
