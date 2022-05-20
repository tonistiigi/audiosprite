import type { Export, Options, ExportFormat } from './consts';

export function getExportFormatsOptions(options: Options): Export {
  const formats: Export = {
    aiff: [],
    wav: [],
    ac3: ['-acodec', 'ac3', '-ab', `${options.bitrate}k`],
    mp3: ['-ar', options.samplerate, '-f', 'mp3'],
    mp4: ['-ab', `${options.bitrate}k`],
    m4a: ['-ab', `${options.bitrate}k`, '-strict', '-2'],
    ogg: ['-acodec', 'libvorbis', '-f', 'ogg', '-ab', `${options.bitrate}k`],
    opus: ['-acodec', 'libopus', '-ab', `${options.bitrate}k`],
    webm: ['-acodec', 'libvorbis', '-f', 'webm', '-dash', '1'],
  };

  if (options.vbr >= 0 && options.vbr <= 9) {
    formats.mp3 = formats.mp3.concat(['-aq', options.vbr]);
  } else {
    formats.mp3 = formats.mp3.concat(['-ab', `${options.bitrate}k`]);
  }

  // change quality of webm output - https://trac.ffmpeg.org/wiki/TheoraVorbisEncodingGuide
  // eslint-disable-next-line sonarjs/no-duplicate-string
  if (options['vbr:vorbis'] >= 0 && options['vbr:vorbis'] <= 10) {
    formats.webm = formats.webm.concat(['-qscale:a', options['vbr:vorbis']]);
  } else {
    formats.webm = formats.webm.concat(['-ab', `${options.bitrate}k`]);
  }

  if (!options.export) return formats;

  const output: Export = {};

  Object.keys(formats).forEach((key: ExportFormat) => {
    if (options.export.includes(key)) output[key] = formats[key];
  })

  return output;
}

export function getPromisesChain(...promiseFunctions: Array<(() => Promise<void>)>): Promise<void> {
  return promiseFunctions.reduce((promiseChain, currentPromiseFunction) => (
    promiseChain.then(currentPromiseFunction)
), Promise.resolve())
}
