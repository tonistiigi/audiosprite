const AudioSpriteCreator = require('./AudioSprite');

module.exports = function createAudioSprite(paths = [], options = {}, callback = () => {}) {
  return new Promise((resolve, reject) => {
    const audiosprite = new AudioSpriteCreator(paths, options, callback, resolve, reject);
    audiosprite.checkFiles();
    audiosprite.makeOutputDir();
    audiosprite
      .prepare()
      .then(() => audiosprite.checkFFMpeg())
      .then(() => audiosprite.create());
  });
};
