/**
 * RNNoise N-API Addon
 *
 * Wraps the native RNNoise C library as a Node.js addon.
 * Exposes a single RNNoise class with create/process/destroy semantics.
 *
 * API:
 *   const addon = require('./build/Release/rnnoise.node');
 *   const rnnoise = new addon.RNNoise();
 *   const result = rnnoise.process(float32Array480);  // returns Float32Array(480)
 *   rnnoise.destroy();
 */

#include <node_api.h>
#include <string.h>
#include <stdlib.h>

extern "C" {
  #include "rnnoise.h"
}

#define RNNOISE_FRAME_SIZE 480

// ─── Error helpers ───────────────────────────────────────────────────────

#define NAPI_CALL(env, call)                                    \
  do {                                                          \
    napi_status status = (call);                                \
    if (status != napi_ok) {                                    \
      const napi_extended_error_info* error_info = NULL;        \
      napi_get_last_error_info((env), &error_info);             \
      napi_throw_error((env), NULL,                             \
        error_info->error_message ? error_info->error_message   \
                                  : "N-API call failed");       \
      return NULL;                                              \
    }                                                           \
  } while (0)

// ─── Instance data stored in the wrapped native object ───────────────────

typedef struct {
  DenoiseState* state;
  // Pre-allocated scratch buffers to avoid per-frame allocations
  float input_buf[RNNOISE_FRAME_SIZE];
  float output_buf[RNNOISE_FRAME_SIZE];
} RNNoiseInstance;

// ─── Destructor (release native resources) ───────────────────────────────

static void rnnoise_destructor(napi_env env, void* data, void* hint) {
  (void)env; (void)hint;
  RNNoiseInstance* inst = (RNNoiseInstance*)data;
  if (inst) {
    if (inst->state) {
      rnnoise_destroy(inst->state);
      inst->state = NULL;
    }
    free(inst);
  }
}

// ─── Constructor: new RNNoise() ──────────────────────────────────────────

static napi_value rnnoise_constructor(napi_env env, napi_callback_info info) {
  napi_value this_value;
  size_t argc = 0;
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, NULL, &this_value, NULL));

  RNNoiseInstance* inst = (RNNoiseInstance*)calloc(1, sizeof(RNNoiseInstance));
  if (!inst) {
    napi_throw_error(env, NULL, "Failed to allocate RNNoiseInstance");
    return NULL;
  }

  inst->state = rnnoise_create(NULL);
  if (!inst->state) {
    free(inst);
    napi_throw_error(env, NULL, "rnnoise_create() failed");
    return NULL;
  }

  NAPI_CALL(env, napi_wrap(env, this_value, inst, rnnoise_destructor, NULL, NULL));
  return this_value;
}

// ─── process(frame: Float32Array): Float32Array ──────────────────────────
//
// Input:  Float32Array of 480 floats in range [-32768, 32767] (16-bit PCM scale)
// Output: Float32Array of 480 floats in the same range (denoised)
//
// The caller is responsible for scaling to/from normalized floats.
// This matches the original rnnoise_process_frame(st, out, in) contract.

static napi_value rnnoise_process(napi_env env, napi_callback_info info) {
  napi_value this_value;
  size_t argc = 1;
  napi_value argv[1];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, &this_value, NULL));

  if (argc < 1) {
    napi_throw_type_error(env, NULL, "process() requires a Float32Array argument");
    return NULL;
  }

  // Unwrap native instance
  RNNoiseInstance* inst;
  NAPI_CALL(env, napi_unwrap(env, this_value, (void**)&inst));

  if (!inst || !inst->state) {
    napi_throw_error(env, NULL, "RNNoise instance has been destroyed");
    return NULL;
  }

  // Validate input is a TypedArray
  bool is_typedarray;
  NAPI_CALL(env, napi_is_typedarray(env, argv[0], &is_typedarray));
  if (!is_typedarray) {
    napi_throw_type_error(env, NULL, "Argument must be a Float32Array");
    return NULL;
  }

  napi_typedarray_type type;
  size_t length;
  void* data;
  NAPI_CALL(env, napi_get_typedarray_info(env, argv[0], &type, &length, &data, NULL, NULL));

  if (type != napi_float32_array) {
    napi_throw_type_error(env, NULL, "Argument must be a Float32Array");
    return NULL;
  }

  if (length != RNNOISE_FRAME_SIZE) {
    napi_throw_range_error(env, NULL, "Float32Array must have exactly 480 elements");
    return NULL;
  }

  float* input = (float*)data;

  // Copy input to scratch buffer (rnnoise may modify in place)
  memcpy(inst->input_buf, input, RNNOISE_FRAME_SIZE * sizeof(float));

  // Process — rnnoise_process_frame(state, output, input) returns VAD probability
  rnnoise_process_frame(inst->state, inst->output_buf, inst->input_buf);

  // Create output Float32Array
  napi_value array_buffer;
  void* out_data;
  NAPI_CALL(env, napi_create_arraybuffer(env, RNNOISE_FRAME_SIZE * sizeof(float), &out_data, &array_buffer));
  memcpy(out_data, inst->output_buf, RNNOISE_FRAME_SIZE * sizeof(float));

  napi_value result;
  NAPI_CALL(env, napi_create_typedarray(env, napi_float32_array, RNNOISE_FRAME_SIZE, array_buffer, 0, &result));

  return result;
}

// ─── destroy(): void ─────────────────────────────────────────────────────

static napi_value rnnoise_destroy_method(napi_env env, napi_callback_info info) {
  napi_value this_value;
  NAPI_CALL(env, napi_get_cb_info(env, info, NULL, NULL, &this_value, NULL));

  RNNoiseInstance* inst;
  NAPI_CALL(env, napi_unwrap(env, this_value, (void**)&inst));

  if (inst && inst->state) {
    rnnoise_destroy(inst->state);
    inst->state = NULL;
  }

  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

// ─── getFrameSize(): number ──────────────────────────────────────────────

static napi_value rnnoise_get_frame_size(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  NAPI_CALL(env, napi_create_int32(env, rnnoise_get_frame_size(), &result));
  return result;
}

// ─── Module initialization ──────────────────────────────────────────────

static napi_value init(napi_env env, napi_value exports) {
  // Define RNNoise class methods
  napi_property_descriptor methods[] = {
    { "process",      NULL, rnnoise_process,        NULL, NULL, NULL, napi_default, NULL },
    { "destroy",      NULL, rnnoise_destroy_method,  NULL, NULL, NULL, napi_default, NULL },
    { "getFrameSize", NULL, rnnoise_get_frame_size,  NULL, NULL, NULL, napi_default, NULL },
  };

  napi_value constructor;
  NAPI_CALL(env, napi_define_class(
    env,
    "RNNoise",
    NAPI_AUTO_LENGTH,
    rnnoise_constructor,
    NULL,
    sizeof(methods) / sizeof(methods[0]),
    methods,
    &constructor
  ));

  NAPI_CALL(env, napi_set_named_property(env, exports, "RNNoise", constructor));

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
