### What?

This is a `ffmpeg` wrapper that will take in **multiple audio files** and combine them **into a single file**. Silent gaps will be put between the parts so that every new part starts from full second and there is at least 1 second pause between every part. The final file will be exported in `mp3`, `ogg`, `ac3`, `m4a` and `caf`(IMA-ADPCM) to support as many devices as possible. This tool will also generate a `JSON` file that is compatible with [zynga/jukebox](https://github.com/zynga/jukebox) framework.

### Why?

iOS, Windows Phone and some Android phones have very limited HTML5 audio support. They only support playing single file at a time and loading in new files requires user interaction and has a big latency. To overcome this there is a technique to combine all audio into single file and only play/loop certain parts of that file. [zynga/jukebox](https://github.com/zynga/jukebox) is a audio framework that uses this technique.  [digitalfruit/limejs](https://github.com/digitalfruit/limejs) is a HTML5 game framework that includes Jukebox and lets you add audio to your games using audio sprites.

###Installation

    npm install -g audio-sprite


###Usage

    > audio-sprite --help
    info: Usage: audio-sprite [options] file1.mp3 file2.mp3 *.wav
    info: Options:
      --output, -o    Name for the output file.                             [default: "output"]
      --log, -l       Log level (debug, info, notice, warning, error).      [default: "info"]
      --autoplay, -a  Autoplay sprite name                                  [default: null]
      --silence, -s   Add special "silence" track with specified duration.  [default: 0]
      --help, -h      Show this help message.


    > audio-sprite --autoplay bg_loop --output mygameaudio bg_loop.wav *.mp3 
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


####Setting autoplay track

####Custom silent track

####Usage with [zynga/jukebox](https://github.com/zynga/jukebox) framework.

####Usage with [digitalfruit/limejs](https://github.com/digitalfruit/limejs) framework.
