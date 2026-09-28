import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./cms-image.service', () => ({ IMAGE_MAX_INPUT_PIXELS: 50_000_000 }));
vi.mock('node:child_process', () => ({ execFile: (_tool: string, _args: string[], _options: unknown, callback: (error: Error) => void) => callback(Object.assign(new Error('not found'), { code: 'ENOENT' })) }));
import { cmsFfmpegPosterArguments, cmsFfprobeArguments, makeCmsImageVariant, parseCmsProbeMetadata, readCmsAvMetadata, readCmsImageMetadata, validateCmsWebVtt } from './cms-media-engine';
import { sharp } from '../../lib/sharp-loader';

describe('CMS media file processing boundary', () => {
  it('passes only local files as individual arguments and disables network protocols / playlist formats', () => {
    const path = resolve('media temp', 'a & b $(echo bad).mp4');
    const args = cmsFfmpegPosterArguments(path, 3.5, resolve('poster.png'));
    expect(args[args.indexOf('-i') + 1]).toBe(path);
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file,pipe');
    expect(cmsFfprobeArguments(path)).toContain(path);
    expect(() => cmsFfprobeArguments('https://attacker.example/file.mp4')).toThrow('本地临时文件');
    expect(() => cmsFfmpegPosterArguments(path, NaN, resolve('poster.png'))).toThrow('海报时间');
  });

  it('reports the missing executable as an actionable failure without installing anything', async () => {
    await expect(readCmsAvMetadata(resolve('managed-input.mp4'))).rejects.toThrow('服务器未配置 ffprobe 可执行程序');
  });

  it.each(['\n', '\r\n', '\r'])('accepts UTF-8 VTT with %j line endings and a BOM', (newline) => {
    expect(() => validateCmsWebVtt(Buffer.from(['\uFEFFWEBVTT', '', '00:00:01.000 --> 00:00:03.500', '城市之声', ''].join(newline)))).not.toThrow();
  });

  it('rejects invalid UTF-8, reversed timestamps, partially broken cues and non-VTT input', () => {
    expect(() => validateCmsWebVtt(Buffer.from([0xff]))).toThrow('UTF-8');
    expect(() => validateCmsWebVtt(Buffer.from('WEBVTT\n\n00:03.000 --> 00:01.000\n字幕'))).toThrow('结束时间');
    expect(() => validateCmsWebVtt(Buffer.from('WEBVTT\n\n00:01.000 --> 00:03.000\n字幕\n\ninvalid --> time\n错误'))).toThrow('无效');
    expect(() => validateCmsWebVtt(Buffer.from('remote playlist https://example.com'))).toThrow('WEBVTT');
  });

  it('ignores attached cover art for audio and handles unavailable duration values', () => {
    expect(parseCmsProbeMetadata({ format: { duration: 'N/A', format_name: 'mp3' }, streams: [
      { codec_type: 'video', codec_name: 'mjpeg', width: 800, height: 800, disposition: { attached_pic: 1 } },
      { codec_type: 'audio', codec_name: 'mp3', duration: '12.75' },
    ] })).toMatchObject({ width: null, height: null, duration: 12.75, audioCodec: 'mp3', videoCodec: null });
    expect(() => parseCmsProbeMetadata({ streams: [] })).toThrow('没有有效');
  });

  it('generates bounded WebP derivatives without upscaling and reports animated image metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cms-media-test-'));
    try {
      const path = join(directory, 'input.png');
      await writeFile(path, await sharp({ create: { width: 640, height: 360, channels: 3, background: '#1677ff' } }).png().toBuffer());
      expect(await readCmsImageMetadata(path)).toMatchObject({ width: 640, height: 360, animated: false });
      const small = await makeCmsImageVariant(path, 320);
      expect(small.info).toMatchObject({ width: 320, height: 180, format: 'webp' });
      const large = await makeCmsImageVariant(path, 1440);
      expect(large.info).toMatchObject({ width: 640, height: 360, format: 'webp' });
      const animatedPath = join(directory, 'animated.gif');
      const pixels = Buffer.alloc(4 * 4 * 3 * 2, 100);
      pixels.fill(220, 4 * 4 * 3);
      await writeFile(animatedPath, await sharp(pixels, { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } }).gif({ delay: [100, 200] }).toBuffer());
      expect(await readCmsImageMetadata(animatedPath)).toMatchObject({ animated: true, duration: 0.3 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
