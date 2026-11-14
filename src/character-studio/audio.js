const clamp = x => Math.max(0, Math.min(1, x));

// Channels are measured independently: opposite-phase stereo must not cancel speech.
export function analyseAudio(channels, sampleRate, hopSeconds = .02) {
  if (!Array.isArray(channels) || !channels.length || channels.some(c => !c || c.length !== channels[0].length)) throw new TypeError('Equal-length PCM channels required');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(hopSeconds) || hopSeconds <= 0) throw new RangeError('Positive sample rate and hop required');
  const hop = Math.max(1, Math.round(hopSeconds * sampleRate)), length = channels[0].length;
  const rms = [], peaks = [];
  for (let start = 0; start < length; start += hop) {
    const end = Math.min(length, start + hop);
    let sum = 0, peak = 0;
    for (const channel of channels) for (let i = start; i < end; i++) {
      const value = Number.isFinite(channel[i]) ? channel[i] : 0;
      sum += value * value; peak = Math.max(peak, Math.abs(value));
    }
    rms.push(Math.sqrt(sum / ((end - start) * channels.length))); peaks.push(peak);
  }
  const sorted = rms.filter(v => v > .0001).sort((a,b) => a-b);
  const reference = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .9))] : 1;
  return {duration:length / sampleRate, hop:hop / sampleRate,
    levels:rms.map(value => value < .0004 ? 0 : clamp(Math.pow(value / Math.max(reference, .003), .7))), peaks};
}
export function audioLevel(analysis, time) {
  if (!analysis || time < 0 || time >= analysis.duration || !analysis.levels.length) return 0;
  const position = time / analysis.hop, left = Math.floor(position), t = position - left;
  const a = analysis.levels[Math.min(left, analysis.levels.length - 1)] ?? 0;
  const b = analysis.levels[Math.min(left + 1, analysis.levels.length - 1)] ?? 0;
  return a + (b - a) * t;
}
