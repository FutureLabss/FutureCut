// Type declarations for the mp4box npm package
// mp4box.js doesn't ship TypeScript types
declare module "mp4box" {
  interface MP4File {
    onReady: ((info: MP4Info) => void) | null;
    onSamples:
      | ((trackId: number, user: unknown, samples: MP4Sample[]) => void)
      | null;
    onError: ((error: Error) => void) | null;
    appendBuffer(buffer: ArrayBuffer & { fileStart: number }): number;
    start(): void;
    flush(): void;
    seek(time: number, useRAP?: boolean): { offset: number; timescale: number };
    setExtractionOptions(
      trackId: number,
      user: unknown,
      options?: { nbSamples?: number; rapAlignement?: boolean }
    ): void;
    getTrackById(id: number): MP4Track | null;
  }

  interface MP4Info {
    duration: number;
    timescale: number;
    videoTracks: MP4VideoTrack[];
    audioTracks: MP4AudioTrack[];
    tracks: MP4TrackInfo[];
  }

  interface MP4TrackInfo {
    id: number;
    type: string;
    codec: string;
    nb_samples: number;
    duration: number;
    timescale: number;
    movie_duration: number;
    movie_timescale: number;
  }

  interface MP4VideoTrack extends MP4TrackInfo {
    video: {
      width: number;
      height: number;
    };
  }

  interface MP4AudioTrack extends MP4TrackInfo {
    audio: {
      sample_rate: number;
      channel_count: number;
      sample_size: number;
    };
  }

  interface MP4Sample {
    number: number;
    track_id: number;
    timescale: number;
    description_index: number;
    description: unknown;
    data: ArrayBuffer;
    size: number;
    duration: number;
    cts: number;
    dts: number;
    is_sync: boolean;
    is_leading: number;
    depends_on: number;
    is_depended_on: number;
    has_redundancy: number;
    degradation_priority: number;
    offset: number;
    subsamples: unknown;
  }

  interface MP4Track {
    mdia?: {
      minf?: {
        stbl?: {
          stsd?: {
            entries?: Array<{
              avcC?: MP4Box;
              hvcC?: MP4Box;
              [key: string]: unknown;
            }>;
          };
        };
      };
    };
  }

  interface MP4Box {
    write(stream: DataStream): void;
  }

  class DataStream {
    constructor(
      buffer: ArrayBuffer | undefined,
      byteOffset: number,
      endianness: boolean
    );
    buffer: ArrayBuffer;
    static BIG_ENDIAN: boolean;
    static LITTLE_ENDIAN: boolean;
  }

  interface MP4BoxStatic {
    createFile(): MP4File;
    DataStream: typeof DataStream;
  }

  const MP4Box: MP4BoxStatic;
  export default MP4Box;
}
