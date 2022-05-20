import type { Options, DefaultOutput, HowlerOutput, Howler2Output, CreateJSOutput } from './consts';
import AudiosSpriteCreator from './AudiosSpriteCreator';

function createSprite(
  paths: Array<string>,
  options: Options,
): Promise<DefaultOutput | HowlerOutput | Howler2Output | CreateJSOutput> {
  return new Promise((resolve, reject) => {
    const creator = new AudiosSpriteCreator(paths, options);
    creator.checkFiles()
        .then(() => creator.createOutputDir())
        .then(() => creator.checkFFMpeg())
        .then(() => creator.prepare())
        .then(() => creator.processFiles())
        .then(() => creator.exportFiles())
        .then(() => creator.exportJson())
        .then(resolve, reject);
  });
}

module.exports = createSprite;
