{
  "targets": [
    {
      "target_name": "rnnoise",
      "sources": [
        "addon.cc",
        "../rnnoise-src/src/denoise.c",
        "../rnnoise-src/src/kiss_fft.c",
        "../rnnoise-src/src/celt_lpc.c",
        "../rnnoise-src/src/pitch.c",
        "../rnnoise-src/src/rnn.c",
        "../rnnoise-src/src/nnet.c",
        "../rnnoise-src/src/nnet_default.c",
        "../rnnoise-src/src/parse_lpcnet_weights.c",
        "../rnnoise-src/src/rnnoise_tables.c",
        "../rnnoise-src/src/rnnoise_data.c"
      ],
      "include_dirs": [
        "../rnnoise-src/include",
        "../rnnoise-src/src"
      ],
      "defines": [
        "RNNOISE_BUILD"
      ],
      "cflags": ["-O3", "-ffast-math"],
      "cflags_cc": ["-O3", "-ffast-math"],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "Optimization": 2,
              "FavorSizeOrSpeed": 1,
              "FloatingPointModel": 2,
              "RuntimeLibrary": 2,
              "AdditionalOptions": ["/utf-8"]
            }
          }
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_OPTIMIZATION_LEVEL": "3",
            "OTHER_CFLAGS": ["-ffast-math"],
            "OTHER_CPLUSPLUSFLAGS": ["-ffast-math"]
          }
        }]
      ]
    }
  ]
}
