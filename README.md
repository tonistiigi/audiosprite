[![Build Status](https://secure.travis-ci.org/tonistiigi/audiosprite.png)](http://travis-ci.org/tonistiigi/audiosprite)

### What?

This is a `ffmpeg` wrapper that will take in **multiple audio files** and combines them **into a single file**. Silent gaps will be put between the parts so that every new part starts from full second and there is at least 1 second pause between every part. The final file will be exported in `mp3`, `ogg`, `ac3`, `m4a` and `caf`(IMA-ADPCM) to support as many devices as possible. This tool will also generate a `JSON` file that is compatible with [Howler.js](https://github.com/goldfire/howler.js) or [zynga/jukebox](https://github.com/zynga/jukebox) framework.

### Why?

iOS, Windows Phone and some Android phones have very limited HTML5 audio support. They only support playing a single file at a time and loading in new files requires user interaction and has a big latency. To overcome this there is a technique to combine all audio into single file and only play/loop certain parts of that file. [zynga/jukebox](https://github.com/zynga/jukebox) is a audio framework that uses this technique.  [digitalfruit/limejs](https://github.com/digitalfruit/limejs) is a HTML5 game framework that includes Jukebox and lets you add audio to your games using audio sprites.

### Installation

#### via npm package
```
npm install -g audiosprite
```

### via github (latest)
```
npm install -g git+https://github.com/tonistiigi/audiosprite.git
```

#### Dependencies
You can install `FFmpeg` and the `ogg` codecs on OSX using `brew`:

```
brew install ffmpeg --with-theora --with-libvorbis
```

#### Hints for Windows users

- You need to install [Node.js](https://www.nodejs.org/)
- Use [Git Bash](http://git-scm.com/download/win) instead of Command Line or Powershell
- Download [ffmpeg](http://ffmpeg.zeranoe.com/builds/) and include it in your path `export PATH=$PATH:path/to/ffmpeg/bin`
- IMA-ADPCM(the fastest iPhone format) will only be generated if you are using OSX.

### Usage

```
> audiosprite --help
info: Usage: audiosprite [options] file1.mp3 file2.mp3 *.wav
info: Options:
  --output, -o          Name for the output files.                                               [default: "output"]
  --path, -u            Path for files to be used on final JSON.                                 [default: ""]
  --export, -e          Limit exported file types. Comma separated extension list.               [default: "ogg,m4a,mp3,ac3"]
  --format, -f          Format of the output JSON file (jukebox, howler, createjs).              [default: "jukebox"]
  --log, -l             Log level (debug, info, notice, warning, error).                         [default: "info"]
  --autoplay, -a        Autoplay sprite name.                                                    [default: null]
  --loop                Loop sprite name, can be passed multiple times.                          [default: null]
  --silence, -s         Add special "silence" track with specified duration.                     [default: 0]
  --gap, -g             Silence gap between sounds (in seconds).                                 [default: 1]
  --minlength, -m       Minimum sound duration (in seconds).                                     [default: 0]
  --bitrate, -b         Bit rate. Works for: ac3, mp3, mp4, m4a, ogg.                            [default: 128]
  --vbr, -v             VBR [0-9]. Works for: mp3. -1 disables VBR.                              [default: -1]
  --samplerate, -r      Sample rate.                                                             [default: 44100]
  --channels, -c        Number of channels (1=mono, 2=stereo).                                   [default: 1]
  --rawparts, -p        Include raw slices(for Web Audio API) in specified formats.              [default: ""]
  --ignorerounding, -i  Bypass sound placement on whole second boundaries (0=round,1=bypass).    [default: 0]
  --help, -h            Show this help message.


> audiosprite --autoplay bg_loop --output mygameaudio bg_loop.wav *.mp3
info: File added OK file=bg_loop.wav
info: 1.25s silence gap added OK
info: File added OK file=click.mp3
info: 1.70s silence gap added OK
info: Exported caf OK file=mygameaudio.caf
info: Exported ac3 OK file=mygameaudio.ac3
info: Exported mp3 OK file=mygameaudio.mp3
info: Exported m4a OK file=mygameaudio.m4a
info: Exported ogg OK file=mygameaudio.ogg
info: Exported json OK file=mygameaudio.json
info: All done


> cat mygameaudio.json
{
  "resources": [
    "mygameaudio.caf",
    "mygameaudio.ac3",
    "mygameaudio.mp3",
    "mygameaudio.m4a",
    "mygameaudio.ogg"
  ],
  "spritemap": {
    "bg_loop": {
      "start": 0,
      "end": 3.75,
      "loop": true
    },
    "click": {
      "start": 5,
      "end": 5.3,
      "loop": false
    }
  },
  "autoplay": "bg_loop"
}
```

### API Usage
```js
var audiosprite = require('audiosprite')

var files = ['file1.mp3', 'file2.mp3']
var opts = {output: 'result'}

audiosprite(files, opts, function(err, obj) {
  if (err) return console.error(err)

  console.log(JSON.stringify(obj, null, 2))
})
```

#### Setting autoplay track

You can use `--autoplay` option to set a track that will start playing automatically. This track is then marked as autoplay and looping in the JSON. This syntax is Jukebox framework specific.

#### Custom silent track

On some cases starting and pausing a file has bigger latency than just setting playhead position. You may get better results if your file is always playing. `--silence <duration>` option will generate extra track named *silence* that you can play instead of pausing the file.

#### Usage with [digitalfruit/limejs](https://github.com/digitalfruit/limejs) framework.

First generate LimeJS asset from the JSON file that you can require inside your code.

```
> bin/lime.py gensoy path/to/mygameaudio.json
```

Then use `AudioMap` class to play the file.

```javascript
goog.require('lime.audio.AudioMap');
goog.require('lime.ASSETS.mygameaudio.json');

var audio = new lime.audio.AudioMap(lime.ASSETS.mygameaudio.json);
...
audio.play('click');
```

*Don't forget to use the `--rawparts=mp3` option to benefit from the LimeJS feature to automatically switch to Web Audio API when it's supported by the client.*

#### Usage with [zynga/jukebox](https://github.com/zynga/jukebox) framework. (DISCONTINUED)

*NOTE: The jukebox project from Zynga has been abandoned. This section remains for reference.*

Generated JSON file can be passed straight into `jukebox.Player` constructor. Check out Jukebox documentation/demos for more info.

```javascript
var settings = {/* JSON generated by audiosprite*/};
...
// This part needs to be in user event callback.
var myPlayer = new jukebox.Player(settings);
...
myPlayer.play('click');
```
