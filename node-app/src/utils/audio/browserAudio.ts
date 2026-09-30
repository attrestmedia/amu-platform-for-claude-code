/**
 * @docHint
 * @purpose 브라우저 녹음 Blob을 OpenAI input_audio 호환 mono PCM WAV로 변환
 * @process 브라우저 디코딩  채널 평균/선형 리샘플링  16-bit WAV 인코딩  AudioContext 해제
 * @domain chat-voice
 * @scope client
 */

const WAV_TARGET_SAMPLE_RATE = 16_000;
const WAV_HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeMonoPcmWav(audioBuffer: AudioBuffer, targetSampleRate: number) {
  const sourceChannels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  const targetLength = Math.max(1, Math.round(audioBuffer.duration * targetSampleRate));
  const bytesPerSample = 2;
  const wavBuffer = new ArrayBuffer(WAV_HEADER_BYTES + targetLength * bytesPerSample);
  const view = new DataView(wavBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, wavBuffer.byteLength - 8, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, targetLength * bytesPerSample, true);

  const sourceRateRatio = audioBuffer.sampleRate / targetSampleRate;
  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = Math.min(audioBuffer.length - 1, index * sourceRateRatio);
    const sourceIndex = Math.floor(sourcePosition);
    const nextSourceIndex = Math.min(audioBuffer.length - 1, sourceIndex + 1);
    const fraction = sourcePosition - sourceIndex;
    let sample = 0;

    for (const channel of sourceChannels) {
      sample += channel[sourceIndex] + (channel[nextSourceIndex] - channel[sourceIndex]) * fraction;
    }

    sample = Math.max(-1, Math.min(1, sample / Math.max(1, sourceChannels.length)));
    view.setInt16(WAV_HEADER_BYTES + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}

export async function convertRecordedAudioToWav(audioBlob: Blob) {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) throw new Error("AudioContext is unavailable");

  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(await audioBlob.arrayBuffer());
    return encodeMonoPcmWav(decoded, WAV_TARGET_SAMPLE_RATE);
  } finally {
    await context.close().catch(() => undefined);
  }
}
